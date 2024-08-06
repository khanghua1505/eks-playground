import * as kms from 'aws-cdk-lib/aws-kms';
import {PolicyStatement} from 'aws-cdk-lib/aws-iam';
import type {IEksCluster, AddOnProps} from '../Eks';

export type EfsCsiDriverProps = Omit<
  AddOnProps,
  'addOnName' | 'policyStatements' | 'managedPolices'
> & {
  /**
   * List of KMS keys to be used for encryption
   */
  kmsKeys?: kms.Key[];
};

export async function addEfsCsiDriver(cluster: IEksCluster, props: EfsCsiDriverProps) {
  const addonProps = {
    addOnName: 'aws-efs-csi-driver',
    serviceAccountName: 'aws-efs-csi-driver-sa',
    policyStatements: getEfsDriverPolicyStatements(props.kmsKeys),
    ...props,
  };
  return await cluster.addAddon(addonProps);
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
