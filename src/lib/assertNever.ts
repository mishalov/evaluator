/**
 * assertNever — exhaustiveness check for discriminated unions.
 *
 * Call in the `default` branch of a switch over a discriminated union.
 * TypeScript will error at compile time if any case is unhandled.
 * At runtime, throws to surface impossible states.
 */
export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`)
}
