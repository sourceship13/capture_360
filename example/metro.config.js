const path = require('path');
const {getDefaultConfig} = require('@react-native/metro-config');

const photospherePath = path.resolve(__dirname, '..');

const config = getDefaultConfig(__dirname);

// Watch the library source so edits hot-reload
config.watchFolders = [photospherePath];

// Resolve all modules from the example's node_modules first
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

// Prevent duplicate React/RN from the library's own node_modules
config.resolver.extraNodeModules = {
  react: path.resolve(__dirname, 'node_modules/react'),
  'react-native': path.resolve(__dirname, 'node_modules/react-native'),
};

module.exports = config;
