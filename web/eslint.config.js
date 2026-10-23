import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      // The web bundle may use game-core for types only (no game logic in the browser).
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'game-core',
              message: 'Import types only: `import type { ... } from "game-core"`.',
              allowTypeImports: true,
            },
          ],
          patterns: [
            { group: ['game-core/*', '**/packages/**', '../../../*'], message: 'Only `import type` from "game-core"; nothing outside web/.' },
          ],
        },
      ],
    },
  },
);
