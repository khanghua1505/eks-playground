import app from '../lib/app';
import {Vpc} from './Vpc';
import {EKS} from './Eks';

const stacks = (() => {
  app.stack(Vpc);
  app.stack(EKS);
})();

export default stacks;
