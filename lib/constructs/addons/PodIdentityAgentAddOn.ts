import {Construct} from 'constructs';
import {KubernetesVersion} from 'aws-cdk-lib/aws-eks';
import {CoreAddon, CoreAddOnProps} from './CoreAddon';

const versionMap: Map<KubernetesVersion, string> = new Map([
  [KubernetesVersion.V1_30, 'v1.3.0-eksbuild.1'],
  [KubernetesVersion.V1_29, 'v1.3.0-eksbuild.1'],
  [KubernetesVersion.V1_28, 'v1.2.0-eksbuild.1'],
  [KubernetesVersion.V1_27, 'v1.2.0-eksbuild.1'],
  [KubernetesVersion.V1_26, 'v1.2.0-eksbuild.1'],
]);

export type PodIdentityAgentAddOnProps = Omit<
  CoreAddOnProps,
  'versionMap' | 'serviceAccountName' | 'addOnName' | 'policyDocument'
>;

/**
 * Default values for the add-on
 */
const defaultProps = {
  addOnName: 'eks-pod-identity-agent',
  versionMap: versionMap,
  serviceAccountName: 'eks-pod-identity-agent-sa',
};

/**
 * Implementation of Amazon EKS Pod Identity Agent add-on.
 */
export class PodIdentityAgentAddOn extends CoreAddon {
  constructor(scope: Construct, id: string, props: PodIdentityAgentAddOnProps) {
    super(scope, id, {
      version: props.version || 'auto',
      ...defaultProps,
      ...props,
    });
  }
}
