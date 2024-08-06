import {
  Cluster,
  ICluster,
  ClusterProps,
  ServiceAccount,
  KubernetesVersion,
  CfnAddon,
  HelmChart,
} from 'aws-cdk-lib/aws-eks';
import {
  Role,
  ManagedPolicy,
  PolicyStatement,
  OpenIdConnectPrincipal,
  IRole,
} from 'aws-cdk-lib/aws-iam';
import {EKSClient, DescribeAddonVersionsCommand} from '@aws-sdk/client-eks';
import {Construct} from 'constructs';
import {CfnJson, Duration} from 'aws-cdk-lib';

import {Logger} from '../../logger';
import {useAWSClient} from '../../credentials';
import * as addons from './addons';

export type VpcCniAddOnProps = addons.VpcCniAddOnProps;
export type CoreDnsAddOnProps = addons.CoreDnsAddOnProps;
export type KubeProxyAddOnProps = addons.KubeProxyAddOnProps;
export type EksPodIdentityAgentAddOnProps = addons.EksPodIdentityAgentAddOnProps;
export type EbsCsiDriverAddOnProps = addons.EbsCsiDriverAddOnProps;
export type EfsCsiDriverProps = addons.EfsCsiDriverProps;
export type AwsForFluentBitAddOnProps = addons.AwsForFluentBitAddOnProps;
export type PrometheusAddOnProps = addons.PrometheusAddOnProps;
export type GrafanaProps = addons.GrafanaProps;
export type AwsLoadBalancerControllerProps = addons.AwsLoadBalancerControllerProps;
export type SecretStoreAddOnProps = addons.SecretStoreAddOnProps;

export class AddOnProps {
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
   * Policy statement provider returns the policy required by the add-on to allow it to interact with AWS resources
   */
  readonly policyStatements?: PolicyStatement[];
  /**
   * AWS managed policies.
   */
  readonly managedPolices?: string[];
  /**
   * Service Account Name to be used with AddOn.
   */
  readonly serviceAccountName?: string;
  /**
   * Namespace to create the ServiceAccount.
   */
  readonly namespace?: string;
  /**
   * ConfigurationValues field to pass custom configurations to Addon
   */
  readonly values?: {[key: string]: any};
}

export interface HelmChartProps {
  /**
   * The name of the chart.
   * Either this or `chartAsset` must be specified.
   */
  readonly chart: string;
  /**
   * The name of the release.
   */
  readonly release: string;
  /**
   * The chart version to install.
   * @default - If this is not specified, the latest version is installed
   */
  readonly version?: string;
  /**
   * The repository which contains the chart. For example: https://charts.helm.sh/stable/
   * @default - No repository will be used, which means that the chart needs to be an absolute URL.
   */
  readonly repository?: string;
  /**
   * The Kubernetes namespace scope of the requests.
   * @default default
   */
  readonly namespace?: string;
  /**
   * The values to be used by the chart.
   * For nested values use a nested dictionary. For example:
   * values: {
   *  installationCRDs: true,
   *  webhook: { port: 9443 }
   * }
   * @default - No values are provided to the chart.
   */
  readonly values?: {
    [key: string]: any;
  };
  /**
   * Whether or not Helm should wait until all Pods, PVCs, Services, and minimum number of Pods of a
   * Deployment, StatefulSet, or ReplicaSet are in a ready state before marking the release as successful.
   * @default - Helm will not wait before marking release as successful
   */
  readonly wait?: boolean;
  /**
   * Amount of time to wait for any individual Kubernetes operation. Maximum 15 minutes.
   * @default Duration.minutes(5)
   */
  readonly timeout?: Duration;
  /**
   * Whether or not Helm should treat this operation as atomic; if set, upgrade process rolls back changes
   * made in case of failed upgrade. The --wait flag will be set automatically if --atomic is used.
   * @default false
   */
  readonly atomic?: boolean;
  /**
   * create namespace if not exist
   * @default true
   */
  readonly createNamespace?: boolean;
  /**
   * if set, no CRDs will be installed
   * @default - CRDs are installed if not already present
   */
  readonly skipCrds?: boolean;
  /**
   * Policy statement provider returns the policy required by the add-on to allow it to interact with AWS resources
   */
  readonly policyStatements?: PolicyStatement[];
  /**
   * AWS managed policies.
   */
  readonly managedPolices?: string[];
}

/**
 * EKS cluster interface
 * @internal
 */
export interface IEksCluster extends ICluster {
  /**
   * Add EKS add-ons
   */
  addAddon(props: AddOnProps): Promise<CfnAddon>;
  /**
   * Create role using by service accout.
   */
  createServiceAccountRole(args: {
    roleName: string;
    saName: string;
    namespace: string;
    policyStatements: PolicyStatement[];
    managedPolices: string[];
  }): IRole;
}

/**
 * The EksCluster construct extends eks.Cluster.
 */
export class EksCluster extends Cluster {
  /**
   * The Kubernetes version to run in the cluster
   */
  readonly kubernetesVersion: KubernetesVersion;

  private addons: {
    vpcCni?: CfnAddon;
    coreDns?: CfnAddon;
    kubeProxy?: CfnAddon;
    eksPodIdentityAgent?: CfnAddon;
    ebsCsi?: CfnAddon;
    efsCsi?: CfnAddon;
  };

  private charts: {
    awsForFluentBit?: HelmChart;
    prometheus?: HelmChart;
    awsLoadBalancerController?: HelmChart;
    grafana?: HelmChart;
    secretStore?: HelmChart;
  };

  constructor(scope: Construct, id: string, props: ClusterProps) {
    super(scope, id, props);
    this.kubernetesVersion = props.version;
    this.addons = {};
    this.charts = {};
  }

  async addAddon(props: AddOnProps) {
    let serviceAccount: ServiceAccount | undefined;
    let serviceAccountRoleArn: string | undefined;
    const namespace = props.namespace || 'kube-system';

    if (props.policyStatements || props.managedPolices) {
      const serviceAccountName = props.serviceAccountName || props.addOnName + '-sa';
      serviceAccount = this.addServiceAccount(serviceAccountName, {
        name: serviceAccountName,
        namespace,
      });
      props.policyStatements?.map(statement =>
        serviceAccount!.role.addToPrincipalPolicy(statement)
      );
      props.managedPolices?.map(name =>
        serviceAccount?.role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName(name))
      );
      serviceAccountRoleArn = serviceAccount.role.roleArn;
    }

    let version = props.version;
    if (!version) {
      version = await this.provideAddonVersion(props.addOnName);
    }

    const addOnProps = {
      addonName: props.addOnName,
      addonVersion: version,
      configurationValues: JSON.stringify(props.values || {}),
      clusterName: this.clusterName,
      serviceAccountRoleArn: serviceAccountRoleArn,
      resolveConflicts: 'OVERWRITE',
    };
    const cfnAddon = new CfnAddon(this, props.addOnName + '-addon', addOnProps);
    Logger.debug(`Add add-on ${props.addOnName}`);
    if (serviceAccount) {
      cfnAddon.node.addDependency(serviceAccount);
    }
    return cfnAddon;
  }

  private async provideAddonVersion(name: string) {
    const client = useAWSClient(EKSClient);

    let kubernetesVersion = this.kubernetesVersion.version;
    if (kubernetesVersion.startsWith('v')) {
      kubernetesVersion = kubernetesVersion.slice(1);
    }

    const response = await client.send(
      new DescribeAddonVersionsCommand({
        addonName: name,
        kubernetesVersion,
      })
    );
    if (!response.addons || response.addons.length === 0) {
      throw new Error(`No add-on versions found for addon-on ${name}`);
    }

    const defaultVersions = response.addons?.flatMap(addon =>
      addon.addonVersions?.filter(version =>
        version.compatibilities?.some(compatibility => compatibility.defaultVersion === true)
      )
    );
    const version = defaultVersions[0]?.addonVersion;
    if (!version) {
      throw new Error(`No default version found for addo-on ${name}`);
    }

    Logger.debug(`Core add-on ${name} has autoselected version ${version}`);
    return version;
  }

  createServiceAccountRole(args: {
    roleName: string;
    saName: string;
    namespace: string;
    policyStatements: PolicyStatement[];
    managedPolices: string[];
  }) {
    const {openIdConnectProviderIssuer} = this.openIdConnectProvider;
    const stringEquals = new CfnJson(this, args.roleName + '-string-equals', {
      value: {
        [`${openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com',
        [`${openIdConnectProviderIssuer}:sub`]: `system:serviceaccount:${args.namespace}:${args.saName}`,
      },
    });
    const role = new Role(this, args.roleName, {
      assumedBy: new OpenIdConnectPrincipal(this.openIdConnectProvider).withConditions({
        StringEquals: stringEquals,
      }),
    });
    args.policyStatements?.map(statement => role.addToPrincipalPolicy(statement));
    args.managedPolices?.map(name =>
      role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName(name))
    );
    return role;
  }

  /**
   * Enable Amazon VPC CNI plugin for Kubernetes Amazon EKS add-on.
   */
  async withVpcCni(props: VpcCniAddOnProps) {
    if (!this.addons.vpcCni) {
      this.addons.vpcCni = await addons.addVpcCni(this, props);
    }
    return this.addons.vpcCni;
  }

  /**
   * Enable  CoreDNS Amazon EKS add-on
   */
  async withCoreDns(props: CoreDnsAddOnProps) {
    if (!this.addons.coreDns) {
      this.addons.coreDns = await addons.addCoredns(this, props);
    }
    return this.addons.coreDns;
  }

  /**
   * Enable Kubernetes kube-proxy add-on
   */
  async withKubeProxy(props: KubeProxyAddOnProps) {
    if (!this.addons.kubeProxy) {
      this.addons.kubeProxy = await addons.addKubeProxy(this, props);
    }
    return this.addons.kubeProxy;
  }

  /**
   * Enable Amazon EKS Pod Identity Agent
   */
  async withEksPodIdentityAgent(props: EksPodIdentityAgentAddOnProps) {
    if (!this.addons.eksPodIdentityAgent) {
      this.addons.eksPodIdentityAgent = await addons.addEksPodIdentityAgent(this, props);
    }
    return this.addons.eksPodIdentityAgent;
  }

  /**
   * Enable Amazon EBS CSI driver
   */
  async withEbsCsi(props: EbsCsiDriverAddOnProps) {
    if (!this.addons.ebsCsi) {
      this.addons.ebsCsi = await addons.addAwsEbsDriver(this, props);
    }
    return this.addons.ebsCsi;
  }

  /**
   * Enable Amazon EFS CSI driver
   */
  async withEfsCsi(props: EfsCsiDriverProps) {
    if (!this.addons.efsCsi) {
      this.addons.efsCsi = await addons.addEfsCsiDriver(this, props);
    }
    return this.addons.efsCsi;
  }

  async withAwsForFluentBit(props: AwsForFluentBitAddOnProps) {
    if (!this.charts.awsForFluentBit) {
      this.charts.awsForFluentBit = await addons.addAwsForFluentBit(this, props);
    }
    return this.charts.awsForFluentBit;
  }

  async withPrometheus(props: PrometheusAddOnProps) {
    if (!this.charts.prometheus) {
      this.charts.prometheus = await addons.addPrometheus(this, props);
    }
    return this.charts.prometheus;
  }

  async withAwsLoadBalancerController(props: AwsLoadBalancerControllerProps) {
    if (!this.charts.awsLoadBalancerController) {
      this.charts.awsLoadBalancerController = await addons.addAwsLoadBalancerController(
        this,
        props
      );
    }
    return this.charts.awsLoadBalancerController;
  }

  async withGrafana(props: GrafanaProps) {
    if (!this.charts.grafana) {
      this.charts.grafana = await addons.addGrafana(this, props);
    }
    return this.charts.grafana;
  }

  async withSecretStore(props: SecretStoreAddOnProps) {
    if (!this.charts.secretStore) {
      this.charts.secretStore = await addons.addSecretsStore(this, props);
    }
    return this.charts.secretStore;
  }
}
