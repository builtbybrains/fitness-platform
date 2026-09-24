import { Stack } from 'expo-router';

import { C } from '../../src/design.ts';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: C.bg },
      }}
    />
  );
}
