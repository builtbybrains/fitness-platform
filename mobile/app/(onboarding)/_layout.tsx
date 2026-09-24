import { Stack } from 'expo-router';

import { C } from '../../src/design';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        contentStyle: { backgroundColor: C.bg },
      }}
    />
  );
}
