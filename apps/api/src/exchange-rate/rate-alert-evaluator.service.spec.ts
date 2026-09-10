import { AlertDirection } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { RateAlertEvaluatorService, type AlertLike } from './rate-alert-evaluator.service.js';

function alert(overrides: Partial<AlertLike> = {}): AlertLike {
  return {
    id: 'alert-1',
    direction: AlertDirection.ABOVE,
    threshold: new Decimal('170'),
    active: true,
    ...overrides,
  };
}

describe('RateAlertEvaluatorService', () => {
  const service = new RateAlertEvaluatorService();

  it('fires an ABOVE alert on crossing up (169 -> 171)', () => {
    const result = service.evaluate(new Decimal('169'), new Decimal('171'), [alert({ threshold: new Decimal('170') })]);
    expect(result).toEqual([{ alertId: 'alert-1', rate: new Decimal('171') }]);
  });

  it('does not re-fire the following day while still above (171 -> 172)', () => {
    const result = service.evaluate(new Decimal('171'), new Decimal('172'), [alert({ threshold: new Decimal('170') })]);
    expect(result).toEqual([]);
  });

  it('fires a BELOW alert on crossing down (170 -> 168)', () => {
    const result = service.evaluate(
      new Decimal('170'),
      new Decimal('168'),
      [alert({ direction: AlertDirection.BELOW, threshold: new Decimal('169') })],
    );
    expect(result).toEqual([{ alertId: 'alert-1', rate: new Decimal('168') }]);
  });

  it('does not re-fire a BELOW alert while the rate stays low', () => {
    const result = service.evaluate(
      new Decimal('168'),
      new Decimal('167'),
      [alert({ direction: AlertDirection.BELOW, threshold: new Decimal('169') })],
    );
    expect(result).toEqual([]);
  });

  it('fires exactly at the threshold boundary (crossing to equal)', () => {
    const result = service.evaluate(new Decimal('169'), new Decimal('170'), [alert({ threshold: new Decimal('170') })]);
    expect(result).toEqual([{ alertId: 'alert-1', rate: new Decimal('170') }]);
  });

  it('skips an inactive alert even if its condition crosses', () => {
    const result = service.evaluate(
      new Decimal('169'),
      new Decimal('171'),
      [alert({ threshold: new Decimal('170'), active: false })],
    );
    expect(result).toEqual([]);
  });

  it('does not fire on the first-ever snapshot (no prior rate to cross from)', () => {
    const result = service.evaluate(null, new Decimal('171'), [alert({ threshold: new Decimal('170') })]);
    expect(result).toEqual([]);
  });

  it('evaluates multiple alerts independently in one pass', () => {
    const result = service.evaluate(new Decimal('169'), new Decimal('171'), [
      alert({ id: 'a1', threshold: new Decimal('170') }),
      alert({ id: 'a2', threshold: new Decimal('175') }),
      alert({ id: 'a3', direction: AlertDirection.BELOW, threshold: new Decimal('160') }),
    ]);
    expect(result).toEqual([{ alertId: 'a1', rate: new Decimal('171') }]);
  });
});
