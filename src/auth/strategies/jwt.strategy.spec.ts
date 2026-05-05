import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { KeycloakJwtPayload } from '../types';

jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn(() => jest.fn()),
}));

const makeConfigService = (clientId = 'nest-api'): ConfigService => ({
  getOrThrow: jest.fn((key: string) => {
    const map: Record<string, string> = {
      'keycloak.url': 'http://localhost:8080',
      'keycloak.realm': 'event-system',
      'keycloak.clientId': clientId,
    };
    if (!(key in map)) throw new Error(`Missing config: ${key}`);
    return map[key];
  }),
} as unknown as ConfigService);

describe('JwtStrategy.validate', () => {
  let strategy: JwtStrategy;
  const CLIENT_ID = 'nest-api';

  beforeEach(() => {
    strategy = new JwtStrategy(makeConfigService(CLIENT_ID));
  });

  it('returns AuthenticatedUser with realm and client roles merged', () => {
    const payload: KeycloakJwtPayload = {
      sub: 'user-uuid',
      email: 'ada@example.com',
      preferred_username: 'ada',
      realm_access: { roles: ['user', 'offline_access'] },
      resource_access: { [CLIENT_ID]: { roles: ['admin'] } },
    };

    const result = strategy.validate(payload);

    expect(result).toEqual({
      keycloakUserId: 'user-uuid',
      email: 'ada@example.com',
      username: 'ada',
      roles: ['user', 'offline_access', 'admin'],
    });
  });

  it('deduplicates roles that appear in both realm and client access', () => {
    const payload: KeycloakJwtPayload = {
      sub: 'user-uuid',
      realm_access: { roles: ['user', 'admin'] },
      resource_access: { [CLIENT_ID]: { roles: ['admin'] } },
    };

    const result = strategy.validate(payload);

    expect(result.roles).toEqual(['user', 'admin']);
    expect(result.roles.filter((r) => r === 'admin')).toHaveLength(1);
  });

  it('returns empty roles when realm_access and resource_access are absent', () => {
    const payload: KeycloakJwtPayload = { sub: 'user-uuid' };

    const result = strategy.validate(payload);

    expect(result.roles).toEqual([]);
  });

  it('handles missing email and preferred_username gracefully', () => {
    const payload: KeycloakJwtPayload = { sub: 'user-uuid' };

    const result = strategy.validate(payload);

    expect(result.email).toBeUndefined();
    expect(result.username).toBeUndefined();
  });

  it('ignores roles from other clients in resource_access', () => {
    const payload: KeycloakJwtPayload = {
      sub: 'user-uuid',
      resource_access: {
        'another-client': { roles: ['superadmin'] },
        [CLIENT_ID]: { roles: ['viewer'] },
      },
    };

    const result = strategy.validate(payload);

    expect(result.roles).toContain('viewer');
    expect(result.roles).not.toContain('superadmin');
  });

  it('throws UnauthorizedException when sub is missing', () => {
    const payload = { email: 'ada@example.com' } as KeycloakJwtPayload;

    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });
});
