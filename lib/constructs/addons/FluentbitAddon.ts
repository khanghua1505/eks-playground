import {Role, PolicyStatement, OpenIdConnectPrincipal, ManagedPolicy} from 'aws-cdk-lib/aws-iam';
import {HelmChart, HelmChartProps} from 'aws-cdk-lib/aws-eks';
import {Construct} from 'constructs';
import {CfnJson} from 'aws-cdk-lib';

export interface AwsForFluentBitAddOnProps extends HelmChartProps {
  /**
   * Iam policies for the add-on.
   *
   * @default - CloudWatchAgentServerPolicy
   */
  readonly managedPolicies: string[];
  /**
   * Iam policies for the add-on.
   */
  readonly iamPolicies?: PolicyStatement[];
}

/**
 * Default props for the add-on.
 */
const defaultProps = {
  repository: 'https://aws.github.io/eks-charts',
  chart: 'aws-for-fluent-bit',
  version: '0.1.33',
  release: 'aws-for-fluent-bit',
  namespace: 'amazon-cloudwatch',
  createNamespace: true,
  values: {},
  iamPolicies: [],
  managedPolicies: ['CloudWatchAgentServerPolicy'],
} as const;

/**
 * AwsForFluentBitAddOn deploys FluentBit into an EKS cluster using the `aws-for-fluent-bit` Helm chart.
 * https://github.com/aws/eks-charts/tree/master/stable/aws-for-fluent-bit
 *
 * For information on how to configure the `aws-for-fluent-bit` Helm chart to forward logs and metrics to AWS services like CloudWatch or Kinesis, please view the values.yaml spec provided by the chart.
 * https://github.com/aws/eks-charts/blob/master/stable/aws-for-fluent-bit/values.yaml
 */
export class AwsForFluentBitAddOn extends Construct {
  private readonly props: AwsForFluentBitAddOnProps;

  constructor(scope: Construct, id: string, props: AwsForFluentBitAddOnProps) {
    super(scope, id);
    this.props = props;
    this.deploy();
  }

  protected deploy() {
    const {cluster} = this.props;
    const {openIdConnectProvider} = cluster;
    const namespace = this.props.namespace || defaultProps.namespace;
    const serviceAccountName = 'aws-for-fluent-bit-sa';

    // Create the FluentBut IAM role.
    const roleConditions = new CfnJson(this, '', {
      value: {
        [`${openIdConnectProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com',
        [`${openIdConnectProvider.openIdConnectProviderIssuer}:sub`]: `system:serviceaccount:${namespace}:${serviceAccountName}`,
      },
    });
    const role = new Role(this, 'AWSForFluentBitRole', {
      assumedBy: new OpenIdConnectPrincipal(cluster.openIdConnectProvider).withConditions({
        StringEquals: roleConditions,
      }),
    });

    const iamPolicies = this.props.iamPolicies || defaultProps.iamPolicies;
    iamPolicies.map(policy => role.addToPolicy(policy));

    const managedPolicies = this.props.managedPolicies || defaultProps.managedPolicies;
    managedPolicies.map(policyName =>
      role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName(policyName))
    );

    // Install AWS for fluent bit helm chart.
    const values = {
      serviceAccount: {
        create: true,
        name: serviceAccountName,
        annotations: {
          'eks.amazonaws.com/role-arn': role.roleArn,
        },
      },
      ...this.props.values,
    };

    const chart = new HelmChart(this, 'aws-for-fluent-bit', {
      cluster: this.props.cluster,
      repository: this.props.repository ?? defaultProps.repository,
      chart: this.props.chart ?? defaultProps.chart,
      version: this.props.version ?? defaultProps.version,
      release: this.props.release ?? defaultProps.release,
      namespace,
      createNamespace: true,
      values: values,
    });
    chart.node.addDependency(role);
  }
}
