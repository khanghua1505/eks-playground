import {fromNodeProviderChain} from '@aws-sdk/credential-providers';
import {GetCallerIdentityCommand, STSClient} from '@aws-sdk/client-sts';
import {StandardRetryStrategy} from '@aws-sdk/middleware-retry';

import {Logger} from './logger';
import {useProject} from './project';
import {lazy} from './util/lazy';

export const useAWSCredentialsProvider = lazy(() => {
  const project = useProject();
  Logger.debug('Using AWS profile', project.config.profile);
  const provider = fromNodeProviderChain({
    clientConfig: {region: project.config.region},
    profile: project.config.profile,
    roleArn: project.config.role,
    mfaCodeProvider: async (serialArn: string) => {
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      return new Promise<string>(resolve => {
        Logger.debug(`Require MFA token for serial ARN ${serialArn}`);
        const prompt = () =>
          rl.question(`Enter MFA code for ${serialArn}: `, async input => {
            if (input.trim() !== '') {
              resolve(input.trim());
              rl.close();
            } else {
              // prompt again if no input
              prompt();
            }
          });
        prompt();
      });
    },
  });
  return provider;
});

export const useAWSCredentials = () => {
  const provider = useAWSCredentialsProvider();
  return provider();
};

export const useSTSIdentity = lazy(async () => {
  const sts = useAWSClient(STSClient);
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  Logger.debug('Using identity', 'Account:', identity.Account, 'User:', identity.UserId);
  return identity;
});

const useClientCache = lazy(() => new Map<string, any>());

export function useAWSClient<C>(client: new (config: any) => C, force = false) {
  const cache = useClientCache();
  const existing = cache.get(client.name);
  if (existing && !force) return existing as C;

  const [project, credentials] = [useProject(), useAWSCredentialsProvider()];
  const result = new client({
    region: project.config.region,
    credentials: credentials,
    retryStrategy: new StandardRetryStrategy(async () => 10000, {
      retryDecider: (e: any) => {
        // Handle throttling errors => retry
        if (
          [
            'ThrottlingException',
            'Throttling',
            'TooManyRequestsException',
            'OperationAbortedException',
            'TimeoutError',
            'NetworkingError',
          ].includes(e.name)
        ) {
          Logger.debug('Retry AWS call', e.name, e.message);
          return true;
        }

        return false;
      },
      delayDecider: (_, attempts) => {
        return Math.min(1.5 ** attempts * 100, 5000);
      },
      // AWS SDK v3 has an idea of "retry tokens" which are used to
      // prevent multiple retries from happening at the same time.
      // This is a workaround to disable that.
      retryQuota: {
        hasRetryTokens: () => true,
        releaseRetryTokens: () => {},
        retrieveRetryTokens: () => 1,
      },
    }),
  });
  cache.set(client.name, result);
  Logger.debug('Created AWS client', client.name);
  return result;
}
