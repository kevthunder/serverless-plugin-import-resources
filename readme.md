# serverless-plugin-import-resources

**This is highly experimental, use at your own risk.**

This plugin in ment to help importing resources into an existing stack

Currently handled resources types
- AWS::S3::Bucket
- AWS::DynamoDB::Table

More types will be added later

## Configuration

Configuration happens 'globally' (via custom.importExistingResources) and is a list of resources to import by logical id

### Examples

The importing an existing S3 bucket:

```yml
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

## Usage

The stack must be allready existing


```sh
  sls import
```