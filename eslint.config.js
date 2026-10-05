import js from '@eslint/js';
import ts from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.browser }
    }
  },
  {
    // src/core holds the Raft protocol as a pure state machine. Two rules are
    // enforced rather than merely intended, because both are load-bearing:
    //
    //   no DOM        -- the whole protocol stays unit testable without a
    //                    browser, and view concerns cannot leak into it.
    //   no ambient    -- the simulation must be reproducible from a seed
    //   randomness       alone. Math.random or a real clock would make a
    //   or real time     recorded scenario replay differently, which breaks
    //                    both the timeline and shareable URLs.
    files: ['src/core/**'],
    languageOptions: {
      globals: {}
    },
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'core/ must stay DOM-free.' },
        { name: 'window', message: 'core/ must stay DOM-free.' },
        { name: 'performance', message: 'core/ uses the virtual clock, not wall time.' }
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'core/ must be deterministic; use the seeded Rng from core/rng.ts.'
        },
        {
          object: 'Date',
          property: 'now',
          message: 'core/ uses the virtual clock, not wall time.'
        }
      ]
    }
  },
  {
    ignores: ['dist/', 'node_modules/']
  }
);
