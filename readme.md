# serverless-plugin-import-resources

**This is highly experimental, use at your own risk.**

This plugin in meant to help importing resources into an existing stack

Currently handled resources types
- AWS::S3::Bucket
- AWS::DynamoDB::Table
- AWS::Logs::LogGroup

More types will be added later

## Configuration

Configuration happens 'globally' (via custom.importExistingResources) and is a list of resources to import by logical id

### Examples

The importing an existing S3 bucket:

```yml
plugins:
  - serverless-plugin-import-resources

custom:
  importExistingResources:
    - myS3ressource

resources:
  Resources:
    myS3ressource:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: myS3ressource
      DeletionPolicy: Retain
```

Making sure the ApiGatewayLogGroup is imported before deployment:

```yml
plugins:
  - serverless-plugin-import-resources

custom:
  importExistingResources:
    compiledResources:
      - ApiGatewayLogGroup
    beforeDeploy: true
```

## Usage

The stack must be already existing


```sh
  sls import
```