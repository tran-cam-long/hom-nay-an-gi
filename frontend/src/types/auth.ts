export interface LoginRequest {
    username: string;
    password: string;
}

export interface LogoutRequest {
    refreshToken: string;
}

export interface AuthMeResponse {
    userId: number;
    username: string;
}

export interface LoginResponse {
    userId: number;
    username: string;
    token: string;
    refreshToken: string;
}

export interface AuthSession extends AuthMeResponse {
    token: string;
    refreshToken: string | null;
}
