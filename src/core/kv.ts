import type { Command } from './log';

/** The replicated state machine: applied entries, folded into a small map. */
export type KvState = Readonly<Record<string, number>>;

export const EMPTY_KV: KvState = {};

export const applyCommand = (kv: KvState, command: Command): KvState => {
  switch (command.kind) {
    case 'set':
      return { ...kv, [command.key]: command.value };
    case 'delete': {
      if (!(command.key in kv)) return kv;
      const next = { ...kv };
      delete next[command.key];
      return next;
    }
  }
};
