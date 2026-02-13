import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const corsOrigin = [
    'http://localhost:4000',
    'http://localhost:5173',
    "http://192.168.1.12:4000",
  ]

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}
bootstrap();
