import {Construct} from 'constructs';
import {KubernetesVersion} from 'aws-cdk-lib/aws-eks';
import {CoreAddon, CoreAddOnProps} from './CoreAddon';

const versionMap: Map<KubernetesVersion, string> = new Map([
  [KubernetesVersion.V1_30, 'v1.18.1-eksbuild.3'],
  [KubernetesVersion.V1_29, 'v1.16.0-eksbuild.1'],
  [KubernetesVersion.V1_28, 'v1.15.1-eksbuild.1'],
  [KubernetesVersion.V1_27, 'v1.15.1-eksbuild.1'],
  [KubernetesVersion.V1_26, 'v1.15.1-eksbuild.1'],
]);

/**
 * Configuration options for the vpc-cni add-on.
 */
export type VpcCniAddOnProps = Omit<
  CoreAddOnProps,
  'versionMap' | 'serviceAccountName' | 'addOnName'
>;

const defaultProps = {
  addOnName: 'vpc-cni',
  serviceAccountName: 'vpc-cni',
  configurationValues: {},
  versionMap,
};

/**
 * Implementation of CoreDns EKS add-on.
 */
export class VpcCniAddOn extends CoreAddon {
  constructor(scope: Construct, id: string, props: VpcCniAddOnProps) {
    super(scope, id, {
      version: props.version || 'auto',
      ...defaultProps,
      ...props,
    });
  }
}
