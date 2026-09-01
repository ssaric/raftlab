import { describe, expect, it } from 'vitest';
import type { Rng } from './rng';
import { nextFloat, nextIntBetween, nextUint32, rngFromSeed } from './rng';

const take = (rng: Rng, count: number): number[] => {
  const drawn: number[] = [];
  let current = rng;
  for (let i = 0; i < count; i += 1) {
    const [value, advanced] = nextUint32(current);
    drawn.push(value);
    current = advanced;
  }
  return drawn;
};

describe('the seeded generator', () => {
  it('produces the same sequence for the same seed', () => {
    expect(take(rngFromSeed(42), 8)).toEqual(take(rngFromSeed(42), 8));
  });

  it('produces different sequences for different seeds', () => {
    expect(take(rngFromSeed(1), 8)).not.toEqual(take(rngFromSeed(2), 8));
  });

  it('is pure -- drawing from the same generator twice gives the same value', () => {
    // The property the whole rewind mechanism rests on: state lives in the
    // value, so re-folding an event log redraws identically.
    const rng = rngFromSeed(7);
    expect(nextUint32(rng)[0]).toBe(nextUint32(rng)[0]);
  });

  it('advances, so consecutive draws differ', () => {
    const drawn = take(rngFromSeed(3), 16);
    expect(new Set(drawn).size).toBe(drawn.length);
  });

  it('yields floats within [0, 1)', () => {
    let rng = rngFromSeed(99);
    for (let i = 0; i < 200; i += 1) {
      const [value, advanced] = nextFloat(rng);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      rng = advanced;
    }
  });

  it('yields integers within the requested half-open range', () => {
    let rng = rngFromSeed(1234);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i += 1) {
      const [value, advanced] = nextIntBetween(rng, 150, 300);
      expect(value).toBeGreaterThanOrEqual(150);
      expect(value).toBeLessThan(300);
      expect(Number.isInteger(value)).toBe(true);
      seen.add(value);
      rng = advanced;
    }
    // Election timeouts need real spread, otherwise every server times out
    // together and votes split forever.
    expect(seen.size).toBeGreaterThan(50);
  });
});
