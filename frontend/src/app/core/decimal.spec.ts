import { multiplyDecimals, subtractDecimals, wholeQuotient } from './decimal';

describe('decimal helpers', () => {
  it('multiplies without floating-point drift', () => {
    expect(multiplyDecimals(0.1, 3)).toBe(0.3);
    expect(multiplyDecimals(0.2, 3)).toBe(0.6);
    expect(multiplyDecimals(1.1, 3)).toBe(3.3);
    expect(multiplyDecimals(0.15, 3)).toBe(0.45);
    expect(multiplyDecimals(0.0000001, 3)).toBe(0.0000003);
  });

  it('subtracts without floating-point drift', () => {
    expect(subtractDecimals(0.3, 0.3)).toBe(0);
    expect(subtractDecimals(0.7, 0.4)).toBe(0.3);
    expect(subtractDecimals(3.3, 1)).toBe(2.3);
  });

  it('counts how many whole units fit', () => {
    expect(wholeQuotient(0.3, 0.1)).toBe(3);
    expect(wholeQuotient(3.3, 1.1)).toBe(3);
    expect(wholeQuotient(1, 0.8)).toBe(1);
    expect(wholeQuotient(12, 5)).toBe(2);
    expect(wholeQuotient(0, 0.5)).toBe(0);
  });
});
