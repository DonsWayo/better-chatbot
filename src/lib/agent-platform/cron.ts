// Agent Platform #22 — tiny pure cron engine (no dependency).
//
// Supports standard 5-field cron expressions:
//
//   ┌─ minute        (0-59)
//   │ ┌─ hour        (0-23)
//   │ │ ┌─ day of month (1-31)
//   │ │ │ ┌─ month   (1-12)
//   │ │ │ │ ┌─ day of week (0-7, 0 and 7 = Sunday)
//   * * * * *
//
// Each field accepts `*`, single values, lists (`,`), ranges (`-`) and steps
// (`/`), including combinations like `1-10/2` and `*/5`. Vixie-cron day
// semantics: when BOTH day-of-month and day-of-week are restricted the match
// is an OR; otherwise both must match (an unrestricted `*` matches all).
//
// Timezones:
//   - "UTC" (the default) uses exact Date UTC arithmetic.
//   - Any other IANA zone (e.g. "Europe/London") uses Intl.DateTimeFormat to
//     read the wall clock of each candidate instant in that zone. Precision
//     limits: correctness depends on the runtime's IANA tzdata; wall times
//     skipped by a spring-forward DST transition never fire that day, and
//     wall times repeated by a fall-back transition fire on their FIRST
//     (earlier UTC) occurrence only.

export class CronError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CronError";
  }
}

interface FieldSpec {
  name: string;
  min: number;
  max: number;
}

const FIELD_SPECS: [FieldSpec, FieldSpec, FieldSpec, FieldSpec, FieldSpec] = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "day-of-week", min: 0, max: 7 }, // 7 is normalized to 0 (Sunday)
];

export interface CronFields {
  /** Sorted ascending. */
  minutes: number[];
  /** Sorted ascending. */
  hours: number[];
  daysOfMonth: Set<number>;
  months: Set<number>;
  /** 0-6, Sunday = 0 (7 in the expression is normalized to 0). */
  daysOfWeek: Set<number>;
  /** day-of-month field was not a bare `*`. */
  domRestricted: boolean;
  /** day-of-week field was not a bare `*`. */
  dowRestricted: boolean;
}

const INT_RE = /^\d+$/;

function parseInteger(raw: string, field: FieldSpec, expr: string): number {
  if (!INT_RE.test(raw)) {
    throw new CronError(
      `Invalid cron expression "${expr}": ${field.name} value "${raw}" is not a number`,
    );
  }
  return Number.parseInt(raw, 10);
}

function parseField(
  raw: string,
  field: FieldSpec,
  expr: string,
): { values: Set<number>; restricted: boolean } {
  const values = new Set<number>();
  const restricted = raw !== "*";
  if (raw.length === 0) {
    throw new CronError(
      `Invalid cron expression "${expr}": empty ${field.name} field`,
    );
  }

  for (const part of raw.split(",")) {
    if (part.length === 0) {
      throw new CronError(
        `Invalid cron expression "${expr}": empty list item in ${field.name} field`,
      );
    }
    const slashPieces = part.split("/");
    if (slashPieces.length > 2) {
      throw new CronError(
        `Invalid cron expression "${expr}": malformed step in ${field.name} field ("${part}")`,
      );
    }
    const [rangeRaw, stepRaw] = slashPieces;
    let step = 1;
    if (stepRaw !== undefined) {
      step = parseInteger(stepRaw, field, expr);
      if (step < 1) {
        throw new CronError(
          `Invalid cron expression "${expr}": step must be >= 1 in ${field.name} field ("${part}")`,
        );
      }
    }

    let lo: number;
    let hi: number;
    if (rangeRaw === "*") {
      lo = field.min;
      hi = field.max;
    } else {
      const dashPieces = rangeRaw.split("-");
      if (dashPieces.length > 2) {
        throw new CronError(
          `Invalid cron expression "${expr}": malformed range in ${field.name} field ("${part}")`,
        );
      }
      lo = parseInteger(dashPieces[0], field, expr);
      // `a/step` (single value with a step) is treated as `a-max/step`,
      // matching widespread cron implementations.
      hi =
        dashPieces.length === 2
          ? parseInteger(dashPieces[1], field, expr)
          : stepRaw !== undefined
            ? field.max
            : lo;
      if (lo > hi) {
        throw new CronError(
          `Invalid cron expression "${expr}": reversed range in ${field.name} field ("${part}")`,
        );
      }
    }

    if (lo < field.min || hi > field.max) {
      throw new CronError(
        `Invalid cron expression "${expr}": ${field.name} value out of range ` +
          `${field.min}-${field.max} ("${part}")`,
      );
    }

    for (let v = lo; v <= hi; v += step) {
      // Normalize day-of-week 7 → 0 (Sunday).
      values.add(field.name === "day-of-week" && v === 7 ? 0 : v);
    }
  }

  return { values, restricted };
}

/** Parses a 5-field cron expression. Throws {@link CronError} when invalid. */
export function parseCronExpression(expr: string): CronFields {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new CronError(
      `Invalid cron expression "${expr}": expected 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}`,
    );
  }
  const minute = parseField(fields[0], FIELD_SPECS[0], expr);
  const hour = parseField(fields[1], FIELD_SPECS[1], expr);
  const dom = parseField(fields[2], FIELD_SPECS[2], expr);
  const month = parseField(fields[3], FIELD_SPECS[3], expr);
  const dow = parseField(fields[4], FIELD_SPECS[4], expr);

  return {
    minutes: [...minute.values].sort((a, b) => a - b),
    hours: [...hour.values].sort((a, b) => a - b),
    daysOfMonth: dom.values,
    months: month.values,
    daysOfWeek: dow.values,
    domRestricted: dom.restricted,
    dowRestricted: dow.restricted,
  };
}

/** Throws {@link CronError} when the expression is invalid; otherwise no-op. */
export function validateCronExpression(expr: string): void {
  parseCronExpression(expr);
}

// ── wall-clock readers ─────────────────────────────────────────────────────────

interface WallParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  dow: number; // 0-6, Sunday = 0
}

const WEEKDAY_TO_DOW: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getZoneFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timezone);
  if (cached) return cached;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
  } catch {
    throw new CronError(`Invalid timezone "${timezone}"`);
  }
  formatterCache.set(timezone, formatter);
  return formatter;
}

function makePartsReader(timezone: string): (ms: number) => WallParts {
  if (timezone === "UTC") {
    return (ms) => {
      const d = new Date(ms);
      return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
        dow: d.getUTCDay(),
      };
    };
  }
  const formatter = getZoneFormatter(timezone);
  return (ms) => {
    const parts = formatter.formatToParts(new Date(ms));
    const get = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((p) => p.type === type)?.value ?? "";
    return {
      year: Number(get("year")),
      month: Number(get("month")),
      day: Number(get("day")),
      // Some ICU builds emit "24" for midnight even with hourCycle h23.
      hour: Number(get("hour")) % 24,
      minute: Number(get("minute")),
      dow: WEEKDAY_TO_DOW[get("weekday")] ?? 0,
    };
  };
}

// ── next-occurrence search ─────────────────────────────────────────────────────

const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;
/** Search horizon: ~5 years. Beyond this we declare "never fires". */
const MAX_HORIZON_MS = 5 * 366 * 24 * 60 * MINUTE_MS;
/** Hard iteration cap (the day-jump search stays far below this). */
const MAX_ITERATIONS = 600_000;

function dayMatches(fields: CronFields, p: WallParts): boolean {
  if (!fields.months.has(p.month)) return false;
  const domOk = fields.daysOfMonth.has(p.day);
  const dowOk = fields.daysOfWeek.has(p.dow);
  if (fields.domRestricted && fields.dowRestricted) return domOk || dowOk;
  if (fields.domRestricted) return domOk;
  if (fields.dowRestricted) return dowOk;
  return true;
}

/** First allowed hour*60+minute >= cur within the day, or null when none. */
function nextTimeOfDay(fields: CronFields, cur: number): number | null {
  for (const h of fields.hours) {
    if (h * 60 + 59 < cur) continue;
    for (const m of fields.minutes) {
      const v = h * 60 + m;
      if (v >= cur) return v;
    }
  }
  return null;
}

/**
 * DST-safe conservative jump: move toward (never past) the next zone
 * midnight. We always undershoot by at least an hour so a 23-hour
 * spring-forward day can't make us skip wall minutes; the loop re-reads the
 * wall clock after every jump.
 */
function jumpTowardNextDayMs(p: WallParts): number {
  const remaining = DAY_MINUTES - (p.hour * 60 + p.minute);
  return Math.max(1, remaining - 61) * MINUTE_MS;
}

/**
 * Computes the next instant strictly after `from` at which the cron
 * expression fires in the given timezone (default "UTC").
 *
 * Throws {@link CronError} on an invalid expression, invalid timezone, or
 * when the expression never fires within ~5 years (e.g. "0 0 31 2 *").
 */
export function computeNextRun(
  cronExpr: string,
  from: Date,
  timezone = "UTC",
): Date {
  const fields = parseCronExpression(cronExpr);
  const readParts = makePartsReader(timezone);

  // Start at the next whole minute strictly after `from`.
  let t = Math.floor(from.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
  const horizon = from.getTime() + MAX_HORIZON_MS;

  for (let i = 0; i < MAX_ITERATIONS && t <= horizon; i++) {
    const p = readParts(t);

    if (!dayMatches(fields, p)) {
      t += jumpTowardNextDayMs(p);
      continue;
    }

    const cur = p.hour * 60 + p.minute;
    const next = nextTimeOfDay(fields, cur);
    if (next === cur) return new Date(t);
    if (next === null) {
      t += jumpTowardNextDayMs(p);
      continue;
    }
    // Conservative jump toward the target wall time (re-checked next loop),
    // undershooting by an hour to stay correct across DST transitions.
    const delta = next - cur;
    t += (delta > 61 ? delta - 61 : 1) * MINUTE_MS;
  }

  throw new CronError(
    `Cron expression "${cronExpr}" has no occurrence within 5 years of ${from.toISOString()}`,
  );
}
