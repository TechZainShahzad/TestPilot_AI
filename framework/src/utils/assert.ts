/**
 * Narrows a possibly-`undefined` value (typically from array indexing, which
 * `noUncheckedIndexedAccess` always types as possibly-missing) to its defined
 * type, or fails the test with a clear message. Not a replacement for
 * `expect` assertions — this is for values the test needs to *use*
 * afterwards, where throwing immediately gives a better stack trace than
 * letting `undefined` propagate into the next call.
 */
export function defined<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}
