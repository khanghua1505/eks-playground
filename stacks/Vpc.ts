import {Vpc as CDKVpc, IpProtocol, IpAddresses, SubnetType} from 'aws-cdk-lib/aws-ec2';
import {StackContext} from '../lib/app';

interface VpcProps {
  /**
   * The VPC name.
   *
   * @default this.node.path
   */
  readonly vpcName?: string;
  /**
   * The CIDR range to use for the VPC, e.g. '10.0.0.0/16'.
   *
   * @default Vpc.DEFAULT_CIDR_RANGE
   */
  readonly cidr?: string;
  /**
   * Define the maximum number of AZs to use in this region
   *
   * @default 3
   */
  readonly maxAzs?: number;
  /**
   * The number of NAT Gateways/Instances to create.
   *
   * @default - One NAT gateway/instance per Availability Zone
   */
  readonly natGateways?: number;
}

export function Vpc({stack, props}: StackContext<VpcProps>) {
  const vpc = new CDKVpc(stack, 'Vpc', {
    vpcName: props.vpcName,
    ipProtocol: IpProtocol.IPV4_ONLY,
    ipAddresses: props?.cidr ? IpAddresses.cidr(props.cidr) : undefined,
    maxAzs: props.maxAzs,
    natGateways: props.natGateways,
    subnetConfiguration: [
      {
        name: 'publicSubnets',
        cidrMask: 24,
        subnetType: SubnetType.PUBLIC,
      },
      {
        name: 'privateSubnets',
        cidrMask: 20,
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      {
        name: 'isolatedSubnets',
        cidrMask: 24,
        subnetType: SubnetType.PRIVATE_ISOLATED,
      },
    ],
  });

  return {
    vpc,
    vpcId: vpc.vpcId,
    publicSubnets: vpc.publicSubnets.map(subnet => subnet.subnetId),
    privateSubnets: vpc.privateSubnets.map(subnet => subnet.subnetId),
    isolatedSubnets: vpc.isolatedSubnets.map(subnet => subnet.subnetId),
  };
}
