/**
 * Pure conversion math — mirrors `rate-converter.service.ts` on the backend
 * exactly (JPY→VND: amount × rate, VND→JPY: amount ÷ rate). Duplicated
 * deliberately: `POST /rates/convert` exists, but debouncing a request per
 * keystroke would be pointless latency for arithmetic this simple. If the
 * two ever drift, switch the web client to the real endpoint instead of
 * patching around the difference (see phase-09's Key Insights).
 *
 * Operates on `number`, not the money-string type used elsewhere in the app —
 * this is a live preview for a chart/converter input, not a persisted or
 * server-authoritative amount, so the string-precision rule for `<Money>`
 * does not apply here.
 */
export function convertJpyToVnd(amountJpy: number, rate: number): number {
  return amountJpy * rate
}

export function convertVndToJpy(amountVnd: number, rate: number): number {
  return amountVnd / rate
}
