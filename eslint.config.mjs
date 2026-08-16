import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  {
    files: ['esbuild.mjs', 'scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly' } },
  },
  {
    files: ['media/chat.js'],
    languageOptions: {
      globals: {
        acquireVsCodeApi: 'readonly',
        document: 'readonly',
        window: 'readonly',
        FileReader: 'readonly',
        Error: 'readonly',
        clearTimeout: 'readonly',
        setTimeout: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        WeakMap: 'readonly',
        navigator: 'readonly',
      },
    },
  },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'error',
    },
  },
)
