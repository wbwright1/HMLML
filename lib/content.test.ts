import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SNARKY_LABELS, getHubEditorial, HERO_DEK_FALLBACK } from './content';
import { sharesSignaturePhrase } from './content-gen/phrases';
import type { SnarkyLabel, LabelTone } from './content';

const VALID_TONES: LabelTone[] = ['positive', 'sting', 'neutral'];

const SOURCE_PATH = resolve(__dirname, 'content.ts');
const source = readFileSync(SOURCE_PATH, 'utf-8');

// UT-01: Module exports SNARKY_LABELS and required types
describe('UT-01: Module exports', () => {
  it('exports SNARKY_LABELS as a defined object', () => {
    expect(SNARKY_LABELS).toBeDefined();
    expect(SNARKY_LABELS).not.toBeNull();
    expect(typeof SNARKY_LABELS).toBe('object');
  });

  it('exports SnarkyLabel and LabelTone types (compile-time check)', () => {
    // If these types were not exported, the import at the top of this file
    // would cause a TypeScript compilation error. This test simply verifies
    // runtime import succeeded without throwing.
    const label: SnarkyLabel = SNARKY_LABELS['POINT_MACHINE'];
    const tone: LabelTone = label.tone;
    expect(tone).toBeDefined();
  });
});

// UT-02: SNARKY_LABELS contains at least every required label. The set is
// intentionally extensible (new superlatives get added over time), so this is a
// floor keyed off the required-label spec table below rather than an exact
// count; each required label is verified individually in UT-03+.
describe('UT-02: Label count', () => {
  it('contains at least every required label', () => {
    expect(Object.keys(SNARKY_LABELS).length).toBeGreaterThanOrEqual(
      labelExpectations.length
    );
  });
});

// UT-03 through UT-16: Per-label key lookup and field values
const labelExpectations: Array<{
  testId: string;
  key: string;
  displayText: string;
  tone: LabelTone;
}> = [
  { testId: 'UT-03', key: 'POINT_MACHINE', displayText: 'Point Machine', tone: 'positive' },
  { testId: 'UT-04', key: 'IRON_CURTAIN', displayText: 'Iron Curtain', tone: 'positive' },
  { testId: 'UT-05', key: 'ALPHA_DOG', displayText: 'Alpha Dog', tone: 'positive' },
  { testId: 'UT-06', key: 'LEAGUE_DOORMAT', displayText: 'League Doormat', tone: 'sting' },
  { testId: 'UT-07', key: 'GLASS_CANNON', displayText: 'Glass Cannon', tone: 'sting' },
  { testId: 'UT-08', key: 'PAPER_TIGER', displayText: 'Paper Tiger', tone: 'sting' },
  { testId: 'UT-09', key: 'DRAFT_DAY_GENIUS', displayText: 'Draft Day Genius', tone: 'positive' },
  { testId: 'UT-10', key: 'WASTED_PICKS', displayText: 'Wasted Picks', tone: 'sting' },
  { testId: 'UT-11', key: 'ON_FIRE', displayText: 'On Fire', tone: 'positive' },
  { testId: 'UT-12', key: 'ROCK_BOTTOM', displayText: 'Rock Bottom', tone: 'sting' },
  { testId: 'UT-13', key: 'MERCY_RULE', displayText: 'Mercy Rule', tone: 'positive' },
  { testId: 'UT-14', key: 'CARDIAC_CREW', displayText: 'Cardiac Crew', tone: 'neutral' },
  { testId: 'UT-15', key: 'WHAT_COULDVE_BEEN', displayText: "What Could've Been", tone: 'neutral' },
  { testId: 'UT-16', key: 'COACHING_MALPRACTICE', displayText: 'Coaching Malpractice', tone: 'sting' },
  { testId: 'UT-28', key: 'BLOWOUT_BAIT', displayText: 'Blowout Bait', tone: 'sting' },
  { testId: 'UT-29', key: 'EMPTY_CALORIES', displayText: 'Empty Calories', tone: 'sting' },
  { testId: 'UT-30', key: 'PUNCHING_BAG', displayText: 'Punching Bag', tone: 'sting' },
];

describe('UT-03 through UT-16: Per-label field values', () => {
  for (const { testId, key, displayText, tone } of labelExpectations) {
    describe(`${testId}: ${key}`, () => {
      it('is accessible by key', () => {
        expect(SNARKY_LABELS[key]).toBeDefined();
      });

      it(`has displayText "${displayText}"`, () => {
        expect(SNARKY_LABELS[key].displayText).toBe(displayText);
      });

      it('has a non-empty description', () => {
        expect(SNARKY_LABELS[key].description).toBeTruthy();
        expect(typeof SNARKY_LABELS[key].description).toBe('string');
        expect(SNARKY_LABELS[key].description.trim().length).toBeGreaterThan(0);
      });

      it(`has tone "${tone}"`, () => {
        expect(SNARKY_LABELS[key].tone).toBe(tone);
      });
    });
  }
});

// UT-17: Every label's key field matches its map key
describe('UT-17: Key consistency', () => {
  it('every entry.key matches its Record map key', () => {
    for (const [mapKey, entry] of Object.entries(SNARKY_LABELS)) {
      expect(entry.key).toBe(mapKey);
    }
  });
});

// UT-18: SNARKY_LABELS is a plain object (Record), not an array or class instance
describe('UT-18: Record type structure', () => {
  it('is not an array', () => {
    expect(Array.isArray(SNARKY_LABELS)).toBe(false);
  });

  it('is a plain object', () => {
    expect(typeof SNARKY_LABELS).toBe('object');
  });

  it('supports key-based access', () => {
    expect(SNARKY_LABELS['POINT_MACHINE']).toBeDefined();
    expect(SNARKY_LABELS['POINT_MACHINE'].displayText).toBe('Point Machine');
  });
});

// UT-19: Module does not import from lib/playoff-labels.ts
describe('UT-19: No playoff-labels import', () => {
  it('source does not reference playoff-labels', () => {
    expect(source).not.toContain('playoff-labels');
  });
});

// UT-20: Module does not contain "use client" directive
describe('UT-20: No "use client" directive', () => {
  it('source does not contain "use client"', () => {
    expect(source).not.toContain('use client');
  });
});

// UT-21: Module contains no React imports
describe('UT-21: No React imports', () => {
  it('source does not import from react', () => {
    expect(source).not.toMatch(/import\s+.*from\s+['"]react['"]/);
  });
});

// UT-22: No default export
describe('UT-22: No default export', () => {
  it('source does not contain "export default"', () => {
    expect(source).not.toContain('export default');
  });
});

// UT-23: SNARKY_LABELS is effectively immutable at runtime
describe('UT-23: Runtime immutability', () => {
  it('rejects mutation via Object.freeze', () => {
    expect(() => {
      (SNARKY_LABELS as Record<string, unknown>)['POINT_MACHINE'] = null;
    }).toThrow();
    // Verify original value is intact
    expect(SNARKY_LABELS['POINT_MACHINE'].displayText).toBe('Point Machine');
  });
});

// UT-24: All tone values are members of the valid set
describe('UT-24: Tone value validation', () => {
  it('all tone values are one of positive, sting, or neutral', () => {
    for (const label of Object.values(SNARKY_LABELS)) {
      expect(VALID_TONES).toContain(label.tone);
    }
  });
});

// UT-25: All displayText values are non-empty strings
describe('UT-25: displayText non-empty', () => {
  it('all displayText values are non-empty trimmed strings', () => {
    for (const label of Object.values(SNARKY_LABELS)) {
      expect(typeof label.displayText).toBe('string');
      expect(label.displayText.trim().length).toBeGreaterThan(0);
    }
  });
});

// UT-26: All description values are non-empty strings
describe('UT-26: description non-empty', () => {
  it('all description values are non-empty trimmed strings', () => {
    for (const label of Object.values(SNARKY_LABELS)) {
      expect(typeof label.description).toBe('string');
      expect(label.description.trim().length).toBeGreaterThan(0);
    }
  });
});

// UT-27: All key values use UPPER_SNAKE_CASE format
describe('UT-27: UPPER_SNAKE_CASE keys', () => {
  it('all key values match UPPER_SNAKE_CASE pattern', () => {
    const pattern = /^[A-Z][A-Z0-9_]*$/;
    for (const label of Object.values(SNARKY_LABELS)) {
      expect(label.key).toMatch(pattern);
    }
  });
});

// UT-28: getHubEditorial's seeded Game of the Week blurb is opener-aware
// (issue #228). No seasonId is passed so this stays pure (no DB call).
describe('UT-28: opener-aware seeded GOTW blurb', () => {
  it('does not claim "first place" before any game has been played', async () => {
    const editorial = await getHubEditorial({ anyGamesPlayed: false });
    expect(editorial.matchupAngles.gameOfWeekBlurb.toLowerCase()).not.toContain(
      'first place'
    );
  });

  it('keeps the first-place blurb once games have been played', async () => {
    const editorial = await getHubEditorial({ anyGamesPlayed: true });
    expect(editorial.matchupAngles.gameOfWeekBlurb.toLowerCase()).toContain(
      'first place'
    );
  });

  it('defaults to the played-games blurb when anyGamesPlayed is omitted', async () => {
    const editorial = await getHubEditorial({});
    expect(editorial.matchupAngles.gameOfWeekBlurb.toLowerCase()).toContain(
      'first place'
    );
  });

  it('the opener variant carries no em-dashes', async () => {
    const editorial = await getHubEditorial({ anyGamesPlayed: false });
    expect(editorial.matchupAngles.gameOfWeekBlurb).not.toContain('—');
    expect(editorial.matchupAngles.gameOfWeekBlurb).not.toContain('–');
  });
});

// Issue #274: with no generated hub_content row, the hub renders
// HERO_DEK_FALLBACK directly above the seeded Game of the Week blurb. The two
// used to share "receipts to settle".
describe('seeded hero dek fallback vs the seeded GotW blurb', () => {
  it('shares no signature phrase with either seeded blurb', async () => {
    for (const anyGamesPlayed of [true, false]) {
      const editorial = await getHubEditorial({ anyGamesPlayed });
      expect(
        sharesSignaturePhrase(
          HERO_DEK_FALLBACK,
          editorial.matchupAngles.gameOfWeekBlurb
        ),
        `anyGamesPlayed=${anyGamesPlayed}`
      ).toBe(false);
    }
  });

  it('carries no em-dash and stays in the site voice', () => {
    expect(HERO_DEK_FALLBACK).not.toContain('—');
    expect(HERO_DEK_FALLBACK).not.toContain('–');
    expect(HERO_DEK_FALLBACK.length).toBeGreaterThan(24);
  });
});
