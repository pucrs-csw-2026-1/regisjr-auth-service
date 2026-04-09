import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DynamoDbService {
  readonly client: DynamoDBDocumentClient;
  readonly tableName: string;

  constructor(configService: ConfigService) {
    const region = configService.getOrThrow<string>('aws.region');
    const endpoint = configService.get<string>('aws.dynamodbEndpoint');

    const dynamoClient = new DynamoDBClient({
      region,
      endpoint: endpoint || undefined,
    });

    this.client = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
      },
    });
    this.tableName = configService.getOrThrow<string>('aws.dynamodbTableName');
  }
}
