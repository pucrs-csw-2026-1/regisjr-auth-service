import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserStatus } from './user-status.enum';
import { UsersRoleRepository } from './users-role.repository';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { UserProfile, UserRole } from './entities';

const mockRole = (roleName = 'organizador'): UserRole => ({
  PK: 'USER#user-1',
  SK: `ROLE#${roleName}`,
  entityType: 'UserRole',
  userId: 'user-1',
  roleName,
  assignedAt: '2024-01-01T00:00:00.000Z',
});

const mockProfile = (): UserProfile => ({
  PK: 'USER#user-1',
  SK: 'PROFILE',
  GSI1PK: 'KEYCLOAK#kc-1',
  GSI1SK: 'PROFILE',
  entityType: 'UserProfile',
  userId: 'user-1',
  keycloakUserId: 'kc-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  status: UserStatus.Active,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
});

describe('UsersService', () => {
  let service: UsersService;
  let repo: jest.Mocked<UsersRepository>;
  let roleRepo: jest.Mocked<UsersRoleRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: UsersRepository,
          useValue: {
            createProfile: jest.fn(),
            getProfile: jest.fn(),
            getByKeycloakUserId: jest.fn(),
            updateProfile: jest.fn(),
            deleteProfile: jest.fn(),
          },
        },
        {
          provide: UsersRoleRepository,
          useValue: {
            assignRole: jest.fn(),
            listRoles: jest.fn(),
            removeRole: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
    repo = module.get(UsersRepository);
    roleRepo = module.get(UsersRoleRepository);
  });

  describe('createProfile', () => {
    it('returns mapped response on success', async () => {
      repo.createProfile.mockResolvedValue(mockProfile());

      const result = await service.createProfile({
        keycloakUserId: 'kc-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      });

      expect(result.userId).toBe('user-1');
      expect(result.email).toBe('ada@example.com');
      expect(result.status).toBe(UserStatus.Active);
    });

    it('propagates ConflictException from repository', async () => {
      repo.createProfile.mockRejectedValue(
        new ConflictException('User profile already exists for Keycloak user'),
      );

      await expect(
        service.createProfile({
          keycloakUserId: 'kc-1',
          name: 'Ada',
          email: 'ada@example.com',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getProfile', () => {
    it('returns mapped response when profile exists', async () => {
      repo.getProfile.mockResolvedValue(mockProfile());

      const result = await service.getProfile('user-1');

      expect(result.userId).toBe('user-1');
      expect(result.keycloakUserId).toBe('kc-1');
    });

    it('throws NotFoundException when profile does not exist', async () => {
      repo.getProfile.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getByKeycloakUserId', () => {
    it('returns mapped response when profile exists', async () => {
      repo.getByKeycloakUserId.mockResolvedValue(mockProfile());

      const result = await service.getByKeycloakUserId('kc-1');

      expect(result.keycloakUserId).toBe('kc-1');
    });

    it('throws NotFoundException when no profile for keycloak user', async () => {
      repo.getByKeycloakUserId.mockResolvedValue(null);

      await expect(service.getByKeycloakUserId('unknown-kc')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProfile', () => {
    it('returns updated mapped response', async () => {
      const updated = { ...mockProfile(), name: 'Charles Babbage' };
      repo.updateProfile.mockResolvedValue(updated);

      const result = await service.updateProfile('user-1', {
        name: 'Charles Babbage',
      });

      expect(result.name).toBe('Charles Babbage');
    });

    it('throws NotFoundException when profile does not exist', async () => {
      repo.updateProfile.mockResolvedValue(null);

      await expect(
        service.updateProfile('nonexistent', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteProfile', () => {
    it('resolves without error when profile exists', async () => {
      repo.getProfile.mockResolvedValue(mockProfile());
      repo.deleteProfile.mockResolvedValue();

      await expect(service.deleteProfile('user-1')).resolves.toBeUndefined();
      expect(repo.deleteProfile).toHaveBeenCalledWith('user-1');
    });

    it('throws NotFoundException before deleting when profile does not exist', async () => {
      repo.getProfile.mockResolvedValue(null);

      await expect(service.deleteProfile('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.deleteProfile).not.toHaveBeenCalled();
    });
  });

  describe('assignRole', () => {
    it('returns mapped role response on success', async () => {
      repo.getProfile.mockResolvedValue(mockProfile());
      roleRepo.assignRole.mockResolvedValue(mockRole('organizador'));

      const result = await service.assignRole('user-1', { roleName: 'organizador' });

      expect(result.roleName).toBe('organizador');
      expect(result.userId).toBe('user-1');
    });

    it('throws NotFoundException when user profile does not exist', async () => {
      repo.getProfile.mockResolvedValue(null);

      await expect(
        service.assignRole('nonexistent', { roleName: 'organizador' }),
      ).rejects.toThrow(NotFoundException);
      expect(roleRepo.assignRole).not.toHaveBeenCalled();
    });

    it('propagates ConflictException from repository', async () => {
      repo.getProfile.mockResolvedValue(mockProfile());
      roleRepo.assignRole.mockRejectedValue(
        new ConflictException("Role 'organizador' already assigned to user"),
      );

      await expect(
        service.assignRole('user-1', { roleName: 'organizador' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listRoles', () => {
    it('returns all roles mapped as response', async () => {
      repo.getProfile.mockResolvedValue(mockProfile());
      roleRepo.listRoles.mockResolvedValue([
        mockRole('organizador'),
        mockRole('participante'),
      ]);

      const result = await service.listRoles('user-1');

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.roleName)).toEqual(['organizador', 'participante']);
    });

    it('throws NotFoundException when profile does not exist', async () => {
      repo.getProfile.mockResolvedValue(null);

      await expect(service.listRoles('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('removeRole', () => {
    it('resolves without error when profile and role exist', async () => {
      repo.getProfile.mockResolvedValue(mockProfile());
      roleRepo.removeRole.mockResolvedValue();

      await expect(
        service.removeRole('user-1', 'organizador'),
      ).resolves.toBeUndefined();
      expect(roleRepo.removeRole).toHaveBeenCalledWith('user-1', 'organizador');
    });

    it('throws NotFoundException when profile does not exist', async () => {
      repo.getProfile.mockResolvedValue(null);

      await expect(service.removeRole('nonexistent', 'organizador')).rejects.toThrow(
        NotFoundException,
      );
      expect(roleRepo.removeRole).not.toHaveBeenCalled();
    });
  });
});
