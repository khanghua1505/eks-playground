import {KubernetesManifest, KubernetesPatch} from 'aws-cdk-lib/aws-eks';
import * as kms from 'aws-cdk-lib/aws-kms';
import {PolicyStatement} from 'aws-cdk-lib/aws-iam';
import type {IEksCluster, AddOnProps} from '../Eks';

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

export async function addAwsEbsDriver(cluster: IEksCluster, props: EbsCsiDriverAddOnProps) {
  const addonProps = {
    addOnName: 'aws-ebs-csi-driver',
    serviceAccountName: 'ebs-csi-controller-sa',
    storageClass: 'gp3',
    policyStatements: getEbsDriverPolicyStatements(props.kmsKeys),
    ...props,
  };
  const addon = await cluster.addAddon(addonProps);

  const patchSc = new KubernetesPatch(cluster, 'RemoveGP2SC', {
    cluster: cluster,
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
  const updateSc = new KubernetesManifest(cluster, 'SetDefaultSC', {
    cluster: cluster,
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

  return addon;
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
