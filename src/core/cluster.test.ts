import { describe, expect, it } from 'vitest';
import type { ClusterState, Event } from './cluster';
import { initialCluster, reduce } from './cluster';
import { configOf } from './config';
import { History } from './history';
import { logIndex, serverId, term } from './ids';

const S1 = serverId('S1');
const S2 = serverId('S2');

const cluster = (): ClusterState => initialCluster(configOf(['S1', 'S2', 'S3']), 42);

/** A server that has been running long enough to have real state to lose. */
const withHistoryOfWork = (state: ClusterState): ClusterState => ({
  ...state,
  servers: {
    ...state.servers,
    [S1]: {
      ...initialCluster(configOf(['S1']), 0).servers[S1]!,
      currentTerm: term(7),
      votedFor: S2,
      log: [{ term: term(7), command: { kind: 'set', key: 'x', value: 1 } }],
      role: 'leader',
      commitIndex: logIndex(1)
    }
  }
});

describe('initialCluster', () => {
  it('starts every member as a follower in term 0', () => {
    const state = cluster();

    expect(Object.keys(state.servers)).toEqual(['S1', 'S2', 'S3']);
    for (const server of Object.values(state.servers)) {
      expect(server.role).toBe('follower');
      expect(server.currentTerm).toBe(0);
      expect(server.votedFor).toBeUndefined();
      expect(server.log).toEqual([]);
      expect(server.down).toBe(false);
    }
  });

  it('starts the clock at zero', () => {
    expect(cluster().now).toBe(0);
  });
});

describe('tick', () => {
  it('advances the virtual clock', () => {
    const state = reduce(reduce(cluster(), { kind: 'tick', ms: 30 }), { kind: 'tick', ms: 12 });

    expect(state.now).toBe(42);
  });

  it('ignores a non-positive step, so time cannot run backwards', () => {
    const start = cluster();

    expect(reduce(start, { kind: 'tick', ms: 0 })).toBe(start);
    expect(reduce(start, { kind: 'tick', ms: -5 })).toBe(start);
  });
});

describe('crash', () => {
  it('marks the server down', () => {
    const state = reduce(cluster(), { kind: 'crash', server: S1 });

    expect(state.servers[S1]?.down).toBe(true);
    expect(state.servers[S2]?.down).toBe(false);
  });

  it('is a no-op for a server that is already down', () => {
    const down = reduce(cluster(), { kind: 'crash', server: S1 });

    expect(reduce(down, { kind: 'crash', server: S1 })).toBe(down);
  });
});

describe('restart', () => {
  it('keeps the persistent state and clears the volatile state', () => {
    const working = withHistoryOfWork(cluster());
    const crashed = reduce(working, { kind: 'crash', server: S1 });
    const restarted = reduce(crashed, { kind: 'restart', server: S1 });
    const server = restarted.servers[S1];

    // Survives: forgetting either of these would let S1 vote twice in term 7.
    expect(server?.currentTerm).toBe(7);
    expect(server?.votedFor).toBe(S2);
    expect(server?.log).toHaveLength(1);

    // Lost: it has no right to still believe it is the leader.
    expect(server?.role).toBe('follower');
    expect(server?.commitIndex).toBe(0);
    expect(server?.down).toBe(false);
  });

  it('is a no-op for a server that is already up', () => {
    const start = withHistoryOfWork(cluster());

    expect(reduce(start, { kind: 'restart', server: S1 })).toBe(start);
  });
});

describe('unknown servers', () => {
  it('leaves the state untouched rather than throwing', () => {
    const start = cluster();
    const ghost = serverId('nope');

    expect(reduce(start, { kind: 'crash', server: ghost })).toBe(start);
    expect(reduce(start, { kind: 'restart', server: ghost })).toBe(start);
  });
});

describe('purity', () => {
  it('does not mutate the state it is given', () => {
    const start = withHistoryOfWork(cluster());
    const before = structuredClone(start);

    reduce(start, { kind: 'crash', server: S1 });
    reduce(start, { kind: 'tick', ms: 10 });

    expect(start).toEqual(before);
  });
});

describe('through History', () => {
  const events: readonly Event[] = [
    { kind: 'tick', ms: 100 },
    { kind: 'crash', server: S1 },
    { kind: 'tick', ms: 50 },
    { kind: 'restart', server: S1 }
  ];

  it('replays to the same state at every point', () => {
    const history = new History<ClusterState, Event>(withHistoryOfWork(cluster()), reduce, 2);
    for (const event of events) history.append(event);

    for (let index = 0; index <= events.length; index += 1) {
      const folded = events.slice(0, index).reduce(reduce, withHistoryOfWork(cluster()));
      expect(history.stateAt(index)).toEqual(folded);
    }
  });

  it('branches: rewinding and acting differently discards the old future', () => {
    const history = new History<ClusterState, Event>(cluster(), reduce, 2);
    for (const event of events) history.append(event);

    history.seek(2);
    history.append({ kind: 'crash', server: S2 });

    expect(history.length).toBe(3);
    expect(history.state.servers[S1]?.down).toBe(true);
    expect(history.state.servers[S2]?.down).toBe(true);
  });
});
