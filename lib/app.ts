import path from 'path';
import {useSTSIdentity} from './credentials';
import {initProject} from './project';
import {App} from './constructs/App';
import {AppContext, provideApp} from './context';
import {
  StackContext as FunctionalStackContext,
  FunctionalStack,
  use as useStack,
  dependsOn as dependsOnStack,
} from './constructs/FunctionStack';
import {StackProps} from './constructs/Stack';

export type StackContext = FunctionalStackContext;

export async function initApp() {
  const project = await initProject();
  const identity = await useSTSIdentity();
  process.chdir(project.paths.root);
  const app = new App(
    {
      account: identity.Account!,
      stage: project.config.stage,
      name: project.config.name,
      region: project.config.region,
    },
    {
      outdir: project.config.outputs,
    }
  );
  provideApp(app);
}

export async function synth() {
  await initApp();
  const app = AppContext.current!;
  const project = await initProject();
  const stacksRelPath = path.relative(__dirname, project.config.stackDir!);
  await import(stacksRelPath);
  const assembly = app.synth();
  return assembly;
}

export async function stack(fn: FunctionalStack<any>, props?: StackProps) {
  const app = AppContext.current!;
  if (!app) throw new Error('No app is set');
  app.stack(fn, props);
}

export function use<T>(stack: FunctionalStack<T>): T {
  return useStack(stack);
}

export function dependsOn(stack: FunctionalStack<any>) {
  return dependsOnStack(stack);
}

export default {
  initApp,
  stack,
  use,
  dependsOn,
  synth,
};
