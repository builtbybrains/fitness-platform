import { Stack } from 'expo-router';

import { C } from '../../src/design';
import { PUSH, webFadeLayout } from '../../src/components/ScreenFade';

export default function Layout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, ...PUSH }} screenLayout={webFadeLayout} />;
}
