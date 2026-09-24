/**
 * Canonical money: integer USD micros (1 USD = 1_000_000 micros) held as
 * `bigint`. Never binary floating point for a persisted or summed amount —
 * `0.1 + 0.2` style drift compounds across thousands of ledger rows.
 *
 * The persisted column in every app is a Postgres `BIGINT`, so every
 * arithmetic helper here is range-checked against a signed 64-bit integer
 * and throws `MicrosOverflowError` instead of silently wrapping or losing
 * precision on the way back to the database.
 */

export const MICROS_PER_UNIT = BigInt("1000000");

/** Postgres BIGINT range. */
export const MAX_MICROS = BigInt("9223372036854775807");
export const MIN_MICROS = BigInt("-9223372036854775808");

export class MicrosOverflowError extends RangeError {
  constructor(value: bigint) {
    super(`amount ${value} micros is outside the signed 64-bit range`);
    this.name = "MicrosOverflowError";
  }
}

export function assertMicrosInRange(value: bigint): bigint {
  if (value > MAX_MICROS || value < MIN_MICROS) throw new MicrosOverflowError(value);
  return value;
}

/**
 * Coerce a wire/DB representation into micros. Accepts `bigint`, a safe
 * integer `number`, or a base-10 integer string (how BIGINT arrives from
 * JSON and some drivers). Rejects fractional numbers — a fractional micro
 * is always a unit mistake upstream (dollars passed where micros belong).
 */
export function toMicros(value: bigint | number | string): bigint {
  if (typeof value === "bigint") return assertMicrosInRange(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`micros must be a safe integer, got ${value}`);
    }
    return BigInt(value);
  }
  if (!/^-?\d+$/.test(value)) throw new TypeError(`micros must be an integer string, got "${value}"`);
  return assertMicrosInRange(BigInt(value));
}

/**
 * Parse a decimal USD amount **from a string** into micros, rounding
 * half-away-from-zero at the 7th decimal. Strings, not numbers, because a
 * provider cost API returns decimal text (`"0.0012345"`) and routing it
 * through `Number` first would already have lost the exactness we want.
 */
export function usdDecimalToMicros(amount: string): bigint {
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!match) throw new TypeError(`not a decimal USD amount: "${amount}"`);
  const [, sign, whole, frac = ""] = match;
  const padded = (frac + "0000000").slice(0, 7);
  let micros = BigInt(whole) * MICROS_PER_UNIT + BigInt(padded.slice(0, 6));
  if (Number(padded[6]) >= 5) micros += BigInt("1");
  return assertMicrosInRange(sign ? -micros : micros);
}

/**
 * Bridge for legacy float columns (`costUsd Float`). Lossy by nature — the
 * float is already rounded — so the result is only ever labelled a legacy
 * amount, never written back as a canonical provider figure.
 */
export function legacyUsdFloatToMicros(amount: number): bigint {
  if (!Number.isFinite(amount)) throw new TypeError(`not a finite USD amount: ${amount}`);
  return usdDecimalToMicros(amount.toFixed(7));
}

/** Overflow-checked sum. */
export function sumMicros(values: Iterable<bigint>): bigint {
  let total = BigInt("0");
  for (const v of values) total = assertMicrosInRange(total + v);
  return total;
}

/**
 * `quantity × rate / per`, rounded half-up, all in integer arithmetic.
 * `rateMicros` is the price in micros for `per` units — e.g. $0.15 per
 * 1M tokens is `rateMicros = 150000, per = 1000000` (as bigints).
 */
export function multiplyRate(quantity: bigint, rateMicros: bigint, per: bigint): bigint {
  if (per <= BigInt("0")) throw new RangeError("rate denominator must be positive");
  if (quantity < BigInt("0")) throw new RangeError("usage quantity cannot be negative");
  const numerator = quantity * rateMicros;
  return assertMicrosInRange((numerator + per / BigInt("2")) / per);
}

/** Micros → decimal string with 6 fractional digits (exact, no float). */
export function microsToDecimalString(micros: bigint): string {
  const negative = micros < BigInt("0");
  const abs = negative ? -micros : micros;
  const whole = abs / MICROS_PER_UNIT;
  const frac = (abs % MICROS_PER_UNIT).toString().padStart(6, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/**
 * Locale-aware currency display. Uses at least 2 and up to 4 fraction
 * digits, so a sub-cent AI call reads `$0.0012` rather than rounding to a
 * misleading `$0.00`. `Intl.NumberFormat` accepts a decimal string, so the
 * value never passes through a float.
 */
export function formatMicros(
  micros: bigint,
  opts: { locale?: string; currency?: string; maximumFractionDigits?: number } = {},
): string {
  const formatter = new Intl.NumberFormat(opts.locale ?? "en-US", {
    style: "currency",
    currency: opts.currency ?? "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: opts.maximumFractionDigits ?? 4,
  });
  return formatter.format(microsToDecimalString(micros) as unknown as number);
}
