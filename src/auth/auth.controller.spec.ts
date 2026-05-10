import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthenticatedUser } from './types';

const TOKENS = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_in: 300,
  token_type: 'Bearer',
};

const makeRes = (): jest.Mocked<Pick<Response, 'cookie' | 'clearCookie'>> => ({
  cookie: jest.fn(),
  clearCookie: jest.fn(),
});

const makeReq = (cookies: Record<string, string> = {}): Partial<Request> => ({
  cookies,
});

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
            refresh: jest.fn(),
            logout: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(AuthController);
    authService = module.get(AuthService);
  });

  // ── register ────────────────────────────────────────────────────────────────

  describe('register', () => {
    const dto: RegisterDto = {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      username: 'ada',
      password: 'secret123',
    };

    it('returns tokens from authService', async () => {
      authService.register.mockResolvedValue(TOKENS);
      const res = makeRes();

      const result = await controller.register(dto, res as unknown as Response);

      expect(result).toEqual(TOKENS);
      expect(authService.register).toHaveBeenCalledWith(dto);
    });

    it('sets httpOnly refresh_token cookie on success', async () => {
      authService.register.mockResolvedValue(TOKENS);
      const res = makeRes();

      await controller.register(dto, res as unknown as Response);

      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-token',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('does not set cookie when authService throws', async () => {
      authService.register.mockRejectedValue(new UnauthorizedException());
      const res = makeRes();

      await expect(controller.register(dto, res as unknown as Response)).rejects.toThrow();
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  // ── login ───────────────────────────────────────────────────────────────────

  describe('login', () => {
    const dto: LoginDto = { username: 'ada', password: 'secret123' };

    it('returns tokens from authService', async () => {
      authService.login.mockResolvedValue(TOKENS);
      const res = makeRes();

      const result = await controller.login(dto, res as unknown as Response);

      expect(result).toEqual(TOKENS);
      expect(authService.login).toHaveBeenCalledWith(dto);
    });

    it('sets httpOnly refresh_token cookie on success', async () => {
      authService.login.mockResolvedValue(TOKENS);
      const res = makeRes();

      await controller.login(dto, res as unknown as Response);

      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-token',
        expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/auth' }),
      );
    });

    it('does not set cookie when authService throws', async () => {
      authService.login.mockRejectedValue(new UnauthorizedException());
      const res = makeRes();

      await expect(controller.login(dto, res as unknown as Response)).rejects.toThrow();
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  // ── refresh ─────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('uses refresh_token from body when provided', async () => {
      authService.refresh.mockResolvedValue(TOKENS);
      const dto: RefreshDto = { refresh_token: 'body-refresh' };
      const res = makeRes();

      await controller.refresh(dto, makeReq() as Request, res as unknown as Response);

      expect(authService.refresh).toHaveBeenCalledWith({ refresh_token: 'body-refresh' });
    });

    it('falls back to cookie when body is empty', async () => {
      authService.refresh.mockResolvedValue(TOKENS);
      const req = makeReq({ refresh_token: 'cookie-refresh' });
      const res = makeRes();

      await controller.refresh({}, req as Request, res as unknown as Response);

      expect(authService.refresh).toHaveBeenCalledWith({ refresh_token: 'cookie-refresh' });
    });

    it('body token takes precedence over cookie', async () => {
      authService.refresh.mockResolvedValue(TOKENS);
      const req = makeReq({ refresh_token: 'cookie-refresh' });
      const res = makeRes();

      await controller.refresh(
        { refresh_token: 'body-refresh' },
        req as Request,
        res as unknown as Response,
      );

      expect(authService.refresh).toHaveBeenCalledWith({ refresh_token: 'body-refresh' });
    });

    it('sets new refresh_token cookie on success', async () => {
      authService.refresh.mockResolvedValue(TOKENS);
      const res = makeRes();

      await controller.refresh(
        { refresh_token: 'old-refresh' },
        makeReq() as Request,
        res as unknown as Response,
      );

      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-token',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('propagates BadRequestException when no token is available', async () => {
      authService.refresh.mockRejectedValue(new BadRequestException('No refresh token provided'));
      const res = makeRes();

      await expect(
        controller.refresh({}, makeReq() as Request, res as unknown as Response),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── logout ──────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('uses refresh_token from body when provided', async () => {
      authService.logout.mockResolvedValue();
      const dto: LogoutDto = { refresh_token: 'body-refresh' };
      const res = makeRes();

      await controller.logout(dto, makeReq() as Request, res as unknown as Response);

      expect(authService.logout).toHaveBeenCalledWith({ refresh_token: 'body-refresh' });
    });

    it('falls back to cookie when body is empty', async () => {
      authService.logout.mockResolvedValue();
      const req = makeReq({ refresh_token: 'cookie-refresh' });
      const res = makeRes();

      await controller.logout({}, req as Request, res as unknown as Response);

      expect(authService.logout).toHaveBeenCalledWith({ refresh_token: 'cookie-refresh' });
    });

    it('clears the refresh_token cookie after logout', async () => {
      authService.logout.mockResolvedValue();
      const res = makeRes();

      await controller.logout(
        { refresh_token: 'token' },
        makeReq() as Request,
        res as unknown as Response,
      );

      expect(res.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.objectContaining({ httpOnly: true, path: '/auth' }),
      );
    });

    it('does not clear cookie when authService throws', async () => {
      authService.logout.mockRejectedValue(new BadRequestException());
      const res = makeRes();

      await expect(
        controller.logout({ refresh_token: 'token' }, makeReq() as Request, res as unknown as Response),
      ).rejects.toThrow();
      expect(res.clearCookie).not.toHaveBeenCalled();
    });
  });

  // ── getMe ───────────────────────────────────────────────────────────────────

  describe('getMe', () => {
    it('returns the authenticated user directly', () => {
      const user: AuthenticatedUser = {
        keycloakUserId: 'kc-123',
        email: 'ada@example.com',
        username: 'ada',
        roles: ['user'],
      };

      expect(controller.getMe(user)).toEqual(user);
    });
  });
});
