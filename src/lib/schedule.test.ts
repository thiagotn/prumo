import { describe, expect, it } from 'vitest';
import {
  addDays,
  clashesIn,
  dayBounds,
  dayKey,
  daySlots,
  groupByDay,
  hourIn,
  instantAt,
  overlaps,
  slotLabel,
  weekDays,
} from './schedule';

// São Paulo sits at -03:00 and no longer observes daylight saving, so a wall-clock hour
// maps to a fixed UTC instant — but the code must not assume that, which is what the
// timezone-specific cases below check.

describe('instantAt / hourIn / dayKey', () => {
  it('maps a clinic hour to the right absolute instant', () => {
    // 09:00 in São Paulo is 12:00 UTC.
    expect(instantAt('2026-09-23', 9).toISOString()).toBe('2026-09-23T12:00:00.000Z');
  });

  it('round-trips an hour through the clinic timezone', () => {
    for (const hour of [0, 8, 13, 19, 23]) {
      expect(hourIn(instantAt('2026-09-23', hour))).toBe(hour);
    }
  });

  it('reports the clinic day, not the server day', () => {
    // 2026-09-24T02:00Z is still the 23rd at 23:00 in São Paulo.
    expect(dayKey(new Date('2026-09-24T02:00:00Z'))).toBe('2026-09-23');
    // And 03:00Z is already the 24th.
    expect(dayKey(new Date('2026-09-24T03:00:00Z'))).toBe('2026-09-24');
  });

  it('handles a timezone that does observe daylight saving', () => {
    // Lisbon is UTC+1 in September (WEST) and UTC+0 in January (WET). A hardcoded offset
    // would get one of these wrong.
    expect(instantAt('2026-09-23', 10, 'Europe/Lisbon').toISOString()).toBe(
      '2026-09-23T09:00:00.000Z',
    );
    expect(instantAt('2026-01-23', 10, 'Europe/Lisbon').toISOString()).toBe(
      '2026-01-23T10:00:00.000Z',
    );
  });

  it('round-trips across a daylight-saving boundary', () => {
    for (const day of ['2026-03-28', '2026-03-30', '2026-10-24', '2026-10-26']) {
      expect(hourIn(instantAt(day, 14, 'Europe/Lisbon'), 'Europe/Lisbon')).toBe(14);
    }
  });
});

describe('dayBounds', () => {
  it('spans midnight to midnight in the clinic timezone', () => {
    const { from, to } = dayBounds('2026-09-23');
    expect(from.toISOString()).toBe('2026-09-23T03:00:00.000Z');
    expect(to.toISOString()).toBe('2026-09-24T03:00:00.000Z');
  });

  it('covers exactly 24 hours', () => {
    const { from, to } = dayBounds('2026-09-23');
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe('daySlots', () => {
  it('produces one slot per working hour', () => {
    const slots = daySlots('2026-09-23');
    expect(slots).toHaveLength(11); // 08h to 19h
    expect(slots[0]!.hour).toBe(8);
    expect(slots[slots.length - 1]!.hour).toBe(18);
  });

  it('each slot is one hour and they are contiguous', () => {
    const slots = daySlots('2026-09-23');
    for (const [i, slot] of slots.entries()) {
      expect(slot.endsAt.getTime() - slot.startsAt.getTime()).toBe(60 * 60 * 1000);
      if (i > 0) expect(slot.startsAt.getTime()).toBe(slots[i - 1]!.endsAt.getTime());
    }
  });
});

describe('weekDays', () => {
  it('returns Monday to Saturday for a midweek day', () => {
    // 2026-09-23 is a Wednesday.
    expect(weekDays('2026-09-23')).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
    ]);
  });

  it('a Monday is the first column of its own week', () => {
    expect(weekDays('2026-09-21')[0]).toBe('2026-09-21');
  });

  it('a Sunday belongs to the week that just ended, not the one starting', () => {
    // 2026-09-27 is a Sunday: the clinic week runs Mon–Sat, so it closes that week.
    expect(weekDays('2026-09-27')).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
    ]);
  });

  it('works across a month boundary', () => {
    expect(weekDays('2026-10-01')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
  });
});

describe('addDays', () => {
  it('moves forward and backward across months and years', () => {
    expect(addDays('2026-09-23', 1)).toBe('2026-09-24');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-09-23', 7)).toBe('2026-09-30');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });
});

describe('overlaps', () => {
  const at = (from: string, to: string) => ({
    startsAt: new Date(from),
    endsAt: new Date(to),
  });

  it('detects a genuine overlap', () => {
    expect(
      overlaps(at('2026-09-23T12:00Z', '2026-09-23T13:00Z'), at('2026-09-23T12:30Z', '2026-09-23T13:30Z')),
    ).toBe(true);
  });

  it('back-to-back appointments do not overlap', () => {
    expect(
      overlaps(at('2026-09-23T12:00Z', '2026-09-23T13:00Z'), at('2026-09-23T13:00Z', '2026-09-23T14:00Z')),
    ).toBe(false);
  });

  it('one entirely inside the other overlaps', () => {
    expect(
      overlaps(at('2026-09-23T12:00Z', '2026-09-23T15:00Z'), at('2026-09-23T13:00Z', '2026-09-23T14:00Z')),
    ).toBe(true);
  });
});

describe('clashesIn', () => {
  const existing = [
    {
      id: 'a',
      roomId: 'room-1',
      startsAt: new Date('2026-09-23T12:00Z'),
      endsAt: new Date('2026-09-23T13:00Z'),
    },
    {
      id: 'b',
      roomId: 'room-2',
      startsAt: new Date('2026-09-23T12:00Z'),
      endsAt: new Date('2026-09-23T13:00Z'),
    },
  ];

  it('flags a double booking in the same room', () => {
    const clashes = clashesIn(
      { roomId: 'room-1', startsAt: new Date('2026-09-23T12:30Z'), endsAt: new Date('2026-09-23T13:30Z') },
      existing,
    );
    expect(clashes.map((c) => c.id)).toEqual(['a']);
  });

  it('the same hour in another room is fine', () => {
    const clashes = clashesIn(
      { roomId: 'room-3', startsAt: new Date('2026-09-23T12:00Z'), endsAt: new Date('2026-09-23T13:00Z') },
      existing,
    );
    expect(clashes).toEqual([]);
  });

  it('an appointment does not clash with itself when being edited', () => {
    const clashes = clashesIn(
      {
        id: 'a',
        roomId: 'room-1',
        startsAt: new Date('2026-09-23T12:00Z'),
        endsAt: new Date('2026-09-23T13:30Z'),
      },
      existing,
    );
    expect(clashes).toEqual([]);
  });

  it('with no room chosen there is nothing to clash with', () => {
    const clashes = clashesIn(
      { roomId: null, startsAt: new Date('2026-09-23T12:00Z'), endsAt: new Date('2026-09-23T13:00Z') },
      existing,
    );
    expect(clashes).toEqual([]);
  });
});

describe('groupByDay', () => {
  it('buckets by clinic day and sorts each bucket by time', () => {
    const grouped = groupByDay([
      { id: 'later', startsAt: new Date('2026-09-23T18:00Z') },
      { id: 'earlier', startsAt: new Date('2026-09-23T12:00Z') },
      { id: 'next day', startsAt: new Date('2026-09-24T12:00Z') },
    ]);
    expect([...grouped.keys()].sort()).toEqual(['2026-09-23', '2026-09-24']);
    expect(grouped.get('2026-09-23')!.map((a) => a.id)).toEqual(['earlier', 'later']);
  });

  it('a late-evening appointment stays on the clinic day, not the UTC one', () => {
    // 2026-09-24T01:00Z is 22:00 on the 23rd in São Paulo.
    const grouped = groupByDay([{ id: 'late', startsAt: new Date('2026-09-24T01:00:00Z') }]);
    expect([...grouped.keys()]).toEqual(['2026-09-23']);
  });
});

describe('slotLabel', () => {
  it('renders whole hours without minutes', () => {
    expect(slotLabel(instantAt('2026-09-23', 14), instantAt('2026-09-23', 15))).toBe('14h–15h');
  });

  it('shows minutes when there are any', () => {
    const from = instantAt('2026-09-23', 14);
    const to = new Date(from.getTime() + 90 * 60 * 1000);
    expect(slotLabel(from, to)).toBe('14h–15h30');
  });
});
