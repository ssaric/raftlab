import { describe, expect, it } from 'vitest';
import { configOf, isMember, isQuorum, quorumSize } from './config';
import { serverId } from './ids';

const votes = (...ids: string[]) => new Set(ids.map(serverId));

describe('quorum size', () => {
  it('is a strict majority of the members', () => {
    expect(quorumSize(configOf(['S1']))).toBe(1);
    expect(quorumSize(configOf(['S1', 'S2']))).toBe(2);
    expect(quorumSize(configOf(['S1', 'S2', 'S3']))).toBe(2);
    expect(quorumSize(configOf(['S1', 'S2', 'S3', 'S4']))).toBe(3);
    expect(quorumSize(configOf(['S1', 'S2', 'S3', 'S4', 'S5']))).toBe(3);
  });

  it('tolerates the same number of failures at 2n and 2n+1 members', () => {
    // Why odd cluster sizes are conventional: adding a fifth server to a
    // four-server cluster buys nothing in fault tolerance.
    const four = configOf(['S1', 'S2', 'S3', 'S4']);
    const five = configOf(['S1', 'S2', 'S3', 'S4', 'S5']);
    expect(four.servers.length - quorumSize(four)).toBe(1);
    expect(five.servers.length - quorumSize(five)).toBe(2);
  });
});

describe('detecting a quorum', () => {
  const cluster = configOf(['S1', 'S2', 'S3', 'S4', 'S5']);

  it('needs a majority', () => {
    expect(isQuorum(cluster, votes('S1', 'S2'))).toBe(false);
    expect(isQuorum(cluster, votes('S1', 'S2', 'S3'))).toBe(true);
  });

  it('ignores votes from servers outside the configuration', () => {
    expect(isQuorum(cluster, votes('S1', 'S2', 'S9'))).toBe(false);
  });

  it('finds no quorum in an empty vote set', () => {
    expect(isQuorum(cluster, votes())).toBe(false);
  });

  it('cannot find two disjoint quorums -- the reason there is one leader', () => {
    const half = votes('S1', 'S2', 'S3');
    const other = votes('S4', 'S5');
    expect(isQuorum(cluster, half)).toBe(true);
    expect(isQuorum(cluster, other)).toBe(false);
  });
});

describe('membership', () => {
  it('reports whether a server belongs to the configuration', () => {
    const cluster = configOf(['S1', 'S2']);
    expect(isMember(cluster, serverId('S1'))).toBe(true);
    expect(isMember(cluster, serverId('S3'))).toBe(false);
  });
});
