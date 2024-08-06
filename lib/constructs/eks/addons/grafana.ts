import {HelmChartProps} from 'aws-cdk-lib/aws-eks';
import {PolicyStatement, Effect} from 'aws-cdk-lib/aws-iam';
import type {IEksCluster} from '../Eks';

export type GrafanaProps = Omit<HelmChartProps, 'cluster' | 'policyStatements' | 'managedPolices'>;

const defaultProps = {
  repository: 'https://grafana.github.io/helm-charts',
  chart: 'grafana',
  release: 'grafana',
  namespace: 'monitoring',
  createNamespace: true,
} as const;

export async function addGrafana(cluster: IEksCluster, props: GrafanaProps) {
  const namespace = props.namespace || defaultProps.namespace;
  const serviceAccountName = 'grafana';
  const role = cluster.createServiceAccountRole({
    roleName: 'Grafana',
    saName: serviceAccountName,
    namespace,
    managedPolices: [],
    policyStatements: [
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['aps:QueryMetrics', 'aps:GetMetricMetadata', 'aps:GetSeries', 'aps:GetLabels'],
        resources: ['*'],
      }),
    ],
  });
  const values = {
    serviceAccount: {
      create: true,
      name: serviceAccountName,
      annotations: {
        'eks.amazonaws.com/role-arn': role.roleArn,
      },
    },
    'grafana.ini': {
      auth: {
        sigv4_auth_enabled: true,
      },
    },
    ...props.values,
  };
  // Install Grafana server using Helm
  const chart = cluster.addHelmChart('grafana', {
    ...defaultProps,
    ...props,
    namespace,
    values,
  });
  chart.node.addDependency(role);
  return chart;
}
