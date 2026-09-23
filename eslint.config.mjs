// Flat config (ESLint 9+). O `next lint` saiu no Next 16 — o lint roda pelo eslint
// direto, via `npm run lint`.
import next from 'eslint-config-next';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      // O protótipo de referência não é código de produção (ver CLAUDE.md).
      'design/**',
      'next-env.d.ts',
    ],
  },
  ...next,
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Playwright fixtures take a callback parameter named `use`, which the React Hooks
    // rule mistakes for a hook call. There is no React in the e2e suite.
    files: ['e2e/**/*.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
];

export default config;
