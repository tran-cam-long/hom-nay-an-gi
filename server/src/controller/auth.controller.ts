import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../service/auth.service';
import { LoginRequest } from '../dto/login.request';
import { LogoutRequest } from 'src/dto/logout.request';
import { RegisterRequest } from 'src/dto/register.request';

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

  @Post('register')
  async register(@Body() body: RegisterRequest) {
    return this.authService.register(body);
  }

  @Get('me')
  async me(@Headers('authorization') authorization?: string) {
    if (!authorization || !authorization.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('Missing or invalid bearer token');
    }

    const accessToken = authorization.slice(7).trim();
    if (!accessToken) {
      throw new UnauthorizedException('Missing access token');
    }

    return this.authService.me(accessToken);
  }
}
