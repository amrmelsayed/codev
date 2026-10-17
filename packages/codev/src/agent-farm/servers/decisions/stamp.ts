// Decision heading timestamps (Spec 1819).
//
// A stamp is `YYYY-MM-DD h:mm am|pm <ZONE>` or `YYYY-MM-DD HH:mm <ZONE>`. It is
// resolved to an absolute instant using ONLY the zone written in it — nothing here
// defaults to, or special-cases, any zone. Anything not in the accepted forms is
// returned unconverted with a reason, so the tab shows it verbatim.
//
// IANA and generic zones are resolved with the runtime's built-in `Intl` time-zone
// data by offset probing: the wall-clock time is tried against every offset the
// zone has near that date, and the candidates that round-trip are kept. One means
// success; none is a spring-forward gap; two is a fall-back fold. Gaps and folds
// are left unconverted rather than broken by a tie-break rule.

import type { DecisionStamp } from '@cluesmith/codev-types';

/** Generic North-American zones: DST follows the stamp's date. */
const GENERIC_ZONES: Record<string, string> = {
  PT: 'America/Los_Angeles',
  MT: 'America/Denver',
  CT: 'America/Chicago',
  ET: 'America/New_York',
  AKT: 'America/Anchorage',
  HT: 'Pacific/Honolulu',
};

/**
 * Fixed-offset abbreviations, in minutes east of UTC. `CST` is North-American
 * Central (China Standard Time is written `+08:00` or `Asia/Shanghai`). Ambiguous
 * abbreviations (`IST`, `BST`, `AST`, …) are deliberately absent.
 */
const FIXED_ZONES: Record<string, number> = {
  UTC: 0,
  GMT: 0,
  Z: 0,
  PST: -8 * 60,
  PDT: -7 * 60,
  MST: -7 * 60,
  MDT: -6 * 60,
  CST: -6 * 60,
  CDT: -5 * 60,
  EST: -5 * 60,
  EDT: -4 * 60,
  AKST: -9 * 60,
  AKDT: -8 * 60,
  HST: -10 * 60,
  WET: 0,
  WEST: 1 * 60,
  CET: 1 * 60,
  CEST: 2 * 60,
  EET: 2 * 60,
  EEST: 3 * 60,
  MSK: 3 * 60,
  SGT: 8 * 60,
  HKT: 8 * 60,
  JST: 9 * 60,
  KST: 9 * 60,
  AEST: 10 * 60,
  AEDT: 11 * 60,
  NZST: 12 * 60,
  NZDT: 13 * 60,
};

const STAMP_RE = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?:\s*(am|pm))?\s+(\S.*?)\s*$/i;
const OFFSET_RE = /^(?:UTC|GMT)?([+-])(\d{1,2})(?::?(\d{2}))?$/;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

type Zone = { kind: 'fixed'; offsetMinutes: number } | { kind: 'iana'; name: string };

function isIanaZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

function parseZone(zone: string): Zone | null {
  if (zone in FIXED_ZONES) return { kind: 'fixed', offsetMinutes: FIXED_ZONES[zone] };
  if (zone in GENERIC_ZONES) return { kind: 'iana', name: GENERIC_ZONES[zone] };
  const offset = OFFSET_RE.exec(zone);
  if (offset) {
    const hours = Number(offset[2]);
    const minutes = offset[3] ? Number(offset[3]) : 0;
    if (hours > 14 || minutes > 59) return null;
    const sign = offset[1] === '-' ? -1 : 1;
    return { kind: 'fixed', offsetMinutes: sign * (hours * 60 + minutes) };
  }
  // IANA names only in Area/Location form, so legacy ids (`EST5EDT`, `IST`, …) are
  // never accepted through the back door.
  if (zone.includes('/') && isIanaZone(zone)) return { kind: 'iana', name: zone };
  return null;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(zone, f);
  }
  return f;
}

/** The zone's UTC offset, in minutes, at the given instant. */
function offsetAt(instantMs: number, zone: string): number {
  const parts = formatterFor(zone).formatToParts(new Date(instantMs));
  const get = (type: string): number => Number(parts.find(p => p.type === type)!.value);
  const wallMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  const instantMinute = Math.floor(instantMs / MINUTE_MS) * MINUTE_MS;
  return Math.round((wallMs - instantMinute) / MINUTE_MS);
}

/** All instants whose wall-clock time in `zone` is `wallMs` (as if UTC). */
function instantsForWallClock(wallMs: number, zone: string): number[] {
  const offsets = new Set([offsetAt(wallMs - DAY_MS, zone), offsetAt(wallMs, zone), offsetAt(wallMs + DAY_MS, zone)]);
  const instants = new Set<number>();
  for (const offset of offsets) {
    const candidate = wallMs - offset * MINUTE_MS;
    if (offsetAt(candidate, zone) === offset) instants.add(candidate);
  }
  return [...instants].sort((a, b) => a - b);
}

/** Resolve a heading stamp to an instant using only the zone written in it. */
export function resolveStamp(raw: string): DecisionStamp {
  const m = STAMP_RE.exec(raw.trim());
  if (!m) return { raw, instant: null, unconvertedReason: 'unrecognized-format' };

  const [, y, mo, d, h, mi, meridiem, zoneText] = m;
  // `12:10 am` with no zone backtracks to read `am` as the zone; it has none.
  if (/^(am|pm)$/i.test(zoneText)) return { raw, instant: null, unconvertedReason: 'unrecognized-format' };
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  let hour = Number(h);
  const minute = Number(mi);

  if (meridiem) {
    if (hour < 1 || hour > 12) return { raw, instant: null, unconvertedReason: 'unrecognized-format' };
    const pm = meridiem.toLowerCase() === 'pm';
    hour = (hour % 12) + (pm ? 12 : 0);
  } else if (hour > 23) {
    return { raw, instant: null, unconvertedReason: 'unrecognized-format' };
  }
  if (minute > 59) return { raw, instant: null, unconvertedReason: 'unrecognized-format' };

  const wallMs = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wallMs);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return { raw, instant: null, unconvertedReason: 'unrecognized-format' };
  }

  const zone = parseZone(zoneText);
  if (!zone) return { raw, instant: null, unconvertedReason: 'unknown-zone' };

  if (zone.kind === 'fixed') {
    return { raw, instant: new Date(wallMs - zone.offsetMinutes * MINUTE_MS).toISOString() };
  }

  const instants = instantsForWallClock(wallMs, zone.name);
  if (instants.length === 0) return { raw, instant: null, unconvertedReason: 'nonexistent-time' };
  if (instants.length > 1) return { raw, instant: null, unconvertedReason: 'ambiguous-time' };
  return { raw, instant: new Date(instants[0]).toISOString() };
}
