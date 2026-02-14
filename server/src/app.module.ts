import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpModule } from '@nestjs/axios/dist/http.module';
import { AuthController } from './controller/auth.controller';
import { AuthService } from './service/auth.service';
import { ConfigModule } from '@nestjs/config';
import { DishChoiceController } from './controller/dishchoice.controller';
import { DishChoiceService } from './service/dishchoice.service';

@Module({
  imports: [
    HttpModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        ".env.local",
        ".env",
        "server/.env.local",
        "server/.env",
      ],
    }),
  ],
  controllers: [AppController, AuthController, DishChoiceController],
  providers: [AppService, AuthService, DishChoiceService],
})
export class AppModule {}
