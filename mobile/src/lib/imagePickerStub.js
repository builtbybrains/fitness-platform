// Web stand-in for expo-image-picker. Its web build uses `import.meta`, which
// breaks a classic <script> bundle. Meal photos are a native feature; this only
// exists so the web bundle (used to preview the app in a browser) can resolve.
module.exports = {
  requestCameraPermissionsAsync: async () => ({ granted: false }),
  requestMediaLibraryPermissionsAsync: async () => ({ granted: false }),
  launchCameraAsync: async () => ({ canceled: true, assets: null }),
  launchImageLibraryAsync: async () => ({ canceled: true, assets: null }),
};
