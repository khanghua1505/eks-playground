import {camelCase} from 'change-case-all';
import {App} from './App';
import {Stack, StackProps} from './Stack';
import {setContext} from '../../context';

export function stack(
  app: App,
  fn: FunctionalStack<any, any>,
  props?: StackProps & {[key: string]: any}
) {
  currentApp = app;
  currentStack = fn;
  const id = props?.id || camelCase(fn.name);
  const exists = getExports(app).has(fn);
  if (exists)
    throw new Error(`StackDuplicates: Attempting to initialize stack ${id} several times`);

  class EmptyStack extends Stack {
    constructor(scope: App, id: string, props?: StackProps) {
      super(scope, id, props);
    }
  }
  const stack = new EmptyStack(app, id, props);
  getStacks(app).set(fn, stack);
  const ctx: StackContext<any> = {
    app,
    stack,
    props,
  };
  const returns = fn.bind(stack)(ctx);
  if (returns && 'then' in returns)
    return returns.then((data: any) => {
      getExports(app).set(fn, data);
      setContext(id, data);
    });

  getExports(app).set(fn, returns);
  setContext(id, returns);
  return app;
}

let currentApp: App;
let currentStack: FunctionalStack<any, any>;
const exportsCache = new Map<App, Map<FunctionalStack<any, any>, any>>();
const stackCache = new Map<App, Map<FunctionalStack<any, any>, Stack>>();

function getExports(app: App) {
  if (!exportsCache.has(app)) exportsCache.set(app, new Map());
  return exportsCache.get(app)!;
}

function getStacks(app: App) {
  if (!stackCache.has(app)) stackCache.set(app, new Map());
  return stackCache.get(app)!;
}

export function use<C, R>(stack: FunctionalStack<C, R>): R {
  if (!currentApp) throw new Error('No app is set');
  const exports = getExports(currentApp);
  if (!exports.has(stack))
    throw new Error(
      `StackWrongOrder: Initialize "${stack.name}" stack before "${currentStack?.name}" stack`
    );
  return exports.get(stack);
}

export function dependsOn(stack: FunctionalStack<any, any>) {
  const current = getStack(currentStack);
  const target = getStack(stack)!;
  current!.addDependency(target);
}

export function getStack(stack: FunctionalStack<any, any>) {
  if (!currentApp) throw new Error('No app is set');
  const stacks = getStacks(currentApp);
  if (!stacks.has(stack))
    throw new Error(
      `StackWrongOrder: Initialize "${stack.name}" stack before "${currentStack?.name}" stack`
    );

  return stacks.get(stack)!;
}

export type StackContext<T> = {
  app: App;
  stack: Stack;
  props: T;
};

export type FunctionalStack<C, R> = (this: Stack, ctx: StackContext<C>) => R | Promise<R>;
