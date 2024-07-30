import {
  Cluster,
  ClusterProps as CDKClusterProps,
  ServiceAccount,
  KubernetesVersion,
  CfnAddon,
  KubernetesPatch,
  KubernetesManifest,
  HelmChart,
} from 'aws-cdk-lib/aws-eks';
import {
  Role,
  ManagedPolicy,
  PolicyStatement,
  OpenIdConnectPrincipal,
  Effect,
} from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import {EKSClient, DescribeAddonVersionsCommand} from '@aws-sdk/client-eks';
import {Construct} from 'constructs';
import {CfnJson, Duration, Stack} from 'aws-cdk-lib';
import {merge} from 'lodash';

import {Logger} from '../logger';
import {useAWSClient} from '../credentials';

type ClusterProps = CDKClusterProps;

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
 * `vpc-cni` addon properties
 *
 * Working with the Amazon VPC CNI plugin for Kubernetes Amazon EKS add-on
 * https://docs.aws.amazon.com/eks/latest/userguide/managing-vpc-cni.html
 */
export type VpcCniAddOnProps = Omit<
  AddOnProps,
  'addOnName' | 'policyStatements' | 'managedPolices'
>;

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

/**
 * `eks-pod-identity-agent` addon properties
 */
export type EksPodIdentityAgentAddOnProps = Omit<
  AddOnProps,
  'addOnName' | 'policyStatements' | 'managedPolices'
>;

export type EbsCsiDriverAddOnProps = Omit<
  AddOnProps,
  'addOnName' | 'policyStatements' | 'managedPolices'
> & {
  /**
   * List of KMS keys to be used for encryption
   */
  kmsKeys?: kms.Key[];
  /**
   * StorageClass to be used for the addon
   */
  storageClass?: string;
};

export type EfsCsiDriverProps = Omit<
  AddOnProps,
  'addOnName' | 'policyStatements' | 'managedPolices'
> & {
  /**
   * List of KMS keys to be used for encryption
   */
  kmsKeys?: kms.Key[];
};

export type AwsForFluentBitAddOnProps = Omit<HelmChartProps, 'policyStatements' | 'managedPolices'>;

export type PrometheusAddOnProps = Omit<HelmChartProps, 'policyStatements' | 'managedPolices'> & {
  readonly awsManagedPrometheus?: {
    readonly writeUrl: string;
  };
};

export type AwsLoadBalancerControllerProps = Omit<
  HelmChartProps,
  'policyStatements' | 'managedPolices'
>;

export type GrafanaProps = Omit<HelmChartProps, 'policyStatements' | 'managedPolices'>;

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
  };

  constructor(scope: Construct, id: string, props: ClusterProps) {
    super(scope, id, props);
    this.kubernetesVersion = props.version;
    this.addons = {};
    this.charts = {};
  }

  public async addAddon(props: AddOnProps) {
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

  /**
   * Enable Amazon VPC CNI plugin for Kubernetes Amazon EKS add-on.
   */
  public async withVpcCni(props: VpcCniAddOnProps) {
    if (!this.addons.vpcCni) {
      const addonProps = {
        addOnName: 'vpc-cni',
        serviceAccountName: 'vpc-cni',
        ...props,
      };
      this.addons.vpcCni = await this.addAddon(addonProps);
    }
    return this.addons.vpcCni;
  }

  /**
   * Enable  CoreDNS Amazon EKS add-on
   */
  public async withCoreDns(props: CoreDnsAddOnProps) {
    if (!this.addons.coreDns) {
      const addonProps = {
        addOnName: 'coredns',
        serviceAccountName: 'coredns',
        ...props,
      };
      this.addons.coreDns = await this.addAddon(addonProps);
    }
    return this.addons.coreDns;
  }

  /**
   * Enable Kubernetes kube-proxy add-on
   */
  public async withKubeProxy(props: KubeProxyAddOnProps) {
    if (!this.addons.kubeProxy) {
      const addonProps = {
        addOnName: 'kube-proxy',
        serviceAccountName: 'kube-proxy',
        ...props,
      };
      this.addons.kubeProxy = await this.addAddon(addonProps);
    }
    return this.addons.kubeProxy;
  }

  /**
   * Enable Amazon EKS Pod Identity Agent
   */
  public async withEksPodIdentityAgent(props: EksPodIdentityAgentAddOnProps) {
    if (!this.addons.eksPodIdentityAgent) {
      const addonProps = {
        addOnName: 'eks-pod-identity-agent',
        serviceAccountName: 'eks-pod-identity-agent-sa',
        ...props,
      };
      this.addons.eksPodIdentityAgent = await this.addAddon(addonProps);
    }
    return this.addons.eksPodIdentityAgent;
  }

  /**
   * Enable Amazon EBS CSI driver
   */
  public async withEbsCsi(props: EbsCsiDriverAddOnProps) {
    if (!this.addons.ebsCsi) {
      const addonProps = {
        addOnName: 'aws-ebs-csi-driver',
        serviceAccountName: 'ebs-csi-controller-sa',
        storageClass: 'gp3',
        policyStatements: getEbsDriverPolicyStatements(props.kmsKeys),
        ...props,
      };
      const addon = await this.addAddon(addonProps);

      const patchSc = new KubernetesPatch(this, 'RemoveGP2SC', {
        cluster: this,
        resourceName: 'storageclass/gp2',
        applyPatch: {
          metadata: {
            annotations: {
              'storageclass.kubernetes.io/is-default-class': 'false',
            },
          },
        },
        restorePatch: {
          metadata: {
            annotations: {
              'storageclass.kubernetes.io/is-default-class': 'true',
            },
          },
        },
      });

      // Create and set gp3 StorageClass as cluster-wide default
      const updateSc = new KubernetesManifest(this, 'SetDefaultSC', {
        cluster: this,
        manifest: [
          {
            apiVersion: 'storage.k8s.io/v1',
            kind: 'StorageClass',
            metadata: {
              name: 'gp3',
              annotations: {
                'storageclass.kubernetes.io/is-default-class': 'true',
              },
            },
            provisioner: 'ebs.csi.aws.com',
            reclaimPolicy: 'Delete',
            volumeBindingMode: 'WaitForFirstConsumer',
            parameters: {
              type: 'gp3',
              fsType: 'ext4',
              encrypted: 'true',
            },
          },
        ],
      });

      patchSc.node.addDependency(addon);
      updateSc.node.addDependency(patchSc);

      this.addons.ebsCsi = addon;
    }
    return this.addons.ebsCsi;
  }

  /**
   * Enable Amazon EFS CSI driver
   */
  public async withEfsCsi(props: EfsCsiDriverProps) {
    if (!this.addons.efsCsi) {
      const addonProps = {
        addOnName: 'aws-efs-csi-driver',
        serviceAccountName: 'aws-efs-csi-driver-sa',
        policyStatements: getEfsDriverPolicyStatements(props.kmsKeys),
        ...props,
      };
      this.addons.efsCsi = await this.addAddon(addonProps);
    }
    return this.addons.efsCsi;
  }

  /**
   * withAwsForFluentBit deploys FluentBit into an EKS cluster using the `aws-for-fluent-bit` Helm chart.
   * https://github.com/aws/eks-charts/tree/master/stable/aws-for-fluent-bit
   *
   * For information on how to configure the `aws-for-fluent-bit` Helm chart to forward logs and metrics to AWS services like CloudWatch or Kinesis, please view the values.yaml spec provided by the chart.
   * https://github.com/aws/eks-charts/blob/master/stable/aws-for-fluent-bit/values.yaml
   */
  public withAwsForFluentBit(props: AwsForFluentBitAddOnProps) {
    const defaultProps = {
      repository: 'https://aws.github.io/eks-charts',
      chart: 'aws-for-fluent-bit',
      release: 'aws-for-fluent-bit',
      namespace: 'amazon-cloudwatch',
      createNamespace: true,
      values: {},
    } as const;
    if (!this.charts.awsForFluentBit) {
      const namespace = props.namespace || defaultProps.namespace;
      const serviceAccountName = 'aws-for-fluent-bit-sa';
      const role = this.createRoleWithConditions({
        roleName: 'AWSForFluentBitRole',
        saName: serviceAccountName,
        namespace,
        policyStatements: [],
        managedPolices: ['CloudWatchAgentServerPolicy'],
      });
      // Install AWS for fluent bit helm chart.
      const chart = this.addHelmChart('aws-for-fluent-bit', {
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
      this.charts.awsForFluentBit = chart;
    }
    return this.charts.awsForFluentBit;
  }

  public withPrometheus(props: PrometheusAddOnProps) {
    const defaultProps = {
      repository: 'https://prometheus-community.github.io/helm-charts',
      chart: 'prometheus',
      release: 'prometheus',
      namespace: 'prometheus',
      createNamespace: true,
    } as const;
    const region = Stack.of(this).region;
    if (!this.charts.prometheus) {
      const namespace = props.namespace || defaultProps.namespace;
      const serviceAccountName = 'prometheus';
      const role = this.createRoleWithConditions({
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
      const chart = this.addHelmChart('prometheus', {
        ...defaultProps,
        ...props,
        namespace,
        values,
      });
      chart.node.addDependency(role);
      this.charts.prometheus = chart;
    }
    return this.charts.prometheus;
  }

  public withAwsLoadBalancerController(props: AwsLoadBalancerControllerProps) {
    const defaultProps = {
      repository: 'https://aws.github.io/eks-charts',
      chart: 'aws-load-balancer-controller',
      release: 'aws-load-balancer-controller',
      namespace: 'kube-system',
      createNamespace: true,
    } as const;
    if (!this.charts.awsLoadBalancerController) {
      const namespace = props.namespace || defaultProps.namespace;
      const policyStatements = getAwsLoadBalancerControllerStatements();
      const serviceAccountName = 'aws-load-balancer-controller';
      const role = this.createRoleWithConditions({
        roleName: 'AwsLoadBalancerController',
        saName: serviceAccountName,
        namespace,
        managedPolices: [],
        policyStatements,
      });
      // Install AWS Load Balancer Controller using Helm
      const chart = this.addHelmChart('aws-load-balancer-controller', {
        ...defaultProps,
        ...props,
        namespace,
        values: {
          clusterName: this.clusterName,
          serviceAccount: {
            create: true,
            name: serviceAccountName,
            annotations: {
              'eks.amazonaws.com/role-arn': role.roleArn,
            },
          },
          ...props.values,
        },
      });
      chart.node.addDependency(role);
      this.charts.awsLoadBalancerController = chart;
    }
    return this.charts.awsLoadBalancerController;
  }

  public withGrafana(props: GrafanaProps) {
    const defaultProps = {
      repository: 'https://grafana.github.io/helm-charts',
      chart: 'grafana',
      release: 'grafana',
      namespace: 'monitoring',
      createNamespace: true,
    } as const;
    if (!this.charts.grafana) {
      const namespace = props.namespace || defaultProps.namespace;
      const serviceAccountName = 'grafana';
      const role = this.createRoleWithConditions({
        roleName: 'Grafana',
        saName: serviceAccountName,
        namespace,
        managedPolices: [],
        policyStatements: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
              'aps:QueryMetrics',
              'aps:GetMetricMetadata',
              'aps:GetSeries',
              'aps:GetLabels',
            ],
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
      const chart = this.addHelmChart('grafana', {
        ...defaultProps,
        ...props,
        namespace,
        values,
      });
      chart.node.addDependency(role);
      this.charts.grafana = chart;
    }
    return this.charts.grafana;
  }

  private createRoleWithConditions(args: {
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
}

interface Statement {
  Effect: string;
  Action: string | string[];
  Resource: string | string[];
  Condition?: {
    StringEquals?: {[key: string]: string | string[]};
    StringLike?: {[key: string]: string};
    Bool?: {[key: string]: string};
    Null?: {[key: string]: string};
  };
}

function getEbsDriverPolicyStatements(kmsKeys?: kms.Key[]): PolicyStatement[] {
  const statements: Statement[] = [
    {
      Effect: 'Allow',
      Action: [
        'ec2:CreateSnapshot',
        'ec2:AttachVolume',
        'ec2:DetachVolume',
        'ec2:ModifyVolume',
        'ec2:DescribeAvailabilityZones',
        'ec2:DescribeInstances',
        'ec2:DescribeSnapshots',
        'ec2:DescribeTags',
        'ec2:DescribeVolumes',
        'ec2:DescribeVolumesModifications',
      ],
      Resource: '*',
    },
    {
      Effect: 'Allow',
      Action: ['ec2:CreateTags'],
      Resource: ['arn:aws:ec2:*:*:volume/*', 'arn:aws:ec2:*:*:snapshot/*'],
      Condition: {
        StringEquals: {
          'ec2:CreateAction': ['CreateVolume', 'CreateSnapshot'],
        },
      },
    },
    {
      Effect: 'Allow',
      Action: ['ec2:DeleteTags'],
      Resource: ['arn:aws:ec2:*:*:volume/*', 'arn:aws:ec2:*:*:snapshot/*'],
    },
    {
      Effect: 'Allow',
      Action: ['ec2:CreateVolume'],
      Resource: '*',
      Condition: {
        StringLike: {
          'aws:RequestTag/ebs.csi.aws.com/cluster': 'true',
        },
      },
    },
    {
      Effect: 'Allow',
      Action: ['ec2:CreateVolume'],
      Resource: '*',
      Condition: {
        StringLike: {
          'aws:RequestTag/CSIVolumeName': '*',
        },
      },
    },
    {
      Effect: 'Allow',
      Action: ['ec2:CreateVolume'],
      Resource: '*',
      Condition: {
        StringLike: {
          'aws:RequestTag/kubernetes.io/cluster/*': 'owned',
        },
      },
    },
    {
      Effect: 'Allow',
      Action: ['ec2:DeleteVolume'],
      Resource: '*',
      Condition: {
        StringLike: {
          'ec2:ResourceTag/ebs.csi.aws.com/cluster': 'true',
        },
      },
    },
    {
      Effect: 'Allow',
      Action: ['ec2:DeleteVolume'],
      Resource: '*',
      Condition: {
        StringLike: {
          'ec2:ResourceTag/CSIVolumeName': '*',
        },
      },
    },
    {
      Effect: 'Allow',
      Action: ['ec2:DeleteVolume'],
      Resource: '*',
      Condition: {
        StringLike: {
          'ec2:ResourceTag/kubernetes.io/cluster/*': 'owned',
        },
      },
    },
    {
      Effect: 'Allow',
      Action: ['ec2:DeleteSnapshot'],
      Resource: '*',
      Condition: {
        StringLike: {
          'ec2:ResourceTag/CSIVolumeSnapshotName': '*',
        },
      },
    },
    {
      Effect: 'Allow',
      Action: ['ec2:DeleteSnapshot'],
      Resource: '*',
      Condition: {
        StringLike: {
          'ec2:ResourceTag/ebs.csi.aws.com/cluster': 'true',
        },
      },
    },
  ];

  if (kmsKeys) {
    const kmsKeysArns = kmsKeys.map(k => k.keyArn);
    const kmsPolicy: Statement[] = [
      {
        Effect: 'Allow',
        Action: ['kms:CreateGrant', 'kms:ListGrants', 'kms:RevokeGrant'],
        Resource: kmsKeysArns,
        Condition: {
          Bool: {
            'kms:GrantIsForAWSResource': 'true',
          },
        },
      },
      {
        Effect: 'Allow',
        Action: [
          'kms:Encrypt',
          'kms:Decrypt',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kms:DescribeKey',
        ],
        Resource: kmsKeysArns,
      },
    ];
    statements.push(...kmsPolicy);
  }

  return statements.map(statement => PolicyStatement.fromJson(statement));
}

function getEfsDriverPolicyStatements(kmsKeys?: kms.Key[]): PolicyStatement[] {
  const result: Statement[] = [
    {
      Effect: 'Allow',
      Action: [
        'elasticfilesystem:DescribeAccessPoints',
        'elasticfilesystem:DescribeFileSystems',
        'elasticfilesystem:DescribeMountTargets',
        'ec2:DescribeAvailabilityZones',
      ],
      Resource: '*',
    },
    {
      Effect: 'Allow',
      Action: ['elasticfilesystem:CreateAccessPoint', 'elasticfilesystem:TagResource'],
      Resource: '*',
      Condition: {
        StringLike: {
          'aws:RequestTag/efs.csi.aws.com/cluster': 'true',
        },
      },
    },
    {
      Effect: 'Allow',
      Action: 'elasticfilesystem:DeleteAccessPoint',
      Resource: '*',
      Condition: {
        StringEquals: {
          'aws:ResourceTag/efs.csi.aws.com/cluster': 'true',
        },
      },
    },
  ];
  if (kmsKeys) {
    const kmsKeysArns = kmsKeys.map(k => k.keyArn);
    const kmsPolicy: Statement[] = [
      {
        Effect: 'Allow',
        Action: ['kms:CreateGrant', 'kms:ListGrants', 'kms:RevokeGrant'],
        Resource: kmsKeysArns,
        Condition: {
          Bool: {
            'kms:GrantIsForAWSResource': 'true',
          },
        },
      },
      {
        Effect: 'Allow',
        Action: [
          'kms:Encrypt',
          'kms:Decrypt',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kms:DescribeKey',
        ],
        Resource: kmsKeysArns,
      },
    ];
    result.push(...kmsPolicy);
  }
  return result.map(statement => PolicyStatement.fromJson(statement));
}

function getAwsLoadBalancerControllerStatements(): PolicyStatement[] {
  const statements: Statement[] = [
    {
      Effect: 'Allow',
      Action: ['iam:CreateServiceLinkedRole'],
      Resource: '*',
      Condition: {
        StringEquals: {
          'iam:AWSServiceName': 'elasticloadbalancing.amazonaws.com',
        },
      },
    },
    {
      Effect: 'Allow',
      Action: [
        'ec2:DescribeAccountAttributes',
        'ec2:DescribeAddresses',
        'ec2:DescribeAvailabilityZones',
        'ec2:DescribeInternetGateways',
        'ec2:DescribeVpcs',
        'ec2:DescribeVpcPeeringConnections',
        'ec2:DescribeSubnets',
        'ec2:DescribeSecurityGroups',
        'ec2:DescribeInstances',
        'ec2:DescribeNetworkInterfaces',
        'ec2:DescribeTags',
        'ec2:GetCoipPoolUsage',
        'ec2:DescribeCoipPools',
        'elasticloadbalancing:DescribeLoadBalancers',
        'elasticloadbalancing:DescribeLoadBalancerAttributes',
        'elasticloadbalancing:DescribeListeners',
        'elasticloadbalancing:DescribeListenerCertificates',
        'elasticloadbalancing:DescribeSSLPolicies',
        'elasticloadbalancing:DescribeRules',
        'elasticloadbalancing:DescribeTargetGroups',
        'elasticloadbalancing:DescribeTargetGroupAttributes',
        'elasticloadbalancing:DescribeTargetHealth',
        'elasticloadbalancing:DescribeTags',
        'elasticloadbalancing:DescribeTrustStores',
      ],
      Resource: '*',
    },
    {
      Effect: 'Allow',
      Action: [
        'cognito-idp:DescribeUserPoolClient',
        'acm:ListCertificates',
        'acm:DescribeCertificate',
        'iam:ListServerCertificates',
        'iam:GetServerCertificate',
        'waf-regional:GetWebACL',
        'waf-regional:GetWebACLForResource',
        'waf-regional:AssociateWebACL',
        'waf-regional:DisassociateWebACL',
        'wafv2:GetWebACL',
        'wafv2:GetWebACLForResource',
        'wafv2:AssociateWebACL',
        'wafv2:DisassociateWebACL',
        'shield:GetSubscriptionState',
        'shield:DescribeProtection',
        'shield:CreateProtection',
        'shield:DeleteProtection',
      ],
      Resource: '*',
    },
    {
      Effect: 'Allow',
      Action: ['ec2:AuthorizeSecurityGroupIngress', 'ec2:RevokeSecurityGroupIngress'],
      Resource: '*',
    },
    {
      Effect: 'Allow',
      Action: ['ec2:CreateSecurityGroup'],
      Resource: '*',
    },
    {
      Effect: 'Allow',
      Action: ['ec2:CreateTags'],
      Resource: 'arn:aws:ec2:*:*:security-group/*',
      Condition: {
        StringEquals: {
          'ec2:CreateAction': 'CreateSecurityGroup',
        },
        Null: {
          'aws:RequestTag/elbv2.k8s.aws/cluster': 'false',
        },
      },
    },
    {
      Effect: 'Allow',
      Action: ['ec2:CreateTags', 'ec2:DeleteTags'],
      Resource: 'arn:aws:ec2:*:*:security-group/*',
      Condition: {
        Null: {
          'aws:RequestTag/elbv2.k8s.aws/cluster': 'true',
          'aws:ResourceTag/elbv2.k8s.aws/cluster': 'false',
        },
      },
    },
    {
      Effect: 'Allow',
      Action: [
        'ec2:AuthorizeSecurityGroupIngress',
        'ec2:RevokeSecurityGroupIngress',
        'ec2:DeleteSecurityGroup',
      ],
      Resource: '*',
      Condition: {
        Null: {
          'aws:ResourceTag/elbv2.k8s.aws/cluster': 'false',
        },
      },
    },
    {
      Effect: 'Allow',
      Action: ['elasticloadbalancing:CreateLoadBalancer', 'elasticloadbalancing:CreateTargetGroup'],
      Resource: '*',
      Condition: {
        Null: {
          'aws:RequestTag/elbv2.k8s.aws/cluster': 'false',
        },
      },
    },
    {
      Effect: 'Allow',
      Action: [
        'elasticloadbalancing:CreateListener',
        'elasticloadbalancing:DeleteListener',
        'elasticloadbalancing:CreateRule',
        'elasticloadbalancing:DeleteRule',
      ],
      Resource: '*',
    },
    {
      Effect: 'Allow',
      Action: ['elasticloadbalancing:AddTags', 'elasticloadbalancing:RemoveTags'],
      Resource: [
        'arn:aws:elasticloadbalancing:*:*:targetgroup/*/*',
        'arn:aws:elasticloadbalancing:*:*:loadbalancer/net/*/*',
        'arn:aws:elasticloadbalancing:*:*:loadbalancer/app/*/*',
      ],
      Condition: {
        Null: {
          'aws:RequestTag/elbv2.k8s.aws/cluster': 'true',
          'aws:ResourceTag/elbv2.k8s.aws/cluster': 'false',
        },
      },
    },
    {
      Effect: 'Allow',
      Action: ['elasticloadbalancing:AddTags', 'elasticloadbalancing:RemoveTags'],
      Resource: [
        'arn:aws:elasticloadbalancing:*:*:listener/net/*/*/*',
        'arn:aws:elasticloadbalancing:*:*:listener/app/*/*/*',
        'arn:aws:elasticloadbalancing:*:*:listener-rule/net/*/*/*',
        'arn:aws:elasticloadbalancing:*:*:listener-rule/app/*/*/*',
      ],
    },
    {
      Effect: 'Allow',
      Action: [
        'elasticloadbalancing:ModifyLoadBalancerAttributes',
        'elasticloadbalancing:SetIpAddressType',
        'elasticloadbalancing:SetSecurityGroups',
        'elasticloadbalancing:SetSubnets',
        'elasticloadbalancing:DeleteLoadBalancer',
        'elasticloadbalancing:ModifyTargetGroup',
        'elasticloadbalancing:ModifyTargetGroupAttributes',
        'elasticloadbalancing:DeleteTargetGroup',
      ],
      Resource: '*',
      Condition: {
        Null: {
          'aws:ResourceTag/elbv2.k8s.aws/cluster': 'false',
        },
      },
    },
    {
      Effect: 'Allow',
      Action: ['elasticloadbalancing:AddTags'],
      Resource: [
        'arn:aws:elasticloadbalancing:*:*:targetgroup/*/*',
        'arn:aws:elasticloadbalancing:*:*:loadbalancer/net/*/*',
        'arn:aws:elasticloadbalancing:*:*:loadbalancer/app/*/*',
      ],
      Condition: {
        StringEquals: {
          'elasticloadbalancing:CreateAction': ['CreateTargetGroup', 'CreateLoadBalancer'],
        },
        Null: {
          'aws:RequestTag/elbv2.k8s.aws/cluster': 'false',
        },
      },
    },
    {
      Effect: 'Allow',
      Action: ['elasticloadbalancing:RegisterTargets', 'elasticloadbalancing:DeregisterTargets'],
      Resource: 'arn:aws:elasticloadbalancing:*:*:targetgroup/*/*',
    },
    {
      Effect: 'Allow',
      Action: [
        'elasticloadbalancing:SetWebAcl',
        'elasticloadbalancing:ModifyListener',
        'elasticloadbalancing:AddListenerCertificates',
        'elasticloadbalancing:RemoveListenerCertificates',
        'elasticloadbalancing:ModifyRule',
      ],
      Resource: '*',
    },
  ];
  return statements.map(statement => PolicyStatement.fromJson(statement));
}
