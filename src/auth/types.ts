import { Request } from 'express';

export interface KeycloakJwtPayload {
  sub: string;
  email?: string;
  preferred_username?: string;
  realm_access?: {
    roles?: string[];
  };
  resource_access?: Record<
    string,
    {
      roles?: string[];
    }
  >;
}

export interface AuthenticatedUser {
  keycloakUserId: string;
  email?: string;
  username?: string;
  roles: string[];
}

export interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}
