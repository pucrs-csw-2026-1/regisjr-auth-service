import * as Joi from 'joi';

export const configuration = () => ({
  port: Number(process.env.PORT ?? 3000),
  keycloak: {
    url: process.env.KEYCLOAK_URL,
    issuerUrl: process.env.KEYCLOAK_ISSUER_URL ?? process.env.KEYCLOAK_URL,
    realm: process.env.KEYCLOAK_REALM,
    clientId: process.env.KEYCLOAK_CLIENT_ID,
    saClientId: process.env.KEYCLOAK_SA_CLIENT_ID,
    saClientSecret: process.env.KEYCLOAK_SA_CLIENT_SECRET,
  },
  aws: {
    region: process.env.AWS_REGION,
    dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT,
    dynamodbTableName: process.env.DYNAMODB_TABLE_NAME,
  },
});

export const validationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  KEYCLOAK_URL: Joi.string().uri().required(),
  KEYCLOAK_REALM: Joi.string().required(),
  KEYCLOAK_CLIENT_ID: Joi.string().required(),
  KEYCLOAK_SA_CLIENT_ID: Joi.string().required(),
  KEYCLOAK_SA_CLIENT_SECRET: Joi.string().required(),
  AWS_REGION: Joi.string().required(),
  DYNAMODB_ENDPOINT: Joi.string().uri().allow('').optional(),
  DYNAMODB_TABLE_NAME: Joi.string().required(),
});
