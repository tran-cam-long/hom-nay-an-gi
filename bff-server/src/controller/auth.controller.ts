import { Body, Controller, Post } from '@nestjs/common';
import { LoginRequest } from 'src/dto/loginrequest.dto';
import { AuthService } from 'src/service/auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: LoginRequest) {
    return this.authService.login(body);
  }
}
