import * as ec2 from 'aws-cdk-lib/aws-ec2';
import {StackContext} from '../lib/constructs/FunctionStack';

export function Vpc({stack}: StackContext) {
  const vpc = new ec2.Vpc(stack, 'Vpc', {
    ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
  });

  return {
    vpc,
  };
}
