/** Exhaustiveness check for unions (e.g. unknown learning state must fail loudly). */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
