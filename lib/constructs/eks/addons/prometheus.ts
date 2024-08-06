import {HelmChartProps} from 'aws-cdk-lib/aws-eks';
import {PolicyStatement} from 'aws-cdk-lib/aws-iam';
import {Stack} from 'aws-cdk-lib/core';
import {merge} from 'lodash';
import type {IEksCluster} from '../Eks';

export type PrometheusAddOnProps = Omit<
  HelmChartProps,
  'cluster' | 'policyStatements' | 'managedPolices'
> & {
  readonly awsManagedPrometheus?: {
    readonly writeUrl: string;
  };
};

const defaultProps = {
  repository: 'https://prometheus-community.github.io/helm-charts',
  chart: 'prometheus',
  release: 'prometheus',
  namespace: 'prometheus',
  createNamespace: true,
} as const;

export async function addPrometheus(cluster: IEksCluster, props: PrometheusAddOnProps) {
  const region = Stack.of(cluster).region;
  const namespace = props.namespace || defaultProps.namespace;
  const serviceAccountName = 'prometheus';
  const role = cluster.createServiceAccountRole({
    roleName: 'Prometheus',
    saName: serviceAccountName,
    namespace,
    managedPolices: [],
    policyStatements: [
      PolicyStatement.fromJson({
        Effect: 'Allow',
        Action: ['aps:RemoteWrite', 'aps:GetSeries', 'aps:GetLabels', 'aps:GetMetricMetadata'],
        Resource: '*',
      }),
    ],
  });
  let values = {
    serviceAccounts: {
      server: {
        create: true,
        name: serviceAccountName,
        annotations: {
          'eks.amazonaws.com/role-arn': role.roleArn,
        },
      },
    },
    ...props.values,
  };
  if (props.awsManagedPrometheus) {
    values = merge(values, {
      server: {
        remoteWrite: [
          {
            url: props.awsManagedPrometheus.writeUrl,
            sigv4: {
              region,
            },
            queue_config: {
              max_samples_per_send: 1000,
              max_shards: 200,
              capacity: 2500,
            },
          },
        ],
      },
    });
  }
  // Install AWS for fluent bit helm chart.
  const chart = cluster.addHelmChart('prometheus', {
    ...defaultProps,
    ...props,
    namespace,
    values,
  });
  chart.node.addDependency(role);
  return chart;
}
