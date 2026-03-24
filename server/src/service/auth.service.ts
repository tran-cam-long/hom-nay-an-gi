import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LoginRequest } from '../dto/login.request';
import { LogoutRequest } from 'src/dto/logout.request';
import { RegisterRequest } from 'src/dto/register.request';
import { ConfigService } from '@nestjs/config';

type AuthMeResponse = {
  userId: number;
  username: string;
};

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

    // assuming Java returns: { token: string, refreshToken?: string, ... }
    const { token } = response.data.token;

    this.logger.log(`Access token: ${token}`);
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

  async me(accessToken: string): Promise<AuthMeResponse> {
    const url = `${this.backendUrl}/api/auth/me`;

    const response = await firstValueFrom(
      this.http.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }),
    );

    return this.normalizeAuthMeResponse(response.data);
  }

  private normalizeAuthMeResponse(payload: unknown): AuthMeResponse {
    const data = (payload ?? {}) as Record<string, unknown>;
    const nestedUser = this.asRecord(data.user);

    const userId =
      this.asNumber(data.userId) ??
      this.asNumber(data.id) ??
      this.asNumber(nestedUser?.userId) ??
      this.asNumber(nestedUser?.id);
    const username =
      this.asString(data.username) ??
      this.asString(data.userName) ??
      this.asString(nestedUser?.username) ??
      this.asString(nestedUser?.userName);

    if (userId === null || username === null) {
      throw new Error('Upstream /api/auth/me returned an unexpected payload');
    }

    return { userId, username };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return null;
  }

  private asNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return null;
  }

  private asString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    return null;
  }
}
