import { Stack } from 'expo-router';

import { C } from '../../src/design';
import { PUSH, stackLayout } from '../../src/components/ScreenFade';

export default function PhotosLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, ...PUSH }} screenLayout={stackLayout} />;
}
