# serverless-plugin-import-ressources

**This is highly experimental, use at your own risk.**

This plugin in ment to help importing ressource into an existing stack

Currently handled ressources types
- AWS::S3::Bucket
- AWS::DynamoDB::Table

More types will be added later

## Configuration

Configuration happens 'globally' (via custom.importExistingResources) and is a list of ressources to import by logical id

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