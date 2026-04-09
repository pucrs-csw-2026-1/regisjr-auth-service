import { UserStatus } from './user-status.enum';

export interface UserProfile {
  PK: string;
  SK: 'PROFILE';
  GSI1PK: string;
  GSI1SK: 'PROFILE';
  entityType: 'UserProfile';
  userId: string;
  keycloakUserId: string;
  name: string;
  email: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UserRole {
  PK: string;
  SK: `ROLE#${string}`;
  entityType: 'UserRole';
  userId: string;
  roleName: string;
  assignedAt: string;
}
