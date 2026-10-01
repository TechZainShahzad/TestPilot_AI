/**
 * Parses ParaBank's rendered currency text (`"$1,234.56"`, `"-$5.00"`) into a
 * number, so UI assertions can compare against the API's raw numeric balance.
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
