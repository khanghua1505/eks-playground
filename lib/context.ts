import {App} from './constructs/App';

/**
 * @internal
 */
export const AppContext = (() => {
  let app: App | undefined;
  const context: Record<string, any> = {};

  return {
    set(input: App) {
      app = input;
    },
    setContext(key: string, val: any) {
      context[key] = val;
    },
    get context() {
      return context;
    },
    get current() {
      return app;
    },
  };
})();

/**
 * @internal
 */
export function provideApp(app: App) {
  AppContext.set(app);
}

/**
 * @internal
 */
export function setContext(key: string, val: any) {
  AppContext.setContext(key, val);
}

/**
 * @internal
 */
export function getContext() {
  return AppContext.context;
}
