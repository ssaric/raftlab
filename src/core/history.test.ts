import { describe, expect, it } from 'vitest';
import { History } from './history';

/**
 * A deliberately order-sensitive reducer: appending letters means any mistake
 * in snapshot bookkeeping or replay order shows up as a wrong string rather
 * than an accidentally-correct number.
 */
const concat = (state: string, event: string): string => state + event;

const historyOf = (events: readonly string[], snapshotInterval?: number) => {
  const history = new History<string, string>('', concat, snapshotInterval);
  for (const event of events) history.append(event);
  return history;
};

const letters = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => String.fromCharCode(97 + (i % 26)));

describe('recording events', () => {
  it('starts empty at the initial state', () => {
    const history = new History<string, string>('', concat);
    expect(history.length).toBe(0);
    expect(history.cursor).toBe(0);
    expect(history.state).toBe('');
    expect(history.atHead).toBe(true);
  });

  it('folds each appended event into the state', () => {
    const history = historyOf(['a', 'b', 'c']);
    expect(history.state).toBe('abc');
    expect(history.length).toBe(3);
    expect(history.cursor).toBe(3);
  });

  it('keeps the events for replay elsewhere', () => {
    expect([...historyOf(['a', 'b']).recorded]).toEqual(['a', 'b']);
  });
});

describe('seeking', () => {
  it('recomputes the state at any earlier point', () => {
    const history = historyOf(['a', 'b', 'c', 'd']);
    history.seek(2);
    expect(history.state).toBe('ab');
    expect(history.cursor).toBe(2);
    expect(history.atHead).toBe(false);
  });

  it('returns to the initial state at zero', () => {
    const history = historyOf(['a', 'b']);
    history.seek(0);
    expect(history.state).toBe('');
  });

  it('clamps out-of-range targets instead of failing', () => {
    const history = historyOf(['a', 'b']);
    history.seek(-5);
    expect(history.cursor).toBe(0);
    history.seek(99);
    expect(history.cursor).toBe(2);
    expect(history.state).toBe('ab');
  });

  it('can seek forward again after seeking back', () => {
    const history = historyOf(['a', 'b', 'c']);
    history.seek(1);
    history.seek(3);
    expect(history.state).toBe('abc');
  });

  it('agrees with a plain fold at every index, across snapshot boundaries', () => {
    // The strongest guarantee here: snapshots are an optimisation only, so
    // seeking anywhere must match recomputing from scratch.
    const events = letters(50);
    const history = historyOf(events, 4);
    for (let index = 0; index <= events.length; index += 1) {
      history.seek(index);
      expect(history.state).toBe(events.slice(0, index).join(''));
    }
  });

  it('reads a past state without moving the cursor', () => {
    const history = historyOf(['a', 'b', 'c']);
    expect(history.stateAt(1)).toBe('a');
    expect(history.cursor).toBe(3);
    expect(history.state).toBe('abc');
  });
});

describe('branching', () => {
  it('discards the old future when a new event is appended in the past', () => {
    const history = historyOf(['a', 'b', 'c', 'd']);
    history.seek(2);
    history.append('X');

    expect(history.state).toBe('abX');
    expect(history.length).toBe(3);
    expect([...history.recorded]).toEqual(['a', 'b', 'X']);
    expect(history.atHead).toBe(true);
  });

  it('leaves the future intact when appending at the head', () => {
    const history = historyOf(['a', 'b']);
    history.append('c');
    expect([...history.recorded]).toEqual(['a', 'b', 'c']);
  });

  it('branches correctly when the cursor sits on a snapshot boundary', () => {
    const history = historyOf(letters(12), 4);
    history.seek(8);
    history.append('Z');
    expect(history.state).toBe(letters(8).join('') + 'Z');

    // And the stale snapshot from the discarded future must not resurface.
    history.seek(9);
    expect(history.state).toBe(letters(8).join('') + 'Z');
    history.seek(4);
    expect(history.state).toBe(letters(4).join(''));
  });

  it('rebuilds a long future after branching mid-history', () => {
    const history = historyOf(letters(30), 4);
    history.seek(5);
    for (const event of ['X', 'Y', 'Z']) history.append(event);

    expect(history.length).toBe(8);
    expect(history.state).toBe(letters(5).join('') + 'XYZ');
    history.seek(6);
    expect(history.state).toBe(letters(5).join('') + 'X');
  });

  it('can branch repeatedly from the same point', () => {
    const history = historyOf(['a', 'b', 'c']);
    history.seek(1);
    history.append('X');
    history.seek(1);
    history.append('Y');
    expect(history.state).toBe('aY');
    expect([...history.recorded]).toEqual(['a', 'Y']);
  });
});

describe('determinism', () => {
  it('produces the same state from the same events regardless of path taken', () => {
    const direct = historyOf(['a', 'b', 'c']);

    const wandering = historyOf(['a', 'b', 'c']);
    wandering.seek(0);
    wandering.seek(2);
    wandering.seek(1);
    wandering.seek(3);

    expect(wandering.state).toBe(direct.state);
  });

  it('rejects a nonsensical snapshot interval', () => {
    expect(() => new History<string, string>('', concat, 0)).toThrow();
  });
});
