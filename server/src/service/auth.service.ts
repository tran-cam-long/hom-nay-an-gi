import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LoginRequest } from '../dto/login.request';
import { LogoutRequest } from 'src/dto/logout.request';
import { RegisterRequest } from 'src/dto/register.request';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly backendUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService,
  ) {
    const backendUrl = this.configService.get<string>('BACKEND_URL');

    if (!backendUrl) {
      throw new Error('BACKEND_URL is not configured');
    }

    this.backendUrl = backendUrl;
  }

  async login(req: LoginRequest): Promise<any> {
    const url = `${this.backendUrl}/api/auth/login`;

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
    const url = `${this.backendUrl}/api/auth/logout`;

    const response = await firstValueFrom(
      this.http.post(url, req, {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    this.logger.log(`Logout response: ${JSON.stringify(response.data)}`);
    // or console.log(response.data);

    return response.data;
  }

  async register(req: RegisterRequest): Promise<void> {
    const url = `${this.backendUrl}/api/auth/register`;

    const response = await firstValueFrom(
      this.http.post(url, req, {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    this.logger.log(`Register successfully, status: ${response.status}`);

    return;
  }
}
