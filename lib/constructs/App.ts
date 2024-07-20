import {App as CDKApp, AppProps as CDKAppProps} from 'aws-cdk-lib/core';

import {FunctionalStack, stack} from './FunctionStack';
import type {StackProps} from './Stack';

/**
 * @internal
 * */
export interface AppDeployProps {
  /**
   * The app name, used to prefix stacks.
   *
   *  @default - Defaults to empty string
   */
  readonly name?: string;

  /**
   * The stage to deploy this app to.
   *
   * @default - Defaults to dev
   */
  readonly stage?: string;

  /**
   * The region to deploy this app to.
   *
   * @default - Defaults to us-east-1
   */
  readonly region?: string;

  readonly account?: string;
}

/**
 * @internal
 * */
export type AppProps = CDKAppProps;

/**
 * The App construct extends cdk.App and is used internally.
 *
 * @internal
 */
export class App extends CDKApp {
  /**
   * The name of your app, comes from the `name` in your `cdk.config.ts`
   */
  public readonly name: string;
  /**
   * The stage the app is being deployed to.
   */
  public readonly stage: string;
  /**
   * The region the app is being deployed to.
   */
  public readonly region: string;
  /**
   * The AWS account the app is being deployed to.
   */
  public readonly account: string;
  public readonly appPath: string;

  /**
   * @internal
   */
  constructor(deployProps: AppDeployProps, props: AppProps = {}) {
    super(props);
    this.appPath = process.cwd();

    this.name = deployProps.name || 'my-app';
    this.stage = deployProps.stage || 'dev';
    this.region =
      deployProps.region || process.env.CDK_DEFAULT_REGION || 'us-east-1';
    this.account =
      deployProps.account || process.env.CDK_DEFAULT_ACCOUNT || 'my-account';
  }

  /**
   * Use this method to prefix resource names in your stacks to make sure they don't thrash
   * when deployed to different stages in the same AWS account. This method will prefix a given
   * resource name with the stage and app name. Using the format `${stage}-${name}-${logicalName}`.
   *
   * @example
   * ```js
   * console.log(app.logicalPrefixedName("myTopic"));
   *
   * // dev-my-app-myTopic
   * ```
   */
  public logicalPrefixedName(logicalName: string): string {
    const namePrefix = this.name === '' ? '' : `${this.name}-`;
    return `${this.stage}-${namePrefix}${logicalName}`;
  }

  // Functional Stack
  // This is a magical global to avoid having to pass app everywhere.
  // We only every have one instance of app
  stack<T extends FunctionalStack<any, any>>(
    fn: T,
    props?: StackProps
  ): ReturnType<T> extends Promise<any> ? Promise<void> : App {
    return stack(this, fn, props);
  }
}
