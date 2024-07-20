import app from '../lib/cdk/app';
import {Vpc} from './Vpc';

const stacks = (() => {
  app.stack(Vpc);
})();

export default stacks;
