import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestWithUser } from '../types';
import { RolesGuard } from './roles.guard';

const makeContext = (userRoles: string[], handlerRoles?: string[]): ExecutionContext => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(handlerRoles) } as any;
  const request = { user: { roles: userRoles } } as RequestWithUser;

  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
};

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as any;
    guard = new RolesGuard(reflector);
  });

  it('allows access when no roles are required', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = makeContext([]);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows access when required roles list is empty', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    const ctx = makeContext([]);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows access when user has the required role', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    const ctx = makeContext(['admin', 'user']);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows access when user has one of multiple required roles', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin', 'moderator']);
    const ctx = makeContext(['moderator']);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws ForbiddenException when user has none of the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    const ctx = makeContext(['user']);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user has no roles at all', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    const ctx = makeContext([]);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('passes the correct metadata key to reflector', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const handler = jest.fn();
    const cls = jest.fn();
    const ctx = {
      getHandler: () => handler,
      getClass: () => cls,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles: [] } }) }),
    } as unknown as ExecutionContext;

    guard.canActivate(ctx);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      handler,
      cls,
    ]);
  });
});
