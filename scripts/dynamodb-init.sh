#!/bin/sh
set -e

attempt=1
max_attempts=30

while ! aws dynamodb list-tables --endpoint-url http://dynamodb-local:8000 >/dev/null 2>&1; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo 'DynamoDB Local did not become ready in time.'
    exit 1
  fi

  echo "Waiting for DynamoDB Local... ($attempt/$max_attempts)"
  attempt=$((attempt + 1))
  sleep 2
done

if aws dynamodb describe-table \
  --table-name event-system \
  --endpoint-url http://dynamodb-local:8000 >/dev/null 2>&1; then
  echo 'DynamoDB table already exists.'
  exit 0
fi

aws dynamodb create-table \
  --table-name event-system \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=GSI1PK,AttributeType=S \
    AttributeName=GSI1SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes \
    "IndexName=GSI1,KeySchema=[{AttributeName=GSI1PK,KeyType=HASH},{AttributeName=GSI1SK,KeyType=RANGE}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}" \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --endpoint-url http://dynamodb-local:8000 \
  --region us-east-1

echo 'DynamoDB table created successfully.'
exit 0 