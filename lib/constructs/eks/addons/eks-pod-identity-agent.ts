import type {IEksCluster, AddOnProps} from '../Eks';

/**
 * `eks-pod-identity-agent` addon properties
 */
export type EksPodIdentityAgentAddOnProps = Omit<
  AddOnProps,
  'addOnName' | 'policyStatements' | 'managedPolices'
>;

export async function addEksPodIdentityAgent(
  cluster: IEksCluster,
  props: EksPodIdentityAgentAddOnProps
) {
  const addonProps = {
    addOnName: 'eks-pod-identity-agent',
    serviceAccountName: 'eks-pod-identity-agent-sa',
    ...props,
  };
  return await cluster.addAddon(addonProps);
}
