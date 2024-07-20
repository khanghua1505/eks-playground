import app from '../lib/cdk/app';

(async () => {
  await app.initApp();
  await import('../stacks');
  app.synth();
})();
