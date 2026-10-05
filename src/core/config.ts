import type { ServerId } from './ids';
import { serverId } from './ids';

/**
 * Which servers make up the cluster.
 *
 * A plain member list for now. Changing membership safely is its own problem
 * -- naively swapping this list can produce two disjoint majorities and so two
 * leaders in one term -- and gets handled properly, through the log, later.
 */
export type ClusterConfig = {
  readonly servers: readonly ServerId[];
};

export const configOf = (ids: readonly string[]): ClusterConfig => ({
  servers: ids.map(serverId)
});

export const quorumSize = (config: ClusterConfig): number =>
  Math.floor(config.servers.length / 2) + 1;

export const isMember = (config: ClusterConfig, server: ServerId): boolean =>
  config.servers.includes(server);

/**
 * Whether `voters` holds a majority of this configuration.
 *
 * Votes from servers outside the configuration are ignored rather than
 * counted. That is pedantic with a fixed member list and load-bearing the
 * moment membership starts changing.
 */
export const isQuorum = (config: ClusterConfig, voters: ReadonlySet<ServerId>): boolean => {
  let count = 0;
  for (const server of config.servers) {
    if (voters.has(server)) count += 1;
  }
  return count >= quorumSize(config);
};
