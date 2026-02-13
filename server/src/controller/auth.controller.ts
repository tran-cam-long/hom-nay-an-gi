import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from '../service/auth.service';
import { LoginRequest } from '../dto/login.request';
import { LogoutRequest } from 'src/dto/logout.request';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginRequest) {
    return this.authService.login(body);
  }

  @Post('logout')
  async logout(@Body() body: LogoutRequest) {
    return this.authService.logout(body);
  }
}