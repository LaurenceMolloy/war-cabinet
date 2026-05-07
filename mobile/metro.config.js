const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');
config.resolver.sourceExts.push('wasm');
config.resolver.resolverMainFields = ['browser', 'main', 'react-native'];

module.exports = config;
