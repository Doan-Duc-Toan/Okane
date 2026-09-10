import { Currency } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { RateConverterService } from './rate-converter.service.js';

const RATE = new Decimal('168.43447600');

describe('RateConverterService', () => {
  const service = new RateConverterService();

  it('converts JPY -> VND by multiplying by the rate', () => {
    const result = service.convert(new Decimal('1000'), Currency.JPY, Currency.VND, RATE);
    expect(result?.toString()).toBe(new Decimal('1000').times(RATE).toDecimalPlaces(0).toString());
  });

  it('converts VND -> JPY by dividing by the rate', () => {
    const result = service.convert(new Decimal('168434'), Currency.VND, Currency.JPY, RATE);
    expect(result?.toString()).toBe(new Decimal('168434').dividedBy(RATE).toDecimalPlaces(0).toString());
  });

  it('round-trips within a rounding tolerance', () => {
    const jpy = new Decimal('50000');
    const vnd = service.convert(jpy, Currency.JPY, Currency.VND, RATE)!;
    const backToJpy = service.convert(vnd, Currency.VND, Currency.JPY, RATE)!;
    expect(backToJpy.minus(jpy).abs().lessThanOrEqualTo(1)).toBe(true);
  });

  it('same currency is an identity conversion', () => {
    const result = service.convert(new Decimal('12345'), Currency.JPY, Currency.JPY, RATE);
    expect(result?.toString()).toBe('12345');
  });

  it('handles zero', () => {
    const result = service.convert(new Decimal('0'), Currency.JPY, Currency.VND, RATE);
    expect(result?.toString()).toBe('0');
  });

  it('handles a very large amount without precision loss', () => {
    const result = service.convert(new Decimal('999999999'), Currency.JPY, Currency.VND, RATE);
    expect(result?.toString()).toBe(new Decimal('999999999').times(RATE).toDecimalPlaces(0).toString());
  });

  it('returns null when no rate is available and currencies differ', () => {
    const result = service.convert(new Decimal('1000'), Currency.JPY, Currency.VND, null);
    expect(result).toBeNull();
  });

  it('same-currency conversion needs no rate, even when null', () => {
    const result = service.convert(new Decimal('1000'), Currency.VND, Currency.VND, null);
    expect(result?.toString()).toBe('1000');
  });
});
