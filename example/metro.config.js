const path = require('path');
const {getDefaultConfig} = require('@react-native/metro-config');

const photospherePath = path.resolve(__dirname, '..');

const config = getDefaultConfig(__dirname);

// Escape path for use in regex
const escapeForRegex = (p) => p.replace(/[/\\]/g, '[/\\\\]');

// Watch the library source so edits hot-reload
config.watchFolders = [photospherePath];

// Resolve all modules from the example's node_modules first
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

// Block the library's own copies of react & react-native so only
// the example's copies are ever used (prevents duplicate-React hooks crash).
const libReact = escapeForRegex(path.resolve(photospherePath, 'node_modules', 'react'));
const libRN = escapeForRegex(path.resolve(photospherePath, 'node_modules', 'react-native'));
config.resolver.blockList = [
  new RegExp(`${libReact}[/\\\\].*`),
  new RegExp(`${libRN}[/\\\\].*`),
];

// Fallback resolution for any remaining references
config.resolver.extraNodeModules = {
  react: path.resolve(__dirname, 'node_modules/react'),
  'react-native': path.resolve(__dirname, 'node_modules/react-native'),
};

module.exports = config;
