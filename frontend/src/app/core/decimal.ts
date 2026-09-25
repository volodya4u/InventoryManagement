// Quantities are exact decimals on the server but binary floats here, where 0.1 * 3 is
// 0.30000000000000004. These helpers round results back to the decimals they represent.

export function multiplyDecimals(left: number, right: number): number {
  return roundToPlaces(left * right, decimalPlaces(left) + decimalPlaces(right));
}

export function subtractDecimals(left: number, right: number): number {
  return roundToPlaces(left - right, Math.max(decimalPlaces(left), decimalPlaces(right)));
}

/** How many whole times the divisor fits into the dividend. */
export function wholeQuotient(dividend: number, divisor: number): number {
  const scale = 10 ** Math.max(decimalPlaces(dividend), decimalPlaces(divisor));
  return Math.floor(Math.round(dividend * scale) / Math.round(divisor * scale));
}

function decimalPlaces(value: number): number {
  const [digits, exponent = '0'] = String(value).toLowerCase().split('e');
  const fractionDigits = digits.split('.')[1]?.length ?? 0;
  return Math.max(0, fractionDigits - Number(exponent));
}

function roundToPlaces(value: number, places: number): number {
  return Number(value.toFixed(Math.min(places, 100)));
}
