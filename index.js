const generateArtifactDirectoryName = require('serverless/lib/plugins/aws/package/lib/generateArtifactDirectoryName');
const path = require('path');
const wait = require('timers-ext/promise/sleep');

async function asyncFilter(arr, filter) {
  return (await Promise.all(arr.map(async (val) => {
    resolved = await val;
    return { val: resolved, res: (await filter(resolved)) }
  }))).filter(p => p.res).map(p => p.val)
}


class ImportExistingResources {
  /**
   * 
   * @param {import("serverless")} serverless 
   * @param {*} options 
   */
  constructor(serverless, options) {
    /** @type {import("serverless")} */
    this.serverless = serverless;
    this.options = options;
    /** @type {import("serverless/plugins/aws/provider/awsProvider")} */
    this.provider = serverless.getProvider('aws');
    this.log = serverless.cli.log;

    Object.assign(
      this,
      generateArtifactDirectoryName
    );

    this.handledTypes = {
      'AWS::S3::Bucket': {
        exists: async (resource) => {
          try {
            await this.provider.request('S3', 'headBucket', {
              Bucket: resource.Properties.BucketName
            });
            return true;
          } catch (err) {
            if (err.code === 'AWS_S3_HEAD_BUCKET_NOT_FOUND') {
              return false;
            }
            throw err;
          }
        },
        getResourceIdentifier: (resource) => {
          return {
            BucketName: resource.Properties.BucketName
          };
        }
      },
      'AWS::DynamoDB::Table': {
        exists: async (resource) => {
          try {
            await this.provider.request('DynamoDB', 'describeTable', {
              TableName: resource.Properties.TableName
            });
            return true;
          } catch (err) {
            if (err.code === 'AWS_S3_HEAD_BUCKET_NOT_FOUND') {
              return false;
            }
            throw err;
          }
        },
        getResourceIdentifier: (resource) => {
          return {
            TableName: resource.Properties.TableName
          };
        }
      }
    };

    this.commands = {
      'import': {
        lifecycleEvents: ['run']
      }
    };

    this.hooks = {
      'import:run': async () => this.importResources()
    };
  }

  async importResources() {
    if (this.serverless.service.custom.importExistingResources) {

      /** @type {string[]} */
      const toCheck = this.serverless.service.custom.importExistingResources.map((name) => this.getRessourceDefinition(name));
      const toImport = await asyncFilter(toCheck, async (resource) => this.checkRessource(resource));
      console.log(toImport);

      if (toImport.length < 1) {
        this.log('No ressource to import detected');
        return;
      }

      const stackName = this.provider.naming.getStackName();
      const template = await this.makeTemplate(toImport);
      const TemplateUrl = await this.uploadTemplate(template);
      const changeSetName = `${stackName}-import-change-set`;

      const params = {
        ChangeSetType: 'IMPORT',
        ChangeSetName: changeSetName,
        Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
        ResourcesToImport: toImport.map(resource => this.formatResourceToImport(resource)),
        TemplateURL: TemplateUrl,
        StackName: stackName
      };
      console.log(params);
      await this.provider.request('CloudFormation', 'createChangeSet', params);

      await this.waitForChangeSetCreation(changeSetName, stackName);

      await this.provider.request('CloudFormation', 'executeChangeSet', {
        ChangeSetName: changeSetName,
        StackName: stackName
      });

      // todo: monitor stack
    }
  }

  /**
   * 
   * @param {string} name 
   */
  async importResource(name) {
    console.log(this.serverless.service.resources.Resources[name]);
  }

  getRessourceDefinition(name) {
    const resource = this.serverless.service.resources.Resources[name];
    if (!resource) {
      throw new Error(`Resource not defined ${name}`);
    }
    if (!this.handledTypes[resource.Type]) {
      throw new Error(`Resource type not handled ${resource.Type}`);
    }
    return { ...resource, name };
  }

  /**
   * 
   * @param {string} name 
   * @returns {boolean}
   */
  async ressourceExists(resource) {
    return this.handledTypes[resource.Type].exists(resource);
  }

  /**
   * 
   * @param {string} name 
   * @returns {boolean}
   */
  async checkRessource(resource) {
    if (! await this.ressourceExists(resource)) {
      return false;
    }
    const template = await this.getCurrentTemplate();
    return !template.Resources[resource.name];
  }

  formatResourceToImport(resource) {
    return {
      ResourceType: resource.Type,
      LogicalResourceId: resource.name,
      ResourceIdentifier: this.handledTypes[resource.Type].getResourceIdentifier(resource)
    };
  }


  /**
   * 
   * @returns {import("serverless/plugins/aws/provider/awsProvider").Resources}
   */
  async getCurrentTemplate() {
    if (this.currentTemplate) {
      return this.currentTemplate;
    }
    const stackName = this.provider.naming.getStackName();
    const template = await this.provider.request('CloudFormation', 'getTemplate', {
      StackName: stackName
    });
    this.currentTemplate = JSON.parse(template.TemplateBody);
    return this.currentTemplate;
  }

  /**
   * 
   * @returns {import("serverless/plugins/aws/provider/awsProvider").Resources}
   */
  async getTargetTemplate() {
    const compiledTemplateFileName = this.provider.naming.getCompiledTemplateFileName();

    const compiledTemplateFilePath = path.join(
      this.serverless.serviceDir,
      '.serverless',
      compiledTemplateFileName
    );
    return this.serverless.utils.readFile(
      compiledTemplateFilePath
    );
  }


  async makeTemplate(resources) {
    const template = await this.getCurrentTemplate();
    const targetTemplate = await this.getTargetTemplate();
    resources.forEach((resource) => Object.assign(
      template.Resources,
      { [resource.name]: targetTemplate.Resources[resource.name] }
    ));

    const compiledTemplateFilePath = path.join(
      this.serverless.serviceDir,
      '.serverless',
      this.getTemplateFileName()
    );
    this.serverless.utils.writeFile(
      compiledTemplateFilePath,
      template
    );

    return template;
  }

  getTemplateFileName() {
    return 'compiled-cloudformation-import-template.json';
  }

  async getTemplateUrl() {
    const bucketName = await this.provider.getServerlessDeploymentBucketName();
    const compiledTemplateFileName = this.getTemplateFileName();
    const s3Endpoint = 's3.amazonaws.com';
    return `https://${s3Endpoint}/${bucketName}/${this.serverless.service.package.artifactDirectoryName}/${compiledTemplateFileName}`;
  }

  async uploadTemplate(template) {
    this.generateArtifactDirectoryName();
    const bucketName = await this.provider.getServerlessDeploymentBucketName();
    const compiledTemplateFileName = this.getTemplateFileName();
    const params = {
      Bucket: bucketName,
      Key: `${this.serverless.service.package.artifactDirectoryName}/${compiledTemplateFileName}`,
      Body: JSON.stringify(template),
      ContentType: 'application/json',
    };
    await this.provider.request('S3', 'upload', params);
    return this.getTemplateUrl();
    throw new Error('not implemented');
  }

  async waitForChangeSetCreation(changeSetName, stackName) {
    const params = {
      ChangeSetName: changeSetName,
      StackName: stackName,
    };

    const callWithRetry = async () => {
      const changeSetDescription = await this.provider.request(
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
        this.log('Change Set did not reach desired state, retrying');
        await wait(5000);
        return await callWithRetry();
      }

      throw new Error(
        `Could not create Change Set "${changeSetDescription.ChangeSetName}" due to: ${changeSetDescription.StatusReason}`
      );
    };

    return await callWithRetry();

  }
}

module.exports = ImportExistingResources;