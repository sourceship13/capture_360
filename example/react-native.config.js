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
        ios: null,
      },
    },
  },
  // Auto-link will pick up @sera/capture360 from node_modules
};
