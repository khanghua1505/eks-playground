#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { EksPlaygroundStack } from '../lib/eks-playground-stack';

const app = new cdk.App();
new EksPlaygroundStack(app, 'EksPlaygroundStack');
