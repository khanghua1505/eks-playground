import app from '../lib/app';
import {Vpc} from './Vpc';

const stacks = (() => {
  app.stack(Vpc);
})();

export default stacks;
