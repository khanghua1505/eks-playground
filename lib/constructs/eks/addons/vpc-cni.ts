import type {IEksCluster, AddOnProps} from '../Eks';

/**
 * `vpc-cni` addon properties
 *
 * Working with the Amazon VPC CNI plugin for Kubernetes Amazon EKS add-on
 * https://docs.aws.amazon.com/eks/latest/userguide/managing-vpc-cni.html
 */
export type VpcCniAddOnProps = Omit<
  AddOnProps,
  'addOnName' | 'policyStatements' | 'managedPolices'
>;

export async function addVpcCni(cluster: IEksCluster, props: VpcCniAddOnProps) {
  const addonProps = {
    addOnName: 'vpc-cni',
    serviceAccountName: 'vpc-cni',
    ...props,
  };
  return await cluster.addAddon(addonProps);
}
