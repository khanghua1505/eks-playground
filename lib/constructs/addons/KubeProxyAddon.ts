import {Construct} from 'constructs';
import {KubernetesVersion} from 'aws-cdk-lib/aws-eks';
import {CoreAddon, CoreAddOnProps} from './CoreAddon';

const versionMap: Map<KubernetesVersion, string> = new Map([
  [KubernetesVersion.V1_30, 'v1.30.0-eksbuild.3'],
  [KubernetesVersion.V1_29, 'v1.29.0-eksbuild.1'],
  [KubernetesVersion.V1_28, 'v1.28.2-eksbuild.2'],
  [KubernetesVersion.V1_27, 'v1.27.6-eksbuild.2'],
  [KubernetesVersion.V1_26, 'v1.26.9-eksbuild.2'],
]);

export type KubeProxyAddOnProps = Omit<
  CoreAddOnProps,
  'versionMap' | 'serviceAccountName' | 'addOnName'
>;

const defaultProps = {
  addOnName: 'kube-proxy',
  serviceAccountName: 'kube-proxy',
  configurationValues: {},
  versionMap: versionMap,
};

/**
 * Implementation of KubeProxy EKS add-on.
 */
export class KubeProxyAddOn extends CoreAddon {
  constructor(scope: Construct, id: string, props: KubeProxyAddOnProps) {
    super(scope, id, {
      version: props?.version || 'auto',
      ...defaultProps,
      ...props,
    });
  }
}
