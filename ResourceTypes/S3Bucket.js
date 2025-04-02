module.exports = class S3Bucket {
  static TYPE = 'AWS::S3::Bucket';
  async exists(resource, provider) {
    try {
      await provider.request('S3', 'headBucket', {
        Bucket: resource.Properties.BucketName
      });
      return true;
    } catch (err) {
      if (err.code === 'AWS_S3_HEAD_BUCKET_NOT_FOUND') {
        return false;
      }
      throw err;
    }
  }
  getResourceIdentifier(resource) {
    return {
      BucketName: resource.Properties.BucketName
    };
  }
}