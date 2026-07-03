import antfu from '@antfu/eslint-config'

export default antfu(
  {
    react: true,
    formatters: true,
    ignores: ['next-env.d.ts'],
    rules: {
      'no-console': 'off',
      'node/prefer-global/process': 'off',
      'e18e/prefer-static-regex': 'off',
    },
  },
  {
    // Next.js metadata file conventions require these non-component exports.
    files: ['app/opengraph-image.tsx', 'app/apple-icon.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
)
