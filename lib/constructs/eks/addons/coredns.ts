import type {IEksCluster, AddOnProps} from '../Eks';

/**
 * `coredns` addon properties
 *
 * Working with the CoreDNS Amazon EKS add-on
 * https://docs.aws.amazon.com/eks/latest/userguide/managing-coredns.html
 */
export type CoreDnsAddOnProps = Omit<
  AddOnProps,
  'addOnName' | 'policyStatements' | 'managedPolices'
>;

export async function addCoredns(cluster: IEksCluster, props: CoreDnsAddOnProps) {
  const addonProps = {
    addOnName: 'coredns',
    serviceAccountName: 'coredns',
    ...props,
  };
  return await cluster.addAddon(addonProps);
}
