import { Injectable } from '@nestjs/common';
import { AlertDirection } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface AlertLike {
  id: string;
  direction: AlertDirection;
  threshold: Decimal;
  active: boolean;
}

export interface TriggeredAlert {
  alertId: string;
  rate: Decimal;
}

/**
 * Pure crossing logic — no DB access, so the "no re-trigger while a
 * condition merely persists" rule is testable in isolation. Alerts fire only
 * on the transition (prev fails the condition, new satisfies it); a rate
 * that stays above/below the threshold day after day must not re-fire.
 */
@Injectable()
export class RateAlertEvaluatorService {
  evaluate(prevRate: Decimal | null, newRate: Decimal, alerts: AlertLike[]): TriggeredAlert[] {
    // First-ever snapshot: there is no prior rate to cross from.
    if (prevRate === null) return [];

    const triggered: TriggeredAlert[] = [];
    for (const alert of alerts) {
      if (!alert.active) continue;

      const crossedAbove =
        alert.direction === AlertDirection.ABOVE &&
        prevRate.lessThan(alert.threshold) &&
        newRate.greaterThanOrEqualTo(alert.threshold);

      const crossedBelow =
        alert.direction === AlertDirection.BELOW &&
        prevRate.greaterThan(alert.threshold) &&
        newRate.lessThanOrEqualTo(alert.threshold);

      if (crossedAbove || crossedBelow) {
        triggered.push({ alertId: alert.id, rate: newRate });
      }
    }
    return triggered;
  }
}
