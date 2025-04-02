module.exports = class LogsLogGroup {
  static TYPE = 'AWS::Logs::LogGroup';
  async exists(resource, provider) {
    try {
      /** @type {import("aws-sdk").CloudWatchLogs.DescribeLogGroupsResponse} */
      const res = await provider.request('CloudWatchLogs', 'describeLogGroups', {
        logGroupNamePrefix: resource.Properties.LogGroupName
      });
      return res.logGroups?.some(g => g.logGroupName == resource.Properties.LogGroupName);
    } catch (err) {
      throw err;
    }
  }
  getResourceIdentifier(resource) {
    return {
      LogGroupName: resource.Properties.LogGroupName
    };
  }
}