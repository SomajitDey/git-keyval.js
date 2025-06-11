export default function noop (...args) {
  return args.length > 1 ? args : args[0];
}

export async function asyncNoop (...args) {
  return noop(...args);
}

export const identity = noop;

export const asyncIdentity = asyncNoop;
