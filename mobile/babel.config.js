module.exports = function (api) {
  api.cache(true);
  // babel-preset-expo already adds react-native-worklets/plugin when Reanimated
  // is installed, so it must not be listed again here.
  return { presets: ['babel-preset-expo'] };
};
