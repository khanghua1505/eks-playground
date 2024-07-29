import {ManagedPolicy, PolicyDocument} from 'aws-cdk-lib/aws-iam';
import {ICluster, ServiceAccount, CfnAddon, KubernetesVersion} from 'aws-cdk-lib/aws-eks';
import {Construct} from 'constructs';

export class CoreAddOnProps {
  /**
   * EKS Cluster.
   */
  readonly cluster: ICluster;
  /**
   *
   */
  readonly kubernetesVersion: KubernetesVersion;
  /**
   * Name of the add-on to instantiate
   */
  readonly addOnName: string;
  /**
   * Version of the add-on to use. Must match the version of the cluster where it
   * will be deployed it
   */
  readonly version?: string;
  /**
   * Policy document provider returns the policy required by the add-on to allow it to interact with AWS resources
   */
  readonly policyDocument?: PolicyDocument;
  /**
   * Service Account Name to be used with AddOn.
   */
  readonly serviceAccountName: string;
  /**
   * Namespace to create the ServiceAccount.
   */
  readonly namespace?: string;
  /**
   * ConfigurationValues field to pass custom configurations to Addon
   */
  readonly configurationValues?: {[key: string]: any};

  /**
   * Map between kubernetes versions and addOn versions for auto selection.
   */
  readonly versionMap: Map<KubernetesVersion, string>;
}

const DEFAULT_NAMESPACE = 'kube-system';

export class CoreAddon extends Construct {
  readonly props: CoreAddOnProps;
  readonly cluster: ICluster;

  constructor(scope: Construct, id: string, props: CoreAddOnProps) {
    super(scope, id);
    this.props = props;
    this.cluster = props.cluster;
    this.deploy();
  }

  deploy() {
    let serviceAccountRoleArn: string | undefined = undefined;
    let serviceAccount: ServiceAccount | undefined = undefined;

    const namespace = this.props.namespace || DEFAULT_NAMESPACE;

    if (this.props.policyDocument) {
      const serviceAccountName = this.props.serviceAccountName;
      serviceAccount = this.props.cluster.addServiceAccount(`${serviceAccountName}-sa`, {
        name: serviceAccountName,
        namespace,
      });
      const policy = new ManagedPolicy(this, `${serviceAccountName}-managed-policy`, {
        document: this.props.policyDocument,
      });
      serviceAccount.role.addManagedPolicy(policy);
      serviceAccountRoleArn = serviceAccount.role.roleArn;
    }

    let version: string | undefined = this.props.version;
    if (this.props.version === 'auto') {
      version = this.provideDefaultAutoVersion(this.props.kubernetesVersion);
    }

    const addOnProps = {
      addonName: this.props.addOnName,
      addonVersion: version,
      configurationValues: JSON.stringify(this.props.configurationValues),
      clusterName: this.props.cluster.clusterName,
      serviceAccountRoleArn: serviceAccountRoleArn,
      resolveConflicts: 'OVERWRITE',
    };

    const cfnAddon = new CfnAddon(this, this.props.addOnName + '-addon', addOnProps);
    if (serviceAccount) {
      cfnAddon.node.addDependency(serviceAccount);
    }
  }

  provideDefaultAutoVersion(version: KubernetesVersion): string {
    const versionMap = this.props.versionMap;
    const addonVersion = versionMap.get(version);
    if (addonVersion) {
      return addonVersion;
    }
    throw new Error(`No default version found for add-on ${this.props.addOnName}`);
  }
}
