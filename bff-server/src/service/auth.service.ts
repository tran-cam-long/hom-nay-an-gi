import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LoginRequest } from '../dto/loginrequest.dto';
import { AuthResponse } from '../dto/authresponse.dto';

const BASE_URL = 'http://localhost:8100/api/auth';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name); // Should make this a singleton

  constructor(private readonly http: HttpService) {}

  async login(req: LoginRequest): Promise<AuthResponse> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(BASE_URL + '/login', req, {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { accessToken } = response.data;

    this.logger.log(`Access token: ${accessToken}`);

    return response.data;
  }
}
