import {
  StackProps as CDKStackProps,
  Stack as CDKStack,
  DefaultStackSynthesizer,
  DefaultStackSynthesizerProps,
} from 'aws-cdk-lib/core';
import {Construct} from 'constructs';

import type {App} from './App';
import {useProject} from '../project';

export type StackProps = CDKStackProps;

/**
 * The Stack construct extends cdk.Stack.
 */
export class Stack extends CDKStack {
  /**
   * The current stage of the stack.
   */
  public readonly stage: string;

  constructor(scope: Construct, id: string, props?: StackProps) {
    const app = scope.node.root as App;
    const stackId = app.logicalPrefixedName(id);

    super(scope, stackId, {
      ...props,
      env: {
        account: app.account,
        region: app.region,
      },
      synthesizer: props?.synthesizer || Stack.buildSynthesizer(),
    });

    this.stage = app.stage;
  }

  private static buildSynthesizer() {
    const {config} = useProject();
    const props: DefaultStackSynthesizerProps = {
      qualifier: config.cdk?.qualifier,
      bootstrapStackVersionSsmParameter: config.cdk?.bootstrapStackVersionSsmParameter,
      fileAssetsBucketName: config.cdk?.fileAssetsBucketName,
      deployRoleArn: config.cdk?.deployRoleArn,
      fileAssetPublishingRoleArn: config.cdk?.fileAssetPublishingRoleArn,
      imageAssetPublishingRoleArn: config.cdk?.imageAssetPublishingRoleArn,
      imageAssetsRepositoryName: config.cdk?.imageAssetsRepositoryName,
      cloudFormationExecutionRole: config.cdk?.cloudFormationExecutionRole,
      lookupRoleArn: config.cdk?.lookupRoleArn,
    };

    const isEmpty = Object.values(props).every(v => v === undefined);
    if (isEmpty) return;

    return new DefaultStackSynthesizer(props);
  }
}
