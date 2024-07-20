import app from '../lib/app';

(async () => {
  await app.initApp();
  await import('../stacks');
  app.synth();
})();
