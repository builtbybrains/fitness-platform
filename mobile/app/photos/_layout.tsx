import { Stack } from 'expo-router';

import { C } from '../../src/design';

export default function PhotosLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />;
}
