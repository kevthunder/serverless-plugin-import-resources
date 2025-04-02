module.exports = class DynamoDBTable {
  static TYPE = 'AWS::DynamoDB::Table';
  async exists(resource, provider) {
    try {
      await provider.request('DynamoDB', 'describeTable', {
        TableName: resource.Properties.TableName
      });
      return true;
    } catch (err) {
      return false;
      // if (err.code === 'AWS_S3_HEAD_BUCKET_NOT_FOUND') {
      //   return false;
      // }
      // throw err;
    }
  }
  getResourceIdentifier(resource) {
    return {
      TableName: resource.Properties.TableName
    };
  }
}