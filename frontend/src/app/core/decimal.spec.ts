import {
  addDecimals,
  divideDecimals,
  multiplyDecimals,
  roundHalfUp,
  subtractDecimals,
  wholeQuotient,
} from './decimal';

describe('decimal helpers', () => {
  it('multiplies without floating-point drift', () => {
    expect(multiplyDecimals(0.1, 3)).toBe(0.3);
    expect(multiplyDecimals(0.2, 3)).toBe(0.6);
    expect(multiplyDecimals(1.1, 3)).toBe(3.3);
    expect(multiplyDecimals(0.15, 3)).toBe(0.45);
    expect(multiplyDecimals(0.0000001, 3)).toBe(0.0000003);
  });

  it('adds without floating-point drift', () => {
    expect(addDecimals(0.1, 0.2)).toBe(0.3);
    expect(addDecimals(0.1, 0.7)).toBe(0.8);
    expect(addDecimals(1.1, 2.2)).toBe(3.3);
    expect(addDecimals(-0.1, 0.3)).toBe(0.2);
    expect(addDecimals(0.00000012, 0.00000006)).toBe(0.00000018);
    expect(addDecimals(6.67, 20)).toBe(26.67);
  });

  it('subtracts without floating-point drift', () => {
    expect(subtractDecimals(0.3, 0.3)).toBe(0);
    expect(subtractDecimals(0.7, 0.4)).toBe(0.3);
    expect(subtractDecimals(3.3, 1)).toBe(2.3);
  });

  it('rounds half up like the server', () => {
    expect(roundHalfUp(4.015, 2)).toBe(4.02);
    expect(roundHalfUp(2.135, 2)).toBe(2.14);
    expect(roundHalfUp(2.175, 2)).toBe(2.18);
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
    expect(roundHalfUp(2.5549, 2)).toBe(2.55);
    expect(roundHalfUp(2.5549999, 2)).toBe(2.55);
    expect(roundHalfUp(12, 2)).toBe(12);
    expect(roundHalfUp(-2.135, 2)).toBe(-2.14);
    expect(roundHalfUp(-0.001, 2)).toBe(0);
  });

  it('divides and rounds the exact quotient half up like the server', () => {
    // 0.21 / 6 is exactly 0.035, but 0.034999999999999996 in floating point.
    expect(divideDecimals(0.21, 6, 2)).toBe(0.04);
    expect(divideDecimals(4.35, 2, 2)).toBe(2.18);
    expect(divideDecimals(1, 3, 2)).toBe(0.33);
    expect(divideDecimals(2, 3, 2)).toBe(0.67);
    expect(divideDecimals(0.3, 0.1, 0)).toBe(3);
    expect(divideDecimals(-0.07, 2, 2)).toBe(-0.04);
    expect(divideDecimals(0.07, -2, 2)).toBe(-0.04);
    expect(divideDecimals(-0.001, 3, 2)).toBe(0);
  });

  it('divides what it cannot round like plain arithmetic', () => {
    expect(divideDecimals(1, 0, 2)).toBe(Number.POSITIVE_INFINITY);
    expect(divideDecimals(Number.NaN, 2, 2)).toBeNaN();
  });

  it('counts how many whole units fit', () => {
    expect(wholeQuotient(0.3, 0.1)).toBe(3);
    expect(wholeQuotient(3.3, 1.1)).toBe(3);
    expect(wholeQuotient(1, 0.8)).toBe(1);
    expect(wholeQuotient(12, 5)).toBe(2);
    expect(wholeQuotient(0, 0.5)).toBe(0);
  });
});
