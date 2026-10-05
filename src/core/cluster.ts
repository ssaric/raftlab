import type { ClusterConfig } from './config';
import type { LogIndex, ServerId, Term } from './ids';
import { INDEX_ZERO, TERM_ZERO } from './ids';
import type { Log } from './log';
import type { Rng } from './rng';
import { rngFromSeed } from './rng';

export type Role = 'follower' | 'candidate' | 'leader';

/**
 * One server, split along the line Figure 2 of the paper draws: state that
 * must survive a crash, and state that must not.
 *
 * The split is not bookkeeping, it is the safety argument. `currentTerm` and
 * `votedFor` are persistent because a server that forgets them can vote twice
 * in one term, and two votes in one term is how you get two leaders. `role`
 * and `commitIndex` are volatile because a restarted server has no right to
 * assume anything about the cluster it woke up into.
 */
export type ServerState = {
  readonly id: ServerId;

  /** Whether the process is stopped. A down server neither sends nor replies. */
  readonly down: boolean;

  // Persistent: on a real server this is fsynced before replying to any RPC,
  // so a restart finds it intact.
  readonly currentTerm: Term;
  readonly votedFor: ServerId | undefined;
  readonly log: Log;

  // Volatile: rebuilt after a restart. A leader that comes back up does not
  // know it was a leader, which is exactly what stops it acting like one.
  readonly role: Role;
  readonly commitIndex: LogIndex;
};

export type ClusterState = {
  readonly config: ClusterConfig;
  readonly servers: Readonly<Record<ServerId, ServerState>>;

  /** Virtual milliseconds since the simulation started. Never wall time. */
  readonly now: number;

  readonly rng: Rng;
};

/**
 * Everything the user can do to the cluster.
 *
 * Only user actions and the passage of time are recorded. What the protocol
 * does in response -- timeouts firing, votes being cast -- is derived by the
 * reducer on replay rather than stored, which is what keeps a whole session
 * small enough to put in a URL.
 */
export type Event =
  | { readonly kind: 'tick'; readonly ms: number }
  | { readonly kind: 'crash'; readonly server: ServerId }
  | { readonly kind: 'restart'; readonly server: ServerId };

export const initialServer = (id: ServerId): ServerState => ({
  id,
  down: false,
  currentTerm: TERM_ZERO,
  votedFor: undefined,
  log: [],
  role: 'follower',
  commitIndex: INDEX_ZERO
});

export const initialCluster = (config: ClusterConfig, seed: number): ClusterState => ({
  config,
  servers: Object.fromEntries(config.servers.map((id) => [id, initialServer(id)])),
  now: 0,
  rng: rngFromSeed(seed)
});

/**
 * Apply `change` to one server. Returns the original state when the server is
 * unknown or the change was a no-op, so that an event which does nothing
 * costs nothing and leaves object identity alone.
 *
 * An unknown id is not an error: it arrives from a shared link or a
 * hand-edited event list, and replay has to survive it rather than throw.
 */
const mapServer = (
  state: ClusterState,
  id: ServerId,
  change: (server: ServerState) => ServerState
): ClusterState => {
  const server = state.servers[id];
  if (server === undefined) return state;

  const next = change(server);
  if (next === server) return state;

  return { ...state, servers: { ...state.servers, [id]: next } };
};

export const reduce = (state: ClusterState, event: Event): ClusterState => {
  switch (event.kind) {
    case 'tick':
      // Time only moves forward; a non-positive step would let a replay land
      // somewhere the original run never was.
      return event.ms <= 0 ? state : { ...state, now: state.now + event.ms };

    case 'crash':
      return mapServer(state, event.server, (server) =>
        server.down ? server : { ...server, down: true }
      );

    case 'restart':
      // The persistent fields carry over untouched; the volatile ones go back
      // to their starting values.
      return mapServer(state, event.server, (server) =>
        server.down ? { ...server, down: false, role: 'follower', commitIndex: INDEX_ZERO } : server
      );
  }
};
