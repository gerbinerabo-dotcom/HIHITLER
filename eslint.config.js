import tseslint from 'typescript-eslint';
export default tseslint.config(...tseslint.configs.recommended, {
  ignores: ['dist/**', 'node_modules/**', '.npm-cache/**'],
  rules: { '@typescript-eslint/no-explicit-any': 'off' },
});
