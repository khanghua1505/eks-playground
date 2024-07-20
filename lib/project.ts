import path from 'path';
import fsSync from 'fs';
import fs from 'fs/promises';
import YAML from 'yaml';
import dotenv from 'dotenv';
import {merge} from 'lodash';
import {StackProps} from 'aws-cdk-lib';

import {VisibleError} from './error';
import {Logger} from './logger';

export interface ProjectConfig {
  config: ConfigOptions;
  stacks: {[key: string]: StackConfigOptions};
}

export interface ConfigOptions {
  name: string;
  nameSuffix?: string;
  region?: string;
  stage?: string;
  profile?: string;
  role?: string;
  ssmPrefix?: string;
  outputs?: string;
  stackDir?: string;
  cdk?: CDKConfig;
}

export interface StackConfigOptions {
  cdk?: StackProps;
  [key: string]: any;
}

interface CDKConfig {
  toolkitStackName?: string;
  qualifier?: string;
  bootstrapStackVersionSsmParameter?: string;
  fileAssetsBucketName?: string;
  customPermissionsBoundary?: string;
  publicAccessBlockConfiguration?: boolean;
  deployRoleArn?: string;
  fileAssetPublishingRoleArn?: string;
  imageAssetPublishingRoleArn?: string;
  imageAssetsRepositoryName?: string;
  cloudFormationExecutionRole?: string;
  lookupRoleArn?: string;
  pathMetadata?: boolean;
}

const DEFAULTS = {
  stage: 'dev',
} as const;

const CONFIG_FILES = [
  '.project',
  '.project.json',
  '.project.yaml',
  '.project.yml',
];

interface Project {
  config: ConfigOptions &
    Required<{
      [key in keyof typeof DEFAULTS]: Exclude<ConfigOptions[key], undefined>;
    }>;
  version: string;
  cdkVersion: string;
  constructsVersion: string;
  paths: {
    root: string;
    out: string;
  };
  stacks: ProjectConfig['stacks'];
}

let project: Project | undefined;

export function setProject(p: Project) {
  project = p;
}

export function useProject() {
  if (!project) throw new Error('Project not initialized');
  return project;
}

export async function initProject() {
  // Suppress warnings about deprecated CDK props.
  process.env.JSII_DEPRECATED = 'quiet';

  Logger.debug('initing project');
  const root = await findRoot();

  async function findConfigFile(files: string[]) {
    for (const filename of files) {
      const file = path.join(root, filename);
      if (!fsSync.existsSync(file)) continue;
      const project = await loadConfig(file);
      return project as ProjectConfig;
    }
    return undefined;
  }

  let projectConfig = await (async function () {
    const file = await findConfigFile(CONFIG_FILES);
    if (file) return file;

    throw new VisibleError(
      'Could not find a configuration file',
      'Make sure one of the following exists',
      ...CONFIG_FILES.map(file => `  - ${file}`)
    );
  })();

  const config = projectConfig.config;
  const stage =
    config.stage ||
    process.env.CDK_STAGE ||
    process.env.STAGE ||
    DEFAULTS.stage;

  // Load stage config file
  const stageConfigFiles = [
    `.project.${stage}`,
    `.project.${stage}.json`,
    `.project.${stage}.yaml`,
    `.project.${stage}.yml`,
  ];
  const stageProjectConfig = await (async function () {
    const file = await findConfigFile(stageConfigFiles);
    return file ? file : {};
  })();

  projectConfig = merge(projectConfig, stageProjectConfig);

  const region = config.region || process.env.AWS_REGION || process.env.REGION;
  const [version, cdkVersion, constructsVersion] = await (async () => {
    try {
      const packageJson = JSON.parse(
        await fs.readFile(path.join(root, 'package.json'), {encoding: 'utf-8'})
      );
      return [
        packageJson.version,
        packageJson.dependencies['aws-cdk-lib'],
        packageJson.dependencies['constructs'],
      ];
    } catch {
      return ['unknown', 'unknown'];
    }
  })();
  const out = path.join(root, 'cdk.out');
  project = {
    version,
    cdkVersion,
    constructsVersion,
    config: {
      ...projectConfig.config,
      stage,
      region,
      profile:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? undefined
          : config.profile,
      role: config.role,
      ssmPrefix: config.ssmPrefix || `/${config.name}/${stage}/`,
      stackDir: config.stackDir || path.join(root, 'stacks'),
      cdk: config.cdk,
    },
    paths: {
      root,
      out,
    },
    stacks: projectConfig.stacks || {},
  };

  // Load .env files
  [
    path.join(project.paths.root, '.env'),
    path.join(project.paths.root, '.env.local'),
    path.join(project.paths.root, `.env.${project.config.stage}`),
    path.join(project.paths.root, `.env.${project.config.stage}.local`),
  ].forEach(path => dotenv.config({path, override: true}));

  Logger.debug('Config loaded', project);
  return project;
}

async function loadConfig(file: string) {
  const projectConfig = YAML.parse(
    await fs.readFile(file, {encoding: 'utf-8'})
  ) as ProjectConfig;
  const {config} = projectConfig ?? {};
  if (!config?.name) {
    throw new VisibleError('Could not find a project name');
  }
  return projectConfig;
}

async function findRoot() {
  async function find(dir: string): Promise<string> {
    if (dir === '/') {
      throw new VisibleError(
        'Could not find a configuration file',
        'Make sure one of the following exists',
        ...CONFIG_FILES.map(file => `  - ${file}`)
      );
    }
    for (const file of CONFIG_FILES) {
      const configPath = path.join(dir, file);
      if (fsSync.existsSync(configPath)) {
        return dir;
      }
    }
    return await find(path.join(dir, '..'));
  }
  const result = await find(process.cwd());
  return result;
}
