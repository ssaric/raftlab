/**
 * The event-sourced history that everything else in the app scrubs over.
 *
 * The design in one line: the recorded truth is the *event list*, and state is
 * a fold over it. Nothing stores state as the primary artifact, which is what
 * makes rewinding exact rather than approximate -- there is no undo to write
 * per event kind, and no chance of an undo disagreeing with its do. Compare
 * the alternative: a Raft event can change every server's term, log, and
 * volatile state at once, and hand-written inverses for that are where the
 * bugs would live.
 *
 * Two consequences worth naming:
 *
 *   Branching. Seeking back and then appending discards the events after the
 *   cursor, exactly like typing after an undo in an editor. "Rewind to tick
 *   20 and crash a different server" is therefore a first-class move.
 *
 *   Sharing. Because the fold is deterministic, a whole session is just its
 *   seed plus its event list -- small enough for a URL.
 *
 * Snapshots exist only for speed. Scrubbing recomputes state from the nearest
 * snapshot instead of from the beginning, so dragging a timeline stays smooth
 * on a long history. They are never the source of truth.
 *
 * It is generic over state and event so it can be tested on its own, without
 * dragging a Raft cluster into the picture.
 */
export type Reducer<S, E> = (state: S, event: E) => S;

const DEFAULT_SNAPSHOT_INTERVAL = 64;

export class History<S, E> {
  private readonly events: E[] = [];

  /** Dense and ordered: `snapshots[k]` is the state after `k * interval` events. */
  private readonly snapshots: S[];

  private cursorIndex = 0;

  private current: S;

  constructor(
    private readonly initial: S,
    private readonly reduce: Reducer<S, E>,
    private readonly snapshotInterval: number = DEFAULT_SNAPSHOT_INTERVAL
  ) {
    if (snapshotInterval < 1) throw new Error('snapshotInterval must be at least 1');
    this.snapshots = [initial];
    this.current = initial;
  }

  /** How many events have been recorded. */
  get length(): number {
    return this.events.length;
  }

  /** How many events are currently applied; 0 through `length`. */
  get cursor(): number {
    return this.cursorIndex;
  }

  /** The state produced by the first `cursor` events. */
  get state(): S {
    return this.current;
  }

  get atHead(): boolean {
    return this.cursorIndex === this.events.length;
  }

  /** The recorded events, for serializing a scenario into a link. */
  get recorded(): readonly E[] {
    return this.events;
  }

  eventAt(index: number): E | undefined {
    return this.events[index];
  }

  /**
   * Record an event and advance onto it.
   *
   * If the cursor is in the past, the events after it are dropped first: a new
   * action from an old point starts a new future rather than being interleaved
   * into one that no longer applies.
   */
  append(event: E): void {
    if (!this.atHead) this.discardAfterCursor();

    this.events.push(event);
    this.current = this.reduce(this.current, event);
    this.cursorIndex = this.events.length;

    if (this.cursorIndex % this.snapshotInterval === 0) {
      this.snapshots[this.cursorIndex / this.snapshotInterval] = this.current;
    }
  }

  /** Move the cursor to `index`, clamped, recomputing the state there. */
  seek(index: number): void {
    const target = Math.max(0, Math.min(Math.trunc(index), this.events.length));
    this.cursorIndex = target;
    this.current = this.stateAt(target);
  }

  /** The state after the first `index` events, without moving the cursor. */
  stateAt(index: number): S {
    const key = Math.floor(index / this.snapshotInterval);
    const snapshot = this.snapshots[key];

    // Snapshots are dense up to the head, so the fallback is unreachable in
    // practice and present for the type checker.
    let state = snapshot ?? this.initial;
    let position = snapshot === undefined ? 0 : key * this.snapshotInterval;

    while (position < index) {
      const event = this.events[position];
      if (event === undefined) break;
      state = this.reduce(state, event);
      position += 1;
    }

    return state;
  }

  private discardAfterCursor(): void {
    this.events.length = this.cursorIndex;
    this.snapshots.length = Math.floor(this.cursorIndex / this.snapshotInterval) + 1;
  }
}
