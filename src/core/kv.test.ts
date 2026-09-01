import { describe, expect, it } from 'vitest';
import { EMPTY_KV, applyCommand } from './kv';

describe('applying commands to the state machine', () => {
  it('sets a key', () => {
    expect(applyCommand(EMPTY_KV, { kind: 'set', key: 'x', value: 1 })).toEqual({ x: 1 });
  });

  it('overwrites an existing key', () => {
    const once = applyCommand(EMPTY_KV, { kind: 'set', key: 'x', value: 1 });
    expect(applyCommand(once, { kind: 'set', key: 'x', value: 5 })).toEqual({ x: 5 });
  });

  it('deletes a key', () => {
    const state = applyCommand(EMPTY_KV, { kind: 'set', key: 'x', value: 1 });
    expect(applyCommand(state, { kind: 'delete', key: 'x' })).toEqual({});
  });

  it('leaves the state untouched when deleting a missing key', () => {
    const state = applyCommand(EMPTY_KV, { kind: 'set', key: 'x', value: 1 });
    expect(applyCommand(state, { kind: 'delete', key: 'y' })).toBe(state);
  });

  it('does not mutate the state it was given', () => {
    const state = applyCommand(EMPTY_KV, { kind: 'set', key: 'x', value: 1 });
    applyCommand(state, { kind: 'set', key: 'x', value: 2 });
    applyCommand(state, { kind: 'delete', key: 'x' });
    expect(state).toEqual({ x: 1 });
  });
});
