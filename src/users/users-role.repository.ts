import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConflictException, Injectable } from '@nestjs/common';
import { DynamoDbService } from '../database/dynamodb.service';
import { UserRole } from './entities';

@Injectable()
export class UsersRoleRepository {
  constructor(private readonly dynamoDb: DynamoDbService) {}

  async assignRole(userId: string, roleName: string): Promise<UserRole> {
    const existing = await this.getRole(userId, roleName);
    if (existing) {
      throw new ConflictException(`Role '${roleName}' already assigned to user`);
    }

    const now = new Date().toISOString();
    const role: UserRole = {
      PK: this.userPk(userId),
      SK: `ROLE#${roleName}`,
      entityType: 'UserRole',
      userId,
      roleName,
      assignedAt: now,
    };

    await this.dynamoDb.client.send(
      new PutCommand({
        TableName: this.dynamoDb.tableName,
        Item: role,
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      }),
    );

    return role;
  }

  async listRoles(userId: string): Promise<UserRole[]> {
    const result = await this.dynamoDb.client.send(
      new QueryCommand({
        TableName: this.dynamoDb.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': this.userPk(userId),
          ':prefix': 'ROLE#',
        },
      }),
    );

    return (result.Items ?? []) as UserRole[];
  }

  async removeRole(userId: string, roleName: string): Promise<void> {
    await this.dynamoDb.client.send(
      new DeleteCommand({
        TableName: this.dynamoDb.tableName,
        Key: {
          PK: this.userPk(userId),
          SK: this.roleSk(roleName),
        },
        ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
      }),
    );
  }

  private async getRole(userId: string, roleName: string): Promise<UserRole | null> {
    const result = await this.dynamoDb.client.send(
      new QueryCommand({
        TableName: this.dynamoDb.tableName,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: {
          ':pk': this.userPk(userId),
          ':sk': this.roleSk(roleName),
        },
        Limit: 1,
      }),
    );

    return (result.Items?.[0] as UserRole | undefined) ?? null;
  }

  private userPk(userId: string): string {
    return `USER#${userId}`;
  }

  private roleSk(roleName: string): string {
    return `ROLE#${roleName}`;
  }
}
