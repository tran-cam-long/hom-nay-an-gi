export interface LoginRequest {
    username: string;
    password: string;
}

export interface LogoutRequest {
    refreshToken: string;
}

export interface LoginResponse {
    userId: number;
    username: string;
    token: string;
    refreshToken: string;
}