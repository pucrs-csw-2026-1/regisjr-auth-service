import { ConflictException } from '@nestjs/common';
import { DynamoDbService } from '../database/dynamodb.service';
import { UsersRoleRepository } from './users-role.repository';

const makeDynamoDb = (sendMock: jest.Mock) =>
  ({ client: { send: sendMock }, tableName: 'event-system' }) as unknown as DynamoDbService;

describe('UsersRoleRepository', () => {
  const USER_ID = 'user-1';
  const ROLE_NAME = 'organizador';

  describe('assignRole', () => {
    it('creates role when it does not exist yet', async () => {
      const send = jest
        .fn()
        .mockResolvedValueOnce({ Items: [] })  // getRole query → not found
        .mockResolvedValueOnce({});            // PutCommand

      const repo = new UsersRoleRepository(makeDynamoDb(send));
      const result = await repo.assignRole(USER_ID, ROLE_NAME);

      expect(result.userId).toBe(USER_ID);
      expect(result.roleName).toBe(ROLE_NAME);
      expect(result.assignedAt).toBeDefined();
      expect(send).toHaveBeenCalledTimes(2);
    });

    it('throws ConflictException when role already assigned', async () => {
      const existingRole = {
        PK: 'USER#user-1',
        SK: 'ROLE#organizador',
        entityType: 'UserRole',
        userId: USER_ID,
        roleName: ROLE_NAME,
        assignedAt: '2024-01-01T00:00:00.000Z',
      };
      const send = jest.fn().mockResolvedValueOnce({ Items: [existingRole] });

      const repo = new UsersRoleRepository(makeDynamoDb(send));

      await expect(repo.assignRole(USER_ID, ROLE_NAME)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('listRoles', () => {
    it('returns all roles for the user', async () => {
      const items = [
        { PK: 'USER#user-1', SK: 'ROLE#admin', entityType: 'UserRole', userId: USER_ID, roleName: 'admin', assignedAt: '2024-01-01T00:00:00.000Z' },
        { PK: 'USER#user-1', SK: 'ROLE#organizador', entityType: 'UserRole', userId: USER_ID, roleName: 'organizador', assignedAt: '2024-01-01T00:00:00.000Z' },
      ];
      const send = jest.fn().mockResolvedValueOnce({ Items: items });

      const repo = new UsersRoleRepository(makeDynamoDb(send));
      const result = await repo.listRoles(USER_ID);

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.roleName)).toEqual(['admin', 'organizador']);
    });

    it('returns empty array when user has no roles', async () => {
      const send = jest.fn().mockResolvedValueOnce({ Items: [] });

      const repo = new UsersRoleRepository(makeDynamoDb(send));
      const result = await repo.listRoles(USER_ID);

      expect(result).toEqual([]);
    });
  });

  describe('removeRole', () => {
    it('sends DeleteCommand with correct key', async () => {
      const send = jest.fn().mockResolvedValueOnce({});

      const repo = new UsersRoleRepository(makeDynamoDb(send));
      await repo.removeRole(USER_ID, ROLE_NAME);

      const [command] = send.mock.calls[0];
      expect(command.input.Key).toEqual({
        PK: 'USER#user-1',
        SK: 'ROLE#organizador',
      });
    });
  });
});
