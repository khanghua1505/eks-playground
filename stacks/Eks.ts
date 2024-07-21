import {
  Cluster as EKSCluster,
  KubernetesVersion,
  TaintSpec,
  CapacityType,
  AuthenticationMode,
  EndpointAccess,
} from 'aws-cdk-lib/aws-eks';
import {KubectlV30Layer} from '@aws-cdk/lambda-layer-kubectl-v30';

import {use} from '../lib/app';
import {Vpc} from './Vpc';
import {StackContext} from '../lib/app';
import {InstanceType, SubnetType} from 'aws-cdk-lib/aws-ec2';

interface EksProps {
  readonly kubernetesVersion: 'V1_29' | 'V1_30';
  readonly clusterName: string;
  readonly endpointAccess?: string[];
  readonly nodeGroups: {
    readonly name: string;
    readonly os: 'AL2' | 'BOTTLEROCKET';
    readonly capacityType: CapacityType;
    readonly instanceTypes: string[];
    readonly desiredSize: number;
    readonly maxSize: number;
    readonly maxUnavailable?: number;
    readonly labels?: {
      [name: string]: string;
    };
    readonly taints?: TaintSpec[];
  }[];
}

export function EKS({stack, props}: StackContext<EksProps>) {
  const {vpc} = use(Vpc);

  const cluster = new EKSCluster(stack, props.clusterName, {
    clusterName: props.clusterName,
    version:
      props.kubernetesVersion === 'V1_29'
        ? KubernetesVersion.V1_29
        : KubernetesVersion.V1_30,
    defaultCapacity: 0,
    vpc: vpc,
    vpcSubnets: [{subnetType: SubnetType.PRIVATE_WITH_EGRESS}],
    kubectlLayer: new KubectlV30Layer(stack, 'kubectl'),
    authenticationMode: AuthenticationMode.API,
    endpointAccess: props.endpointAccess
      ? EndpointAccess.PUBLIC_AND_PRIVATE.onlyFrom(...props.endpointAccess)
      : undefined,
  });

  for (const nodeGroupProps of props.nodeGroups) {
    cluster.addNodegroupCapacity(nodeGroupProps.name, {
      nodegroupName: nodeGroupProps.name,
      capacityType: nodeGroupProps.capacityType,
      desiredSize: nodeGroupProps.desiredSize,
      maxSize: nodeGroupProps.maxSize,
      maxUnavailablePercentage: nodeGroupProps.maxUnavailable,
      instanceTypes: nodeGroupProps.instanceTypes.map(
        instanceType => new InstanceType(instanceType)
      ),
      labels: nodeGroupProps.labels,
      taints: nodeGroupProps.taints,
    });
  }
}
