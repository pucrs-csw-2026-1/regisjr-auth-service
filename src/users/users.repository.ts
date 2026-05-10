import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DynamoDbService } from '../database/dynamodb.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UserProfile } from './entities';
import { UserStatus } from './user-status.enum';

@Injectable()
export class UsersRepository {
  constructor(private readonly dynamoDb: DynamoDbService) {}

  async createProfile(dto: CreateUserProfileDto): Promise<UserProfile> {
    const existing = await this.getByKeycloakUserId(dto.keycloakUserId);

    if (existing) {
      throw new ConflictException('User profile already exists for Keycloak user');
    }

    const now = new Date().toISOString();
    const userId = randomUUID();
    const profile: UserProfile = {
      PK: this.userPk(userId),
      SK: 'PROFILE',
      GSI1PK: this.keycloakPk(dto.keycloakUserId),
      GSI1SK: 'PROFILE',
      entityType: 'UserProfile',
      userId,
      keycloakUserId: dto.keycloakUserId,
      name: dto.name,
      email: dto.email,
      status: dto.status ?? UserStatus.Active,
      createdAt: now,
      updatedAt: now,
    };

    await this.dynamoDb.client.send(
      new PutCommand({
        TableName: this.dynamoDb.tableName,
        Item: profile,
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      }),
    );

    return profile;
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const result = await this.dynamoDb.client.send(
      new GetCommand({
        TableName: this.dynamoDb.tableName,
        Key: {
          PK: this.userPk(userId),
          SK: 'PROFILE',
        },
      }),
    );

    return (result.Item as UserProfile | undefined) ?? null;
  }

  async getByKeycloakUserId(keycloakUserId: string): Promise<UserProfile | null> {
    const result = await this.dynamoDb.client.send(
      new QueryCommand({
        TableName: this.dynamoDb.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
        ExpressionAttributeValues: {
          ':pk': this.keycloakPk(keycloakUserId),
          ':sk': 'PROFILE',
        },
        Limit: 1,
      }),
    );

    return (result.Items?.[0] as UserProfile | undefined) ?? null;
  }

  async updateProfile(
    userId: string,
    dto: UpdateUserProfileDto,
  ): Promise<UserProfile | null> {
    const updates: string[] = ['updatedAt = :updatedAt'];
    const values: Record<string, string> = {
      ':updatedAt': new Date().toISOString(),
    };
    const names: Record<string, string> = {};

    if (dto.name !== undefined) {
      updates.push('#name = :name');
      values[':name'] = dto.name;
      names['#name'] = 'name';
    }

    if (dto.email !== undefined) {
      updates.push('email = :email');
      values[':email'] = dto.email;
    }

    if (dto.status !== undefined) {
      updates.push('#status = :status');
      values[':status'] = dto.status;
      names['#status'] = 'status';
    }

    try {
      const result = await this.dynamoDb.client.send(
        new UpdateCommand({
          TableName: this.dynamoDb.tableName,
          Key: {
            PK: this.userPk(userId),
            SK: 'PROFILE',
          },
          UpdateExpression: `SET ${updates.join(', ')}`,
          ...(Object.keys(names).length && { ExpressionAttributeNames: names }),
          ExpressionAttributeValues: values,
          ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
          ReturnValues: 'ALL_NEW',
        }),
      );

      return (result.Attributes as UserProfile | undefined) ?? null;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) return null;
      throw err;
    }
  }

  async deleteProfile(userId: string): Promise<void> {
    await this.dynamoDb.client.send(
      new DeleteCommand({
        TableName: this.dynamoDb.tableName,
        Key: {
          PK: this.userPk(userId),
          SK: 'PROFILE',
        },
        ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
      }),
    );
  }

  private userPk(userId: string): string {
    return `USER#${userId}`;
  }

  private keycloakPk(keycloakUserId: string): string {
    return `KEYCLOAK#${keycloakUserId}`;
  }
}
