const wait = require('timers-ext/promise/sleep');

module.exports = {
  /**
   * 
   * @param {string} changeSetName 
   * @param {string} stackName 
   * @param {import("serverless/plugins/aws/provider/awsProvider")} provider 
   * 
   * @returns {Promise<import("aws-sdk").CloudFormation.DescribeChangeSetOutput>}
   */
  async waitForChangeSetCreation(changeSetName, stackName, provider) {
    const params = {
      ChangeSetName: changeSetName,
      StackName: stackName,
    };

    const callWithRetry = async () => {
      /** @type {import("aws-sdk").CloudFormation.DescribeChangeSetOutput} */
      const changeSetDescription = await provider.request(
        'CloudFormation',
        'describeChangeSet',
        params
      );
      if (
        changeSetDescription.Status === 'CREATE_COMPLETE'
      ) {
        return changeSetDescription;
      }

      if (
        changeSetDescription.Status === 'CREATE_PENDING' ||
        changeSetDescription.Status === 'CREATE_IN_PROGRESS'
      ) {
        console.log('Change Set did not reach desired state, retrying');
        await wait(5000);
        return await callWithRetry();
      }

      throw new Error(
        `Could not create Change Set "${changeSetDescription.ChangeSetName}" due to: ${changeSetDescription.StatusReason}`
      );
    };

    return await callWithRetry();

  }
};