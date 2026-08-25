const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// @stripe/stripe-react-native is native-only and breaks the web bundle, which is
// used here to run and verify the app in a browser. Native builds are untouched.
// Native-only packages that break the web bundle. Web is only used to preview
// the app in a browser; native builds resolve these normally.
const WEB_STUBS = {
  '@stripe/stripe-react-native': path.resolve(__dirname, 'src/lib/stripeStub.js'),
  'expo-image-picker': path.resolve(__dirname, 'src/lib/imagePickerStub.js'),
};
const upstreamResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    const hit = Object.keys(WEB_STUBS).find((n) => moduleName === n || moduleName.startsWith(`${n}/`));
    if (hit) return { type: 'sourceFile', filePath: WEB_STUBS[hit] };
  }
  return upstreamResolve
    ? upstreamResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
