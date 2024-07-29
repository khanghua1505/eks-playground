import {
  Cluster as EKSCluster,
  KubernetesVersion,
  TaintSpec,
  CapacityType,
  AuthenticationMode,
  EndpointAccess,
  NodegroupAmiType,
} from 'aws-cdk-lib/aws-eks';
import {InstanceType, SubnetType} from 'aws-cdk-lib/aws-ec2';
import {KubectlV30Layer} from '@aws-cdk/lambda-layer-kubectl-v30';
import {KubectlV29Layer} from '@aws-cdk/lambda-layer-kubectl-v29';
import {Construct} from 'constructs';

import {
  VpcCniAddOn,
  VpcCniAddOnProps,
  CoreDnsAddOn,
  CoreDnsAddOnProps,
  KubeProxyAddOn,
  KubeProxyAddOnProps,
  PodIdentityAgentAddOn,
  PodIdentityAgentAddOnProps,
} from '../lib/constructs/addons';

import {StackContext, use} from '../lib/app';
import {Vpc} from './Vpc';

type VpcCniProps = Omit<VpcCniAddOnProps, 'cluster' | 'kubernetesVersion'>;

type CoreDnsProps = Omit<CoreDnsAddOnProps, 'cluster' | 'kubernetesVersion'>;

type KubeProxyProps = Omit<KubeProxyAddOnProps, 'cluster' | 'kubernetesVersion'>;

type PodIdentityAgentProps = Omit<PodIdentityAgentAddOnProps, 'cluster' | 'kubernetesVersion'>;

interface EksProps {
  /**
   * Kubernetes cluster version.
   *
   * @default - Defaults Kubernetes version 1.30
   */
  readonly kubernetesVersion?: 'V1_29' | 'V1_30';
  /**
   *  The Name of the created EKS Cluster.
   */
  readonly clusterName: string;
  /**
   * The allowed IPs access the EKS cluster.
   */
  readonly allowedListIps?: string[];
  /**
   * EKS managed Node groups.
   */
  readonly nodeGroups?: {
    /**
     * The Name of Node group.
     */
    readonly name: string;
    /**
     * The AMI type for your node group.
     *
     * @default - AL2_X86_64
     */
    readonly iamType?: `${NodegroupAmiType}`;
    /**
     * Capacity type of the managed node group
     *
     * @default - on-demand instances
     */
    readonly capacityType: `${CapacityType}`;
    /**
     * Instance type of the instances to start
     *
     * @default - m5.xlarge
     */
    readonly instanceTypes: string[];
    /**
     * The current number of worker nodes that the managed node group should maintain. If not specified,
     * the nodewgroup will initially create `minSize` instances.
     *
     * @default 1
     */
    readonly desiredSize?: number;
    /**
     * The maximum number of worker nodes that the managed node group can scale out to.
     *
     * @default - desiredSize
     */
    readonly maxSize?: number;
    /**
     * The maximum percentage of nodes unavailable during a version update.
     * This percentage of nodes will be updated in parallel, up to 100 nodes at once.
     *
     * @default undefined - node groups will update instances one at a time
     */
    readonly maxUnavailablePercentage?: number;
    /**
     * The Kubernetes labels to be applied to the nodes in the node group when they are created.
     *
     * @default - None
     */
    readonly labels?: {
      [name: string]: string;
    };
    /**
     * The Kubernetes taints to be applied to the nodes in the node group when they are created.
     *
     * @default - None
     */
    readonly taints?: TaintSpec[];
  }[];
  /**
   * EKS add-ons
   */
  readonly addons?: {
    readonly vpcCni?: VpcCniProps;
    readonly coreDns?: CoreDnsProps;
    readonly kubeProxy: KubeProxyProps;
    readonly podIdentityAgent: PodIdentityAgentProps;
  };
}

const kubernetesVersions: {[key: string]: KubernetesVersion} = {
  V1_29: KubernetesVersion.V1_29,
  V1_30: KubernetesVersion.V1_30,
};

const defaultProps = {
  kubernetesVersion: KubernetesVersion.V1_30,
  nodeGroupIamType: NodegroupAmiType.AL2_X86_64,
  capacityType: 'ON_DEMAND',
  instanceTypes: ['m5.xlarge'],
  desiredSize: 1,
} as const;

export function EKS({stack, props}: StackContext<EksProps>) {
  const {vpc} = use(Vpc);

  const version = props.kubernetesVersion
    ? kubernetesVersions[props.kubernetesVersion]
    : defaultProps.kubernetesVersion;

  const endpointAccess = props.allowedListIps
    ? EndpointAccess.PUBLIC_AND_PRIVATE.onlyFrom(...props.allowedListIps)
    : undefined;

  const kubectlLayer =
    version === KubernetesVersion.V1_29
      ? new KubectlV29Layer(stack, 'kubectl')
      : new KubectlV30Layer(stack, 'kubectl');

  const cluster = new EKSCluster(stack, props.clusterName, {
    authenticationMode: AuthenticationMode.API_AND_CONFIG_MAP,
    clusterName: props.clusterName,
    version,
    kubectlLayer,
    vpc,
    defaultCapacity: 0,
    endpointAccess,
    vpcSubnets: [{subnetType: SubnetType.PRIVATE_WITH_EGRESS}],
  });

  if (props.nodeGroups) {
    for (const nodeGroupProps of props.nodeGroups) {
      const amiType = (nodeGroupProps.iamType || defaultProps.nodeGroupIamType) as NodegroupAmiType;
      const capacityType = (nodeGroupProps.capacityType ||
        defaultProps.capacityType) as CapacityType;
      const desiredSize = nodeGroupProps.desiredSize || defaultProps.desiredSize;
      const instanceTypes = (nodeGroupProps.instanceTypes || defaultProps.instanceTypes).map(
        instanceType => new InstanceType(instanceType)
      );

      cluster.addNodegroupCapacity(nodeGroupProps.name, {
        nodegroupName: nodeGroupProps.name,
        amiType,
        capacityType,
        desiredSize,
        instanceTypes,
        maxSize: nodeGroupProps.maxSize,
        labels: nodeGroupProps.labels,
        taints: nodeGroupProps.taints,
        maxUnavailablePercentage: nodeGroupProps.maxUnavailablePercentage,
      });
    }
  }

  // Install EKS addons.
  addEKSAddons(stack, version, cluster, props);

  return {
    clusterName: cluster.clusterName,
    openIdConnectProviderIssuer: cluster.openIdConnectProvider.openIdConnectProviderIssuer,
  };
}

function addEKSAddons(
  stack: Construct,
  version: KubernetesVersion,
  cluster: EKSCluster,
  props: EksProps
) {
  const clusterInfo = {
    cluster,
    kubernetesVersion: version,
  };

  if (props.addons?.vpcCni) {
    new VpcCniAddOn(stack, 'VpcCniAddon', {...clusterInfo});
  }

  if (props.addons?.coreDns) {
    new CoreDnsAddOn(stack, 'CoreDnsAddon', {...clusterInfo});
  }

  if (props.addons?.kubeProxy) {
    new KubeProxyAddOn(stack, 'KubeProxyAddon', {...clusterInfo});
  }

  if (props.addons?.podIdentityAgent) {
    new PodIdentityAgentAddOn(stack, 'PodIdentityAgentAddon', {...clusterInfo});
  }
}
