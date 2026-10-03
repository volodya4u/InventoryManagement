// Quantities are exact decimals on the server but binary floats here, where 0.1 * 3 is
// 0.30000000000000004. These helpers round results back to the decimals they represent.

export function multiplyDecimals(left: number, right: number): number {
  return roundToPlaces(left * right, decimalPlaces(left) + decimalPlaces(right));
}

export function addDecimals(left: number, right: number): number {
  return roundToPlaces(left + right, Math.max(decimalPlaces(left), decimalPlaces(right)));
}

export function subtractDecimals(left: number, right: number): number {
  return roundToPlaces(left - right, Math.max(decimalPlaces(left), decimalPlaces(right)));
}

/** Rounds half away from zero, like the server's RoundingMode.HALF_UP. */
export function roundHalfUp(value: number, places: number): number {
  const scale = 10 ** places;
  const rounded = Math.round(multiplyDecimals(Math.abs(value), scale)) / scale;
  return value < 0 && rounded !== 0 ? -rounded : rounded;
}

/** Divides exactly and rounds half away from zero, like divide(divisor, places, HALF_UP). */
export function divideDecimals(dividend: number, divisor: number, places: number): number {
  if (!Number.isFinite(dividend) || !Number.isFinite(divisor) || divisor === 0) {
    return dividend / divisor;
  }
  const scale = Math.max(decimalPlaces(dividend), decimalPlaces(divisor));
  const numerator = scaledInteger(dividend, scale) * 10n ** BigInt(places);
  const denominator = scaledInteger(divisor, scale);
  const quotient = (2n * abs(numerator) + abs(denominator)) / (2n * abs(denominator));
  const negative = numerator < 0n !== denominator < 0n;
  return Number(`${negative ? -quotient : quotient}e-${places}`);
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

/** The value times 10^places as an exact integer, for places of at least decimalPlaces(value). */
function scaledInteger(value: number, places: number): bigint {
  const [digits, exponent = '0'] = String(value).toLowerCase().split('e');
  const [whole, fraction = ''] = digits.split('.');
  return BigInt(whole + fraction) * 10n ** BigInt(places - fraction.length + Number(exponent));
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function roundToPlaces(value: number, places: number): number {
  return Number(value.toFixed(Math.min(places, 100)));
}
