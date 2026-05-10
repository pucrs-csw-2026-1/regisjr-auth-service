import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenResponse } from './dto/token.response';

@Injectable()
export class AuthService {
  private readonly keycloakUrl: string;
  private readonly realm: string;
  private readonly clientId: string;
  private readonly saClientId: string;
  private readonly saClientSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    this.keycloakUrl = this.config.getOrThrow<string>('keycloak.url');
    this.realm = this.config.getOrThrow<string>('keycloak.realm');
    this.clientId = this.config.getOrThrow<string>('keycloak.clientId');
    this.saClientId = this.config.getOrThrow<string>('keycloak.saClientId');
    this.saClientSecret = this.config.getOrThrow<string>('keycloak.saClientSecret');
  }

  async register(dto: RegisterDto): Promise<TokenResponse> {
    const saToken = await this.getServiceAccountToken();

    const [firstName, ...rest] = dto.name.trim().split(' ');
    const lastName = rest.join(' ');

    const res = await fetch(
      `${this.keycloakUrl}/admin/realms/${this.realm}/users`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${saToken}`,
        },
        body: JSON.stringify({
          username: dto.username,
          email: dto.email,
          firstName,
          lastName,
          emailVerified: true,
          enabled: true,
          credentials: [
            { type: 'password', value: dto.password, temporary: false },
          ],
        }),
      },
    );

    if (res.status === 409) {
      throw new ConflictException('Username or email already in use');
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, string>;
      throw new BadRequestException(
        body['errorMessage'] ?? body['error_description'] ?? 'Failed to create user',
      );
    }

    const tokens = await this.login({ username: dto.username, password: dto.password });

    const keycloakUserId = this.extractSub(tokens.access_token);
    await this.usersService.createProfile({ keycloakUserId, name: dto.name, email: dto.email });

    return tokens;
  }

  async login(dto: LoginDto): Promise<TokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: this.clientId,
      username: dto.username,
      password: dto.password,
    });

    const res = await fetch(this.tokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (res.status === 401 || res.status === 400) {
      const body = await res.json().catch(() => ({})) as Record<string, string>;
      throw new UnauthorizedException(
        body['error_description'] ?? 'Invalid credentials',
      );
    }

    if (!res.ok) {
      throw new InternalServerErrorException('Authentication service error');
    }

    return res.json() as Promise<TokenResponse>;
  }

  async refresh(dto: RefreshDto): Promise<TokenResponse> {
    if (!dto.refresh_token) {
      throw new BadRequestException('No refresh token provided');
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      refresh_token: dto.refresh_token,
    });

    const res = await fetch(this.tokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (res.status === 400 || res.status === 401) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    if (!res.ok) {
      throw new InternalServerErrorException('Authentication service error');
    }

    return res.json() as Promise<TokenResponse>;
  }

  async logout(dto: LogoutDto): Promise<void> {
    if (!dto.refresh_token) {
      throw new BadRequestException('No refresh token provided');
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      refresh_token: dto.refresh_token,
    });

    const res = await fetch(
      `${this.keycloakUrl}/realms/${this.realm}/protocol/openid-connect/logout`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      },
    );

    // 204 = success, 400 = token already expired/invalid — both are acceptable on logout
    if (!res.ok && res.status !== 400) {
      throw new InternalServerErrorException('Failed to logout');
    }
  }

  // ── private ───────────────────────────────────────────────────────────────────

  private async getServiceAccountToken(): Promise<string> {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.saClientId,
      client_secret: this.saClientSecret,
    });

    const res = await fetch(this.tokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!res.ok) {
      throw new InternalServerErrorException(
        'Could not authenticate service account',
      );
    }

    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }

  private tokenUrl(): string {
    return `${this.keycloakUrl}/realms/${this.realm}/protocol/openid-connect/token`;
  }

  private extractSub(accessToken: string): string {
    const payload = accessToken.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub: string };
    return decoded.sub;
  }
}
