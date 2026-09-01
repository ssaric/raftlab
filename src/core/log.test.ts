import { describe, expect, it } from 'vitest';
import { INDEX_ZERO, TERM_ZERO, logIndex, term } from './ids';
import type { Log, LogEntry } from './log';
import {
  acceptsAppendAt,
  entryAt,
  isAtLeastAsUpToDate,
  lastIndex,
  lastTerm,
  termAt,
  withEntriesAppended
} from './log';

/** Builds a log from a list of terms; the commands are filler. */
const logOf = (terms: readonly number[]): Log =>
  terms.map((t): LogEntry => ({ term: term(t), command: { kind: 'set', key: 'x', value: t } }));

const termsOf = (log: Log): number[] => log.map((entry) => entry.term);

/**
 * The logs from Figure 7 of the Raft paper, the canonical picture of every way
 * a follower can diverge from a leader.
 */
const FIGURE_7 = {
  leader: logOf([1, 1, 1, 4, 4, 5, 5, 6, 6, 6]),
  a: logOf([1, 1, 1, 4, 4, 5, 5, 6, 6]),
  b: logOf([1, 1, 1, 4]),
  d: logOf([1, 1, 1, 4, 4, 5, 5, 6, 6, 6, 7, 7]),
  e: logOf([1, 1, 1, 4, 4, 4, 4]),
  f: logOf([1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3])
};

describe('reading a log', () => {
  it('is 1-indexed, following the paper', () => {
    const log = logOf([1, 2, 3]);
    expect(entryAt(log, logIndex(1))?.term).toBe(1);
    expect(entryAt(log, logIndex(3))?.term).toBe(3);
    expect(lastIndex(log)).toBe(3);
  });

  it('treats index 0 as the empty position before the log, not an error', () => {
    expect(termAt(logOf([5]), INDEX_ZERO)).toBe(TERM_ZERO);
    expect(termAt([], INDEX_ZERO)).toBe(TERM_ZERO);
  });

  it('reports undefined past the end, so a short log is distinguishable', () => {
    expect(termAt(logOf([1, 1]), logIndex(3))).toBeUndefined();
  });

  it('reports term zero as the last term of an empty log', () => {
    expect(lastTerm([])).toBe(TERM_ZERO);
    expect(lastIndex([])).toBe(INDEX_ZERO);
  });
});

describe('the AppendEntries consistency check (§5.3)', () => {
  it('accepts when the entry at prevIndex has the expected term', () => {
    expect(acceptsAppendAt(FIGURE_7.leader, logIndex(4), term(4))).toBe(true);
  });

  it('rejects on a term mismatch at prevIndex', () => {
    expect(acceptsAppendAt(FIGURE_7.e, logIndex(6), term(5))).toBe(false);
  });

  it('rejects when the log does not reach prevIndex at all', () => {
    expect(acceptsAppendAt(FIGURE_7.b, logIndex(9), term(6))).toBe(false);
  });

  it('accepts the very first AppendEntries against an empty log', () => {
    expect(acceptsAppendAt([], INDEX_ZERO, TERM_ZERO)).toBe(true);
  });
});

describe('appending entries', () => {
  it('appends onto the end of a matching log', () => {
    const result = withEntriesAppended(logOf([1, 1]), logIndex(2), logOf([2, 2]));
    expect(termsOf(result)).toEqual([1, 1, 2, 2]);
  });

  it('truncates the suffix when an incoming entry conflicts on term', () => {
    const result = withEntriesAppended(FIGURE_7.e, logIndex(3), logOf([4, 4, 5]));
    // (e) held 4,4,4,4 after index 3; the term-5 entry at index 6 conflicts,
    // so everything from there is dropped and replaced.
    expect(termsOf(result)).toEqual([1, 1, 1, 4, 4, 5]);
  });

  it('leaves an already-present matching entry alone', () => {
    const log = logOf([1, 1, 2, 3]);
    const result = withEntriesAppended(log, logIndex(1), logOf([1]));
    expect(termsOf(result)).toEqual([1, 1, 2, 3]);
  });

  it('does not shorten the log when a stale duplicate arrives', () => {
    // The bug this guards: blindly truncating after prevIndex would let a
    // delayed AppendEntries destroy entries the follower already committed.
    const log = logOf([1, 1, 2, 3, 3]);
    const result = withEntriesAppended(log, INDEX_ZERO, logOf([1, 1]));
    expect(termsOf(result)).toEqual([1, 1, 2, 3, 3]);
  });

  it('is a no-op when there are no entries to append', () => {
    const log = logOf([1, 2]);
    expect(withEntriesAppended(log, logIndex(2), [])).toEqual(log);
  });

  it('does not mutate the log it was given', () => {
    const log = logOf([1, 1]);
    withEntriesAppended(log, INDEX_ZERO, logOf([9]));
    expect(termsOf(log)).toEqual([1, 1]);
  });
});

describe('the election restriction (§5.4.1)', () => {
  it('prefers a higher last term over a longer log', () => {
    // (d) is shorter in agreement with the leader but ends in term 7.
    expect(isAtLeastAsUpToDate(term(7), logIndex(12), FIGURE_7.leader)).toBe(true);
    expect(isAtLeastAsUpToDate(term(6), logIndex(10), FIGURE_7.d)).toBe(false);
  });

  it('compares length only when the last terms are equal', () => {
    expect(isAtLeastAsUpToDate(term(6), logIndex(9), FIGURE_7.leader)).toBe(false);
    expect(isAtLeastAsUpToDate(term(6), logIndex(10), FIGURE_7.a)).toBe(true);
  });

  it('rejects a long log made of stale terms', () => {
    // (f) has 11 entries but its newest is term 3.
    expect(isAtLeastAsUpToDate(term(3), logIndex(11), FIGURE_7.leader)).toBe(false);
  });

  it('accepts an identical log, since a voter may vote for an equal peer', () => {
    expect(isAtLeastAsUpToDate(term(6), logIndex(10), FIGURE_7.leader)).toBe(true);
  });

  it('lets any candidate win a vote from a server with an empty log', () => {
    expect(isAtLeastAsUpToDate(TERM_ZERO, INDEX_ZERO, [])).toBe(true);
    expect(isAtLeastAsUpToDate(term(1), logIndex(1), [])).toBe(true);
  });
});
