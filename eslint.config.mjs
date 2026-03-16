import antfu from '@antfu/eslint-config'

export default antfu({
  react: true,
  formatters: true,
  ignores: ['next-env.d.ts'],
  rules: {
    'no-alert': 'off',
    'no-console': 'off',
    'node/prefer-global/process': 'off',
    'e18e/prefer-static-regex': 'off',
  },
})
