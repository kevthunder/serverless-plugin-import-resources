const wait = require('timers-ext/promise/sleep');

module.exports = {
    /**
     * 
     * @param {import("aws-sdk").CloudFormation.DescribeChangeSetOutput} changeSetDescription 
     * @param {import("serverless/plugins/aws/provider/awsProvider")} provider 
     * 
     * @returns {Promise<>}
     */
    async monitorStack(changeSetName, stackName, provider) {
        try {
            const changeSetDescription = await provider.request(
                'CloudFormation',
                'describeChangeSet',
                {
                    ChangeSetName: changeSetName,
                    StackName: stackName,
                }
            );
            console.log(changeSetDescription);
        } catch (error) {
            console.error(error);
        }

        /** @type {import("aws-sdk").CloudFormation.DescribeStackEventsOutput} */
        const events = await provider.request('CloudFormation', 'describeStackEvents', { StackName: stackName });
        const mainStackEvents = events.StackEvents.filter((e) => e.ResourceType == 'AWS::CloudFormation::Stack')
        console.log(mainStackEvents);
        console.warn(new Error('monitorStack not implemented'));
    }
};