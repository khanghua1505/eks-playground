import {HelmChartProps} from 'aws-cdk-lib/aws-eks';
import type {IEksCluster} from '../Eks';

export type AwsForFluentBitAddOnProps = Omit<
  HelmChartProps,
  'cluster' | 'policyStatements' | 'managedPolices'
>;

const defaultProps = {
  repository: 'https://aws.github.io/eks-charts',
  chart: 'aws-for-fluent-bit',
  release: 'aws-for-fluent-bit',
  namespace: 'amazon-cloudwatch',
  createNamespace: true,
  values: {},
} as const;

export async function addAwsForFluentBit(cluster: IEksCluster, props: AwsForFluentBitAddOnProps) {
  const namespace = props.namespace || defaultProps.namespace;
  const serviceAccountName = 'aws-for-fluent-bit-sa';
  const role = cluster.createServiceAccountRole({
    roleName: 'AWSForFluentBitRole',
    saName: serviceAccountName,
    namespace,
    policyStatements: [],
    managedPolices: ['CloudWatchAgentServerPolicy'],
  });
  // Install AWS for fluent bit helm chart.
  const chart = cluster.addHelmChart('aws-for-fluent-bit', {
    ...defaultProps,
    ...props,
    namespace,
    values: {
      ...props.values,
      serviceAccount: {
        create: true,
        name: serviceAccountName,
        annotations: {
          'eks.amazonaws.com/role-arn': role.roleArn,
        },
      },
    },
  });
  chart.node.addDependency(role);
  return chart;
}
