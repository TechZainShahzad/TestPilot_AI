/**
 * Parses rendered currency text (e.g. `"Total: $43.18"`, `"-$5.00"`) into a
 * number, stripping any label prefix, so specs can assert on amounts without
 * hand-parsing the string themselves.
 */
export function parseCurrency(text: string): number {
  const trimmed = text.trim();
  const negative = trimmed.startsWith('-');
  const digits = trimmed.replace(/[^0-9.]/g, '');
  const value = Number.parseFloat(digits);
  if (Number.isNaN(value)) {
    throw new Error(`Could not parse "${text}" as a currency amount.`);
  }
  return negative ? -value : value;
}
