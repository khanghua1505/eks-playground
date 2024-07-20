import * as ec2 from 'aws-cdk-lib/aws-ec2';
import {StackContext} from '../lib/app';

interface VpcProps {
  readonly cidr: string;
}

export function Vpc({stack, props}: StackContext<VpcProps>) {
  console.log(props);
  const vpc = new ec2.Vpc(stack, 'Vpc', {
    ipAddresses: ec2.IpAddresses.cidr(props.cidr),
  });

  return {
    vpc,
  };
}
