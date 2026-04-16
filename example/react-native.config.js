module.exports = {
  project: {
    ios: {
      sourceDir: './ios',
    },
    android: {
      sourceDir: './android',
    },
  },
  dependencies: {
    'react-native-webview': {
      platforms: {
        android: null,
        ios: null,
      },
    },
  },
  // Auto-link will pick up @sourceship/capture360 from node_modules
};
