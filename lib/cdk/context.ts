import {App} from '../constructs/App';

/**
 * @internal
 */
export const AppContext = (() => {
  let app: App | undefined;

  return {
    set(input: App) {
      app = input;
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
