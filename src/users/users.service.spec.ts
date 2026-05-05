import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserStatus } from './user-status.enum';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { UserProfile } from './entities';

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
      ],
    }).compile();

    service = module.get(UsersService);
    repo = module.get(UsersRepository);
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
});
