const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// @stripe/stripe-react-native is native-only and breaks the web bundle, which is
// used here to run and verify the app in a browser. Native builds are untouched.
const stub = path.resolve(__dirname, 'src/lib/stripeStub.js');
const upstreamResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName.startsWith('@stripe/stripe-react-native')) {
    return { type: 'sourceFile', filePath: stub };
  }
  return upstreamResolve
    ? upstreamResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
