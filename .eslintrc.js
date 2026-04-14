module.exports = {
  root: true,
  extends: '@react-native',
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    'no-console': 'off',
    'no-unused-vars': 'warn',
    'react-native/no-inline-styles': 'warn', // Changed from error to warning
  },
};
