import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LoginRequest } from '../dto/login.request';

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
}
