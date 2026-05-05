import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser, KeycloakJwtPayload } from '../types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly clientId: string;

  constructor(private readonly configService: ConfigService) {
    const keycloakUrl = configService.getOrThrow<string>('keycloak.url');
    const issuerUrl = configService.getOrThrow<string>('keycloak.issuerUrl');
    const realm = configService.getOrThrow<string>('keycloak.realm');
    const clientId = configService.getOrThrow<string>('keycloak.clientId');
    const issuer = `${issuerUrl}/realms/${realm}`;
    const jwksBase = `${keycloakUrl}/realms/${realm}`;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      issuer,
      audience: clientId,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${jwksBase}/protocol/openid-connect/certs`,
      }),
    });

    this.clientId = clientId;
  }

  validate(payload: KeycloakJwtPayload): AuthenticatedUser {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token subject');
    }

    const realmRoles = payload.realm_access?.roles ?? [];
    const clientRoles = payload.resource_access?.[this.clientId]?.roles ?? [];
    const roles = Array.from(new Set([...realmRoles, ...clientRoles]));

    return {
      keycloakUserId: payload.sub,
      email: payload.email,
      username: payload.preferred_username,
      roles,
    };
  }
}
