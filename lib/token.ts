import {Eta} from 'eta';

import {VisibleError} from './error';
import {getContext} from './context';

export class Token<T = any> {
  readonly value: T;
  constructor(value: T) {
    this.value = value;
  }
}

export type Tokenize<T extends Record<string, any>> = {
  [key in keyof T]: T[key] extends Record<string, any> ? Tokenize<T[key]> : Token<T[key]>;
};

const isString = (value: any): boolean => typeof value === 'string';

const isLiteral = (value: any): boolean => ['string', 'number', 'boolean'].includes(typeof value);

const isObject = (value: any): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isArray = Array.isArray;

const isToken = (obj: any) => obj instanceof Token;

export function tokenize(value: any): any {
  const tokenizeLiteral = (value: any): Token => new Token(value);

  const tokenizeObject = (obj: any): Record<string, any> => {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = tokenize(value);
    }
    return result;
  };

  const tokenizeArray = (arr: any[]): any[] => arr.map(tokenize);

  if (isLiteral(value)) {
    return tokenizeLiteral(value);
  }
  if (isArray(value)) {
    return tokenizeArray(value);
  }
  if (isObject(value)) {
    return tokenizeObject(value);
  }
  if (value === undefined || value === null) {
    return value;
  }
  throw new VisibleError(`Cannot tokenize value: ${value}`);
}

const eta = new Eta({
  varName: '$',
});

const resolveLiteral = (tok: Token, data: any = {}): any => {
  if (isString(tok.value)) {
    return eta.renderStringAsync(tok.value, data);
  }
  return tok.value;
};

const resolveObject = async (obj: any): Promise<Record<string, any>> => {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = await resolve(val);
  }
  return result;
};

const resolveArray = async (arr: any[]): Promise<any[]> => {
  const result: any[] = [];
  for (const it of arr) {
    const r = await resolve(it);
    result.push(r);
  }
  return result;
};

export async function resolve(value: any): Promise<any> {
  const data = getContext();
  if (isToken(value)) {
    return await resolveLiteral(value, data);
  }
  if (isArray(value)) {
    return await resolveArray(value);
  }
  if (isObject(value)) {
    return await resolveObject(value);
  }
  if (value === undefined || value === null) {
    return value;
  }
  throw new VisibleError(`Cannot resolve value: ${value}`);
}
