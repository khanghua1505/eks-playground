import {Construct} from 'constructs';
import {KubernetesVersion} from 'aws-cdk-lib/aws-eks';
import {CoreAddon, CoreAddOnProps} from './CoreAddon';

const versionMap: Map<KubernetesVersion, string> = new Map([
  [KubernetesVersion.V1_30, 'v1.11.1-eksbuild.9'],
  [KubernetesVersion.V1_29, 'v1.11.1-eksbuild.4'],
  [KubernetesVersion.V1_28, 'v1.10.1-eksbuild.4'],
  [KubernetesVersion.V1_27, 'v1.10.1-eksbuild.4'],
  [KubernetesVersion.V1_26, 'v1.9.3-eksbuild.7'],
]);

/**
 * Configuration options for the coredns add-on.
 */
export type CoreDnsAddOnProps = Omit<
  CoreAddOnProps,
  'versionMap' | 'serviceAccountName' | 'addOnName' | 'policyDocument'
>;

const defaultProps = {
  addOnName: 'coredns',
  serviceAccountName: 'coredns',
  configurationValues: {},
  versionMap,
};

/**
 * Implementation of CoreDns EKS add-on.
 */
export class CoreDnsAddOn extends CoreAddon {
  constructor(scope: Construct, id: string, props: CoreDnsAddOnProps) {
    super(scope, id, {
      version: props.version || 'auto',
      ...defaultProps,
      ...props,
    });
  }
}
