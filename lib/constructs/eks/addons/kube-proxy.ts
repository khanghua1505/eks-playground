import type {IEksCluster, AddOnProps} from '../Eks';

/**
 * `kube-proxy` addon properties
 *
 * Working with the Kubernetes kube-proxy add-on
 * https://docs.aws.amazon.com/eks/latest/userguide/managing-kube-proxy.html
 */
export type KubeProxyAddOnProps = Omit<
  AddOnProps,
  'addOnName' | 'policyStatements' | 'managedPolices'
>;

export async function addKubeProxy(cluster: IEksCluster, props: KubeProxyAddOnProps) {
  const addonProps = {
    addOnName: 'kube-proxy',
    serviceAccountName: 'kube-proxy',
    ...props,
  };
  return await cluster.addAddon(addonProps);
}
