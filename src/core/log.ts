import type { LogIndex, Term } from './ids';
import { INDEX_ZERO, TERM_ZERO, logIndex } from './ids';

/**
 * What the replicated state machine is asked to do. Deliberately tiny -- the
 * point of the simulation is the agreement, not the store -- but real enough
 * that "committed" and "applied" become visibly different things.
 */
export type Command =
  | { readonly kind: 'set'; readonly key: string; readonly value: number }
  | { readonly kind: 'delete'; readonly key: string };

export type LogEntry = {
  /** The term of the leader that created this entry. Never rewritten. */
  readonly term: Term;
  readonly command: Command;
};

/** 1-indexed in the paper, so the entry at LogIndex i lives at array i - 1. */
export type Log = readonly LogEntry[];

export const entryAt = (log: Log, index: LogIndex): LogEntry | undefined =>
  index < 1 ? undefined : log[index - 1];

export const lastIndex = (log: Log): LogIndex => logIndex(log.length);

/**
 * Term of the entry at `index`. TERM_ZERO for index 0, the empty position
 * before the log starts; undefined when the log does not reach that far --
 * a distinction the consistency check below depends on.
 */
export const termAt = (log: Log, index: LogIndex): Term | undefined =>
  index === INDEX_ZERO ? TERM_ZERO : entryAt(log, index)?.term;

export const lastTerm = (log: Log): Term => termAt(log, lastIndex(log)) ?? TERM_ZERO;

/**
 * The AppendEntries consistency check (§5.3).
 *
 * A follower accepts entries only if it holds an entry at `prevIndex` whose
 * term is `prevTerm`. That single comparison is the induction step behind the
 * Log Matching Property: if two logs agree on the index *and* term of one
 * entry, they agree on every entry before it. A log that is too short fails
 * here, which is what drives the leader to walk `nextIndex` backwards.
 */
export const acceptsAppendAt = (log: Log, prevIndex: LogIndex, prevTerm: Term): boolean =>
  termAt(log, prevIndex) === prevTerm;

/**
 * Splice `entries` in after `prevIndex`, truncating only on a real conflict.
 *
 * The paper is explicit that a follower must not blindly truncate everything
 * after prevIndex: a delayed or duplicated AppendEntries would then chop off
 * entries the follower already has -- possibly committed ones. So an existing
 * entry that agrees on term is left in place, and only a term mismatch drops
 * the suffix.
 */
export const withEntriesAppended = (log: Log, prevIndex: LogIndex, entries: Log): Log => {
  const result = log.slice();

  for (let offset = 0; offset < entries.length; offset += 1) {
    const incoming = entries[offset];
    if (incoming === undefined) continue;

    /** 1-based position this incoming entry belongs at. */
    const position = prevIndex + offset + 1;
    const existing = result[position - 1];

    if (existing === undefined) {
      result.push(incoming);
    } else if (existing.term !== incoming.term) {
      result.length = position - 1;
      result.push(incoming);
    }
  }

  return result;
};

/**
 * The election restriction (§5.4.1): a voter refuses any candidate whose log
 * is not at least as up to date as its own.
 *
 * "Up to date" compares last term first and only then length, so a longer log
 * stuffed with entries from an older term loses to a shorter, fresher one.
 * This comparison is what guarantees a winning candidate already holds every
 * committed entry -- and therefore why Raft never has to ship entries
 * backwards from a follower to a leader.
 */
export const isAtLeastAsUpToDate = (
  candidateLastTerm: Term,
  candidateLastIndex: LogIndex,
  voterLog: Log
): boolean => {
  const voterTerm = lastTerm(voterLog);
  if (candidateLastTerm !== voterTerm) return candidateLastTerm > voterTerm;
  return candidateLastIndex >= lastIndex(voterLog);
};
