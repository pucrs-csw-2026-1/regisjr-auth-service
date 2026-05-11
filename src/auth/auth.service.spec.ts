import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

const makeConfigService = (): ConfigService =>
  ({
    getOrThrow: jest.fn((key: string) => {
      const map: Record<string, string> = {
        'keycloak.url': 'http://keycloak:8080',
        'keycloak.realm': 'event-system',
        'keycloak.clientId': 'nest-api',
        'keycloak.saClientId': 'nest-api-sa',
        'keycloak.saClientSecret': 'nest-api-sa-secret',
      };
      if (!(key in map)) throw new Error(`Missing config: ${key}`);
      return map[key];
    }),
  }) as unknown as ConfigService;

const mockFetchOk = (body: unknown, status = 200): jest.SpyInstance =>
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);

const mockFetchStatus = (status: number, body: unknown = {}): jest.SpyInstance =>
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as Response);

const makeJwt = (sub: string): string => {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub, exp: 9999999999 })).toString('base64url');
  return `${header}.${payload}.fake-signature`;
};

const SA_TOKEN = { access_token: 'sa-token' };
const TOKENS = {
  access_token: makeJwt('kc-user-id-123'),
  refresh_token: 'refresh-token',
  expires_in: 300,
  token_type: 'Bearer',
};

const makeUsersService = (): jest.Mocked<Pick<UsersService, 'createProfile'>> => ({
  createProfile: jest.fn().mockResolvedValue({}),
});

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<Pick<UsersService, 'createProfile'>>;

  beforeEach(() => {
    usersService = makeUsersService();
    service = new AuthService(makeConfigService(), usersService as unknown as UsersService);
  });

  afterEach(() => jest.restoreAllMocks());

  // ── register ────────────────────────────────────────────────────────────────

  describe('register', () => {
    it('creates user in Keycloak and returns tokens', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(SA_TOKEN) } as Response) // SA token
        .mockResolvedValueOnce({ ok: true, status: 201, json: () => Promise.resolve({}) } as Response) // create user
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(TOKENS) } as Response); // login

      const result = await service.register({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        username: 'ada',
        password: 'secret123',
      });

      expect(result.access_token).toBe(TOKENS.access_token);
      expect(result.refresh_token).toBe(TOKENS.refresh_token);
    });

    it('splits multi-word name into firstName and lastName', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(SA_TOKEN) } as Response)
        .mockResolvedValueOnce({ ok: true, status: 201, json: () => Promise.resolve({}) } as Response)
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(TOKENS) } as Response);

      await service.register({
        name: 'Charles Robert Babbage',
        email: 'charles@example.com',
        username: 'charles',
        password: 'secret123',
      });

      const createUserCall = (global.fetch as jest.Mock).mock.calls[1];
      const body = JSON.parse(createUserCall[1].body as string);
      expect(body.firstName).toBe('Charles');
      expect(body.lastName).toBe('Robert Babbage');
    });

    it('sends emailVerified=true and enabled=true', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(SA_TOKEN) } as Response)
        .mockResolvedValueOnce({ ok: true, status: 201, json: () => Promise.resolve({}) } as Response)
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(TOKENS) } as Response);

      await service.register({ name: 'Ada', email: 'a@b.com', username: 'ada', password: 'pass123' });

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body as string);
      expect(body.emailVerified).toBe(true);
      expect(body.enabled).toBe(true);
    });

    it('throws ConflictException when Keycloak returns 409', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(SA_TOKEN) } as Response)
        .mockResolvedValueOnce({ ok: false, status: 409, json: () => Promise.resolve({}) } as Response);

      await expect(
        service.register({ name: 'Ada', email: 'ada@example.com', username: 'ada', password: 'pass123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException with Keycloak errorMessage on 400', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(SA_TOKEN) } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ errorMessage: 'Password policy not met' }),
        } as Response);

      await expect(
        service.register({ name: 'Ada', email: 'ada@example.com', username: 'ada', password: 'pass123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a DynamoDB profile with keycloakUserId extracted from access_token', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(SA_TOKEN) } as Response)
        .mockResolvedValueOnce({ ok: true, status: 201, json: () => Promise.resolve({}) } as Response)
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(TOKENS) } as Response);

      await service.register({ name: 'Ada Lovelace', email: 'ada@example.com', username: 'ada', password: 'pass123' });

      expect(usersService.createProfile).toHaveBeenCalledWith({
        keycloakUserId: expect.any(String),
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      });
    });

    it('throws InternalServerErrorException when service account auth fails', async () => {
      mockFetchStatus(500);

      await expect(
        service.register({ name: 'Ada', email: 'ada@example.com', username: 'ada', password: 'pass123' }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ── login ───────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns tokens on valid credentials', async () => {
      mockFetchOk(TOKENS);

      const result = await service.login({ username: 'ada', password: 'secret123' });

      expect(result.access_token).toBe(TOKENS.access_token);
      expect(result.refresh_token).toBe(TOKENS.refresh_token);
    });

    it('uses password grant with correct params', async () => {
      const spy = mockFetchOk(TOKENS);

      await service.login({ username: 'ada', password: 'secret123' });

      const body = new URLSearchParams(spy.mock.calls[0][1].body as string);
      expect(body.get('grant_type')).toBe('password');
      expect(body.get('client_id')).toBe('nest-api');
      expect(body.get('username')).toBe('ada');
      expect(body.get('password')).toBe('secret123');
    });

    it('throws UnauthorizedException with error_description on 401', async () => {
      mockFetchStatus(401, { error_description: 'Invalid user credentials' });

      await expect(service.login({ username: 'bad', password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException on 400', async () => {
      mockFetchStatus(400, { error_description: 'Account is disabled' });

      await expect(service.login({ username: 'ada', password: 'secret123' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws InternalServerErrorException on unexpected Keycloak error', async () => {
      mockFetchStatus(503);

      await expect(service.login({ username: 'ada', password: 'secret123' })).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ── refresh ─────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('returns new tokens on valid refresh token', async () => {
      mockFetchOk(TOKENS);

      const result = await service.refresh({ refresh_token: 'valid-refresh' });

      expect(result.access_token).toBe(TOKENS.access_token);
    });

    it('uses refresh_token grant with correct params', async () => {
      const spy = mockFetchOk(TOKENS);

      await service.refresh({ refresh_token: 'valid-refresh' });

      const body = new URLSearchParams(spy.mock.calls[0][1].body as string);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('client_id')).toBe('nest-api');
      expect(body.get('refresh_token')).toBe('valid-refresh');
    });

    it('throws BadRequestException when refresh_token is not provided', async () => {
      const spy = jest.spyOn(global, 'fetch');
      await expect(service.refresh({})).rejects.toThrow(BadRequestException);
      expect(spy).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when refresh token is expired (401)', async () => {
      mockFetchStatus(401);

      await expect(service.refresh({ refresh_token: 'expired' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when refresh token is invalid (400)', async () => {
      mockFetchStatus(400);

      await expect(service.refresh({ refresh_token: 'invalid' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws InternalServerErrorException on unexpected Keycloak error', async () => {
      mockFetchStatus(500);

      await expect(service.refresh({ refresh_token: 'valid-refresh' })).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ── logout ──────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('resolves without error on successful revocation', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) } as Response);

      await expect(service.logout({ refresh_token: 'valid-refresh' })).resolves.toBeUndefined();
    });

    it('sends refresh_token to Keycloak logout endpoint', async () => {
      const spy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) } as Response);

      await service.logout({ refresh_token: 'my-refresh' });

      const [url, opts] = spy.mock.calls[0];
      expect(url as string).toContain('/protocol/openid-connect/logout');
      const body = new URLSearchParams(opts!.body as string);
      expect(body.get('refresh_token')).toBe('my-refresh');
    });

    it('resolves even when Keycloak returns 400 (token already expired)', async () => {
      mockFetchStatus(400);

      await expect(service.logout({ refresh_token: 'expired' })).resolves.toBeUndefined();
    });

    it('throws BadRequestException when refresh_token is not provided', async () => {
      const spy = jest.spyOn(global, 'fetch');
      await expect(service.logout({})).rejects.toThrow(BadRequestException);
      expect(spy).not.toHaveBeenCalled();
    });

    it('throws InternalServerErrorException on unexpected Keycloak error', async () => {
      mockFetchStatus(500);

      await expect(service.logout({ refresh_token: 'valid-refresh' })).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
