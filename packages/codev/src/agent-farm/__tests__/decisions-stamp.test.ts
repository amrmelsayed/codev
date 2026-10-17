/**
 * Spec 1819 — decision heading timestamps. Nothing may assume PT.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { resolveStamp } from '../servers/decisions/stamp.js';

const instant = (raw: string): string | null => resolveStamp(raw).instant;

describe('resolveStamp — generic zones follow DST for the stamp\'s date', () => {
  it('resolves PT to PDT in summer and PST in winter', () => {
    expect(instant('2026-07-01 3:05 pm PT')).toBe('2026-07-01T22:05:00.000Z');
    expect(instant('2026-12-01 3:05 pm PT')).toBe('2026-12-01T23:05:00.000Z');
  });

  it.each([
    ['MT', '2026-07-01 3:05 pm MT', '2026-07-01T21:05:00.000Z'],
    ['CT', '2026-07-01 3:05 pm CT', '2026-07-01T20:05:00.000Z'],
    ['ET', '2026-07-01 3:05 pm ET', '2026-07-01T19:05:00.000Z'],
    ['AKT', '2026-07-01 3:05 pm AKT', '2026-07-01T23:05:00.000Z'],
    ['HT', '2026-07-01 3:05 pm HT', '2026-07-02T01:05:00.000Z'],
    ['ET winter', '2026-12-01 3:05 pm ET', '2026-12-01T20:05:00.000Z'],
  ])('%s', (_label, raw, expected) => {
    expect(instant(raw)).toBe(expected);
  });
});

describe('resolveStamp — fixed-offset abbreviations', () => {
  const table: Array<[string, number]> = [
    ['PST', -8 * 60], ['PDT', -7 * 60], ['MST', -7 * 60], ['MDT', -6 * 60],
    ['CST', -6 * 60], ['CDT', -5 * 60], ['EST', -5 * 60], ['EDT', -4 * 60],
    ['AKST', -9 * 60], ['AKDT', -8 * 60], ['HST', -10 * 60], ['WET', 0],
    ['WEST', 60], ['CET', 60], ['CEST', 120], ['EET', 120], ['EEST', 180],
    ['MSK', 180], ['SGT', 480], ['HKT', 480], ['JST', 540], ['KST', 540],
    ['AEST', 600], ['AEDT', 660], ['NZST', 720], ['NZDT', 780],
    ['UTC', 0], ['GMT', 0], ['Z', 0],
  ];

  it.each(table)('%s is UTC%+d minutes regardless of date', (zone, offsetMinutes) => {
    const wall = Date.UTC(2026, 0, 15, 12, 0);
    const expected = new Date(wall - offsetMinutes * 60_000).toISOString();
    expect(instant(`2026-01-15 12:00 pm ${zone}`)).toBe(expected);
    expect(instant(`2026-01-15 12:00 ${zone}`)).toBe(expected);
  });

  it('applies PDT as written even in December', () => {
    expect(instant('2026-12-01 3:05 pm PDT')).toBe('2026-12-01T22:05:00.000Z');
  });
});

describe('resolveStamp — numeric offsets and IANA names', () => {
  it.each([
    ['+05:30', '2026-10-17T06:40:00.000Z'],
    ['+0530', '2026-10-17T06:40:00.000Z'],
    ['UTC+5:30', '2026-10-17T06:40:00.000Z'],
    ['GMT-7', '2026-10-17T19:10:00.000Z'],
    ['-07:00', '2026-10-17T19:10:00.000Z'],
    ['+9', '2026-10-17T03:10:00.000Z'],
  ])('%s', (zone, expected) => {
    expect(instant(`2026-10-17 12:10 pm ${zone}`)).toBe(expected);
  });

  it('rejects out-of-range offsets', () => {
    expect(resolveStamp('2026-10-17 12:10 pm +15:00').unconvertedReason).toBe('unknown-zone');
    expect(resolveStamp('2026-10-17 12:10 pm +05:75').unconvertedReason).toBe('unknown-zone');
  });

  it('resolves IANA names with their DST', () => {
    expect(instant('2026-07-01 9:00 am Europe/London')).toBe('2026-07-01T08:00:00.000Z');
    expect(instant('2026-12-01 9:00 am Europe/London')).toBe('2026-12-01T09:00:00.000Z');
    expect(instant('2026-10-17 12:10 am America/Los_Angeles')).toBe('2026-10-17T07:10:00.000Z');
  });

  it('accepts 24-hour time and any am/pm casing', () => {
    expect(instant('2026-10-17 15:05 UTC')).toBe('2026-10-17T15:05:00.000Z');
    expect(instant('2026-10-17 3:05 PM UTC')).toBe('2026-10-17T15:05:00.000Z');
    expect(instant('2026-10-17 3:05pm UTC')).toBe('2026-10-17T15:05:00.000Z');
    expect(instant('2026-10-17 12:00 am UTC')).toBe('2026-10-17T00:00:00.000Z');
    expect(instant('2026-10-17 12:00 pm UTC')).toBe('2026-10-17T12:00:00.000Z');
  });
});

describe('resolveStamp — unconverted, never guessed', () => {
  it.each(['IST', 'BST', 'AST', 'XYZ', 'pt', 'EST5EDT', 'Not/AZone'])('unknown or excluded zone %s', zone => {
    expect(resolveStamp(`2026-10-17 12:10 am ${zone}`)).toEqual({
      raw: `2026-10-17 12:10 am ${zone}`,
      instant: null,
      unconvertedReason: 'unknown-zone',
    });
  });

  it.each([
    '2026-10-17 12:10 am',
    '2026-10-17',
    'yesterday 9 am PT',
    '2026-10-17 13:10 pm UTC',
    '2026-10-17 0:10 am UTC',
    '2026-10-17 24:00 UTC',
    '2026-10-17 9:60 UTC',
    '2026-02-30 9:00 am UTC',
  ])('unrecognized format: %s', raw => {
    expect(resolveStamp(raw)).toEqual({ raw, instant: null, unconvertedReason: 'unrecognized-format' });
  });

  it('leaves a spring-forward gap unconverted', () => {
    expect(resolveStamp('2026-03-08 2:30 am PT').unconvertedReason).toBe('nonexistent-time');
  });

  it('leaves a fall-back fold unconverted', () => {
    expect(resolveStamp('2026-11-01 1:30 am PT').unconvertedReason).toBe('ambiguous-time');
  });

  it('converts the instants either side of a transition', () => {
    expect(instant('2026-03-08 1:59 am PT')).toBe('2026-03-08T09:59:00.000Z');
    expect(instant('2026-03-08 3:00 am PT')).toBe('2026-03-08T10:00:00.000Z');
    expect(instant('2026-11-01 2:00 am PT')).toBe('2026-11-01T10:00:00.000Z');
  });

  it('never yields a Pacific offset for a stamp that does not name a Pacific zone', () => {
    const pacific = new Set(['2026-10-17T07:10:00.000Z', '2026-10-17T08:10:00.000Z']);
    for (const zone of ['UTC', 'ET', 'CET', '+05:30', 'Europe/London', 'XYZ', '']) {
      const result = instant(`2026-10-17 12:10 am ${zone}`.trim());
      expect(result === null || !pacific.has(result)).toBe(true);
    }
  });
});

describe('resolveStamp — independent of the machine time zone', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('gives identical results under different TZ values', () => {
    const stamps = [
      '2026-07-01 3:05 pm PT', '2026-12-01 3:05 pm PT', '2026-10-17 12:10 pm +05:30',
      '2026-07-01 9:00 am Europe/London', '2026-03-08 2:30 am PT', '2026-11-01 1:30 am PT',
      '2026-10-17 15:05 JST',
    ];
    const results = ['UTC', 'Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Chatham'].map(tz => {
      process.env.TZ = tz;
      return JSON.stringify(stamps.map(resolveStamp));
    });
    expect(new Set(results).size).toBe(1);
  });
});
