const path = require('path');
const wait = require('timers-ext/promise/sleep');
const handledTypes = require('./ResourceTypes');

/**
 * @typedef {import("serverless/plugins/aws/provider/awsProvider").CloudFormationResource & {name:string}} CloudFormationResource
 * @property {string} name
 */

/**
 * Config for serverless-plugin-import-resources
 * @typedef {Object} ImportConfig
 * @property {string[]} resources - resources to import that was defined in the serverless file
 * @property {string[]} compiledResources - resources to import that is created by another plugin
 * @property {boolean} beforeDeploy - always import resources before deploy
 */

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

    this.handledTypes = handledTypes;
    this.commands = {
      'import': {
        lifecycleEvents: ['run'],
        usage: 'Import resources into an existing stack',
        options: {
          cache: {
            usage: 'use cached data when running the command a second time',
            shortcut: 'c',
            type: 'boolean'
          },
        },
      }
    };

    this.hooks = {
      'import:run': async () => this.importResources(),
      'before:deploy:deploy': async () => this.checkBeforeDeploy()
    };
  }

  async importResources() {
    const config = this.getCustomConfig();

    if (!config) {
      return;
    }

    const toCheck = await this.getResourceToCheck(config)
    const toImport = await asyncFilter(toCheck, async (resource) => this.checkResource(resource));
    // console.log(toImport);

    if (toImport.length < 1) {
      this.log('No resource to import detected');
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
    // console.log(params);
    await this.provider.request('CloudFormation', 'createChangeSet', params);

    await this.waitForChangeSetCreation(changeSetName, stackName);

    await this.provider.request('CloudFormation', 'executeChangeSet', {
      ChangeSetName: changeSetName,
      StackName: stackName
    });

    // todo: monitor stack
  }

  async checkBeforeDeploy() {
    const config = this.getCustomConfig();

    if (!config?.beforeDeploy) {
      return;
    }
    
    await this.serverless.pluginManager.spawn('import')
  }
  
  
  /**
   * 
   * @param {string} ImportConfig 
   * @returns {Promise<CloudFormationResource[]>}
   */
  async getResourceToCheck(config) {
    const cacheFile = path.join(
      this.serverless.serviceDir,
      '.serverless',
      this.getCacheFileName()
    );
    if(this.options.cache && this.serverless.utils.fileExistsSync(cacheFile)){
      const content = await this.serverless.utils.readFile(
        cacheFile
      );
      return content;
    }

    if(config.compiledResources.length > 0 && !this.serverless.service.provider.compiledCloudFormationTemplate){
      await this.serverless.pluginManager.spawn('package')
    }

    /** @type {string[]} */
    const resourceNames = [...config.resources,...config.compiledResources];
    const toCheck = resourceNames.map((name) => this.getResourceDefinition(name));

    if(this.options.cache){
      await this.serverless.utils.writeFile(
        cacheFile,
        JSON.stringify(toCheck,null,'  ')
      );
    }

    return toCheck;
  }
  /**
   * 
   * @param {string} name 
   */
  async importResource(name) {
    console.log(this.serverless.service.resources.Resources[name]);
  }

  /**
   * 
   * @returns {ImportConfig}
   */
  getCustomConfig() {
    let config = this.serverless.service.custom.importExistingResources;
    if (!config) {
      return null;
    }
    if (Array.isArray(config)) {
      config = {
        resources: config
      }
    }
    const defaults = {
      resources: [],
      compiledResources: []
    }
    return { ...defaults, ...config }
  }

  getResourceDefinition(name) {
    // console.log(this.serverless.service.resources);
    // console.log(this.serverless.service.provider.compiledCloudFormationTemplate?.Resources);
    const resource = this.serverless.service.provider.compiledCloudFormationTemplate?.Resources[name] || this.serverless.service.resources.Resources[name];
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
   * @returns {Promise<boolean>}
   */
  async resourceExists(resource) {
    return this.handledTypes[resource.Type].exists(resource, this.provider);
  }

  /**
   * 
   * @param {string} name 
   * @returns {Promise<boolean>}
   */
  async checkResource(resource) {
    if (! await this.resourceExists(resource)) {
      return false;
    }
    const template = await this.getCurrentTemplate();
    return !template.Resources[resource.name];
  }

  /**
   * 
   * @param {CloudFormationResource} resource 
   * @returns {Promise<import("aws-sdk").CloudFormation.ResourceToImport>}
   */
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
    await this.serverless.utils.writeFile(
      compiledTemplateFilePath,
      template
    );

    return template;
  }

  getTemplateFileName() {
    return 'compiled-cloudformation-import-template.json';
  }
  getCacheFileName() {
    return 'import-existing-resources-to-check.json';
  }

  async getTemplateUrl() {
    const bucketName = await this.provider.getServerlessDeploymentBucketName();
    const compiledTemplateFileName = this.getTemplateFileName();
    const s3Endpoint = 's3.amazonaws.com';
    return `https://${s3Endpoint}/${bucketName}/${this.serverless.service.package.artifactDirectoryName}/${compiledTemplateFileName}`;
  }

  async uploadTemplate(template) {
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