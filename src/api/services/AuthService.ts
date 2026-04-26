// Auto-generated from backend/openapi.yaml — do not edit manually.
import { OpenAPI } from '../core/OpenAPI';
import { request } from '../core/request';
import type { AuthTokens, Credentials, RefreshTokenRequest } from '../models';

export class AuthService {
  static register(body: Credentials): Promise<AuthTokens> {
    return request(OpenAPI, { method: 'POST', url: '/api/auth/register', body });
  }

  static login(body: Credentials): Promise<AuthTokens> {
    return request(OpenAPI, { method: 'POST', url: '/api/auth/login', body });
  }

  static refreshToken(body: RefreshTokenRequest): Promise<AuthTokens> {
    return request(OpenAPI, { method: 'POST', url: '/api/auth/refresh', body });
  }

  static logout(body: RefreshTokenRequest): Promise<void> {
    return request(OpenAPI, { method: 'POST', url: '/api/auth/logout', body });
  }
}
