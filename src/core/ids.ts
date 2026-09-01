/**
 * Raft juggles two kinds of integer that are disastrous to mix up: a term and
 * a position in the log. Passing a term where an index belongs is one of the
 * classic ways to write a subtly broken Raft, and the resulting bug is
 * invisible until a specific interleaving hits it -- so the two are branded
 * and the compiler refuses to interchange them.
 *
 * Server ids are strings, which makes them unconfusable with either and
 * pleasant to print.
 */
declare const brand: unique symbol;

type Branded<T, B extends string> = T & { readonly [brand]: B };

export type ServerId = Branded<string, 'ServerId'>;

export type Term = Branded<number, 'Term'>;

/**
 * A 1-based position in the log, following the paper.
 *
 * Index 0 is a real, meaningful position: "before the first entry". It is what
 * `prevLogIndex` carries in a leader's very first AppendEntries, and where
 * `commitIndex` starts. Treating it as a valid value rather than a special
 * case removes a whole family of off-by-one branches.
 */
export type LogIndex = Branded<number, 'LogIndex'>;

export const serverId = (id: string): ServerId => id as ServerId;

export const term = (n: number): Term => n as Term;

export const logIndex = (n: number): LogIndex => n as LogIndex;

export const TERM_ZERO = term(0);

export const INDEX_ZERO = logIndex(0);

export const nextTerm = (t: Term): Term => term(t + 1);

export const nextIndex = (i: LogIndex): LogIndex => logIndex(i + 1);
