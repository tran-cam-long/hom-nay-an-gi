import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LoginRequest } from '../dto/login.request';
import { LogoutRequest } from 'src/dto/logout.request';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly http: HttpService) {}

  async login(req: LoginRequest): Promise<any> {
    const url = 'http://localhost:8100/homnayangi-service/api/auth/login'; // adjust to your Java service

    const response = await firstValueFrom(
      this.http.post(url, req, {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    // assuming Java returns: { accessToken: string, refreshToken?: string, ... }
    const { accessToken } = response.data.token;

    this.logger.log(`Access token: ${accessToken}`);
    // or console.log(accessToken);

    return response.data;
  }

  async logout(req: LogoutRequest): Promise<any> {
    const url = 'http://localhost:8100/homnayangi-service/api/auth/logout'; // adjust to your Java service

    const response = await firstValueFrom(
      this.http.post(url, req, {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    this.logger.log(`Logout response: ${JSON.stringify(response.data)}`);
    // or console.log(response.data);

    return response.data;
  }
}
