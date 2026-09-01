/**
 * A seeded pseudo-random generator carried *inside* the simulation state
 * rather than called ambiently.
 *
 * This is the piece that makes a whole session reproducible from a seed plus
 * the list of user actions. Replaying the same events through the same reducer
 * draws the same election timeouts in the same order, so rewinding lands on
 * the state you actually saw and a shared URL shows a viewer exactly what the
 * author saw. `Math.random` would make every replay diverge, which is why
 * core/ forbids it outright (see eslint.config.js).
 *
 * mulberry32: 32 bits of state, distribution far better than needed for
 * jittering timeouts, and a single number to put in a snapshot.
 */
export type Rng = {
  readonly state: number;
};

export const rngFromSeed = (seed: number): Rng => ({ state: seed | 0 });

/** Draws a value and returns the advanced generator. Never mutates. */
export const nextUint32 = (rng: Rng): readonly [number, Rng] => {
  const state = (rng.state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [(t ^ (t >>> 14)) >>> 0, { state }];
};

/** A float in [0, 1). */
export const nextFloat = (rng: Rng): readonly [number, Rng] => {
  const [value, advanced] = nextUint32(rng);
  return [value / 0x1_0000_0000, advanced];
};

/** An integer in [minInclusive, maxExclusive). */
export const nextIntBetween = (
  rng: Rng,
  minInclusive: number,
  maxExclusive: number
): readonly [number, Rng] => {
  const [fraction, advanced] = nextFloat(rng);
  const span = maxExclusive - minInclusive;
  return [minInclusive + Math.floor(fraction * span), advanced];
};
