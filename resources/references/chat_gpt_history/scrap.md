Plan: Add Docker test tasks, DB mapping, CSV loader
TL;DR — Add Docker Compose Gradle tasks and point them to cd/docker/docker-compose-local.yml; confirm/change Swagger UI credentials in the app YAMLs; ensure BaseEntity uses JPA auditing (or add it); change LocationEntity to store JSON columns as jsonb via hibernate-types-52 and make id generation automatic; add a short CsvLocationReader that uses Jackson CsvMapper + MapStruct to persist CSV rows. Below are the exact edits to perform and the minimal inline snippets to copy into the repo.
Steps
Add Docker Compose Gradle plugin and tasks in build.gradle (plugins + dockerCompose config) to run cd/docker/docker-compose-local.yml.
Add startTestEnvironment / stopTestEnvironment tasks that call the plugin tasks composeUp / composeDown and expose dependsOn/finalizedBy.
Inspect src/main/resources/application-local.yaml and src/main/resources/application-private.yaml for Swagger/Security credentials; update spring.security.user.* there if present.
Open src/main/java/.../outbound/db/entities/BaseEntity.java; if it lacks auditing fields, replace with @MappedSuperclass + @EntityListeners(AuditingEntityListener.class) and add createdAt/createdBy/updatedAt/updatedBy. Enable auditing in HomnayangiApplication.
Modify LocationEntity to add @TypeDef for JsonType, mark JSON/list fields with @Type(type = "json") and choose @GeneratedValue strategy (IDENTITY recommended for Postgres simplicity). Add required Gradle dependencies (hibernate-types-52, MapStruct, Jackson CSV).
Add CsvLocationReader (a CommandLineRunner or test) using CsvMapper to parse src/main/resources/locations/csv/1.csv, map rows to Location domain objects, use a MapStruct LocationMapper to convert to LocationEntity, and save with LocationRepository. Provide small helper methods to parse JSON columns and point coordinates.
What to edit and exact Groovy snippets (copy inline into build.gradle)
Add plugin (top of build.gradle, use plugins DSL):
id "com.avast.gradle.docker-compose" version "0.14.8"
Configure the dockerCompose extension (place near other plugin configs, e.g., after plugins { ... } or inside buildscript-configured block):
dockerCompose { useComposeFiles = [ file('cd/docker/docker-compose-local.yml') ] removeVolumes = false }
Add tasks for convenience (put near other tasks in build.gradle):
task startTestEnvironment { group = 'docker' description = 'Start docker-compose test environment' dependsOn 'composeUp' }
task stopTestEnvironment { group = 'docker' description = 'Stop docker-compose test environment' finalizedBy 'composeDown' }
How to run:
Start: ./gradlew startTestEnvironment
Stop: ./gradlew stopTestEnvironment
Notes: If your build.gradle uses the older buildscript {} style, add the plugin in buildscript classpath and apply plugin: 'com.avast.gradle.docker-compose' instead of the plugins DSL.
Where to point cd/docker/docker-compose-local.yml to compose tasks
Ensure the dockerCompose.useComposeFiles set above points to the exact file path: file('cd/docker/docker-compose-local.yml'). That makes plugin commands composeUp/composeDown operate on that compose file.
Swagger UI credentials — where to find and change them
Search these files for credential keys: src/main/resources/application-local.yaml, src/main/resources/application-private.yaml, and any application-*.yml under src/main/resources. Look for:
spring.security.user.name and spring.security.user.password
springdoc.swagger-ui.* or springdoc.api-docs.* (if custom)
Typical editable lines to set initial Swagger UI Basic Auth:
spring.security.user.name: admin
spring.security.user.password: secret
If no spring.security.user.* is found, the app may use a custom Security config. Search @Configuration classes under src/main/java/com/camlong/homnayangi for WebSecurityConfigurerAdapter/SecurityFilterChain to find the default credentials or the login mechanism.
Where to change: prefer src/main/resources/application-private.yaml for production secrets or application-local.yaml for local dev; update the spring.security.user.* keys there.
BaseEntity: confirm or add auditing base class
Confirm: src/main/java/com/camlong/homnayangi/outbound/db/entities/BaseEntity.java exists in the repo. Open it and check for fields:
createdAt (Instant/OffsetDateTime), createdBy (String), updatedAt, updatedBy.
@MappedSuperclass and @EntityListeners(AuditingEntityListener.class) should be present.
If missing or incomplete — replace/add with (inline snippet to copy into BaseEntity.java — same package as current file):
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class BaseEntity {
@CreatedDate private Instant createdAt;
@CreatedBy private String createdBy;
@LastModifiedDate private Instant updatedAt;
@LastModifiedBy private String updatedBy;
}
Enable JPA auditing: in HomnayangiApplication add @EnableJpaAuditing(auditorAwareRef = "auditorProvider") (import from org.springframework.data.jpa.repository.config.EnableJpaAuditing), and provide a bean:
@Bean AuditorAware<String> auditorProvider() { return () -> Optional.of("system"); }
Note: Replace "system" with a real principal lookup if you have security context. Use Optional.ofNullable(SecurityContextHolder.getContext().getAuthentication()...) for a real auditor.
JSONB mapping and ID generation for LocationEntity
Add the Hibernate Types dependency (Gradle lines to add under dependencies in build.gradle):
implementation 'com.vladmihalcea:hibernate-types-52:2.21.1'
Annotate LocationEntity (file at src/main/java/com/camlong/homnayangi/outbound/db/entities/LocationEntity.java) — key changes:
Add top-level @TypeDef(name = "json", typeClass = com.vladmihalcea.hibernate.type.json.JsonType.class) (or @TypeDefs if multiple).
For each JSON/list field (for example List<GoogleSource> googleSources or Map<String,Object> properties) add @Type(type = "json") and @Column(columnDefinition = "jsonb").
Example inline annotations:
@Type(type = "json")
@Column(name = "sources", columnDefinition = "jsonb")
private List<GoogleSource> sources;
ID generation: recommended (Postgres)
Simpler: @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id; — minimal config, no flyway changes required.
Sequence option: if you prefer sequences, add:
@SequenceGenerator(name = "location_seq", sequenceName = "location_seq", allocationSize = 1)
@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "location_seq")
Flyway SQL example to create sequence (if you choose sequence) — add to src/main/resources/db/migration/V2__create_location_seq.sql:
CREATE SEQUENCE IF NOT EXISTS location_seq START 1;
Important: For JSON support ensure the DB is PostgreSQL and the column type is jsonb. If using H2 for tests, add compatibility or use text columns for tests.
Gradle dependencies to add (exact lines for build.gradle dependency block)
implementation 'com.vladmihalcea:hibernate-types-52:2.21.1'
implementation 'com.fasterxml.jackson.dataformat:jackson-dataformat-csv:2.14.2'
implementation 'org.mapstruct:mapstruct:1.5.5.Final'
annotationProcessor 'org.mapstruct:mapstruct-processor:1.5.5.Final'
If using Lombok in the project, keep its annotationProcessor lines (check existing build.gradle).
(Optional) Jackson databind if not already present: implementation 'com.fasterxml.jackson.core:jackson-databind:2.14.2'
How to trigger MapStruct generation:
Run ./gradlew clean compileJava (annotation processing runs during compileJava); MapStruct generated mappers appear under build/generated.
CsvLocationReader + MapStruct mapper (files to add)
Add CsvLocationReader (suggested package com.camlong.homnayangi.inbound.cron or inbound.apis):
Implement as a Spring @Component that implements CommandLineRunner (or create a test runner).
Use com.fasterxml.jackson.dataformat.csv.CsvMapper + CsvSchema to read the CSV file classpath:locations/csv/1.csv.
For JSON columns in the CSV (e.g., a column that contains JSON arrays/objects), parse with ObjectMapper.readValue(columnValue, new TypeReference<List<GoogleSource>>() {}) and handle empty/blank values.
Create Location domain instances (com.camlong.homnayangi.application.domain.models.Location) and fill fields.
Use a MapStruct mapper interface LocationMapper (package com.camlong.homnayangi.application.domain.mappers) with mapping method LocationEntity toEntity(Location l).
Save with LocationRepository extends JpaRepository<LocationEntity,Long>.
Minimal MapStruct mapper interface example (copy into src/main/java/com/camlong/homnayangi/...):
@Mapper(componentModel = "spring") public interface LocationMapper { LocationEntity toEntity(Location domain); }
Helper for point parsing: add a static util method to parse "lat,lon" or {"lat":..., "lon":...} into whatever entity field type you use (e.g., Double latitude and Double longitude) — MapStruct can call @Mapping(target="latitude", expression="java(parseLat(row.getPoint()))").
Edge-case handling in reader:
Skip/skip-empty rows (blank lines).
When JSON column is empty, treat as Collections.emptyList() or null based on DB mapping.
Handle CSV quoting and embedded commas.
Validate coordinates: null/invalid numbers -> skip or log & set null.
Transactional save and batch inserts to avoid large memory usage.
Example commands to run/generate and run the reader
Start docker compose environment: ./gradlew startTestEnvironment
Build & generate MapStruct: ./gradlew clean compileJava
Run app locally (to execute CommandLineRunner): ./gradlew bootRun --args='--spring.profiles.active=local'
Or run a focused test that executes the reader: ./gradlew test --tests *CsvLocationReaderTest
Quality gates checklist & commands
Build: ./gradlew clean build — PASS if build completes.
Lint / typecheck: if using check or detekt/spotbugs run ./gradlew check — PASS if zero failures.
Start test env + smoke reader:
./gradlew startTestEnvironment
./gradlew bootRun or ./gradlew test --tests *CsvLocationReaderTest
./gradlew stopTestEnvironment
Verify DB rows inserted (via psql or service health endpoints).
Further Considerations
Which DB for tests? Option A: Postgres (recommended for jsonb support). Option B: H2 – requires JSON emulation or storing as text. Which do you prefer?
Auditing details: Do you want real AuditorAware with Spring Security or a simple "system" placeholder?
CSV schema: confirm which CSV columns are JSON objects/arrays and their exact names; I can produce a precise CsvSchema for 1.csv if you want — send its content or I can read it from the repo.
Pause here — this is a draft plan. Tell me which options you prefer (Postgres vs H2 for tests; real auditor vs placeholder; where to place the MapStruct mapper), and I will produce the exact file-level patches you can copy into build.gradle and the Java files with exact imports and package lines.