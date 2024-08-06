import {HelmChartProps} from 'aws-cdk-lib/aws-eks';
import {IEksCluster} from '../Eks';

type HelmChartOptions = Omit<HelmChartProps, 'cluster' | 'policyStatements' | 'managedPolices'>;

export type SecretStoreAddOnProps = HelmChartOptions & {
  /**
   * Install Secrets Store CSI Driver providers.
   */
  readonly providers?: {
    readonly awsProvider: HelmChartOptions;
  };
};

const defaultNamespace = 'kube-system';

const secretsStoreDefaultProps = {
  repository: 'https://kubernetes-sigs.github.io/secrets-store-csi-driver/charts',
  chart: 'secrets-store-csi-driver',
  release: 'csi-secrets-store',
  createNamespace: true,
} as const;

const awsProviderDefaultProps = {
  repository: 'https://aws.github.io/secrets-store-csi-driver-provider-aws',
  chart: 'secrets-store-csi-driver-provider-aws',
  release: 'secrets-provider-aws',
  createNamespace: true,
} as const;

export async function addSecretsStore(cluster: IEksCluster, props: SecretStoreAddOnProps) {
  const namespace = props.namespace ?? defaultNamespace;
  const chart = cluster.addHelmChart('csi-secrets-store', {
    ...secretsStoreDefaultProps,
    ...props,
    namespace,
  });

  if (props.providers?.awsProvider) {
    cluster.addHelmChart('secrets-provider-aws', {
      ...awsProviderDefaultProps,
      ...props.providers.awsProvider,
      namespace,
    });
  }

  return chart;
}
