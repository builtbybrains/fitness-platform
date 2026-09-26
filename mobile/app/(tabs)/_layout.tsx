/* VITAL tab shell. Step 2 scope: navigation + Today only. */

import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { C, FONT } from '../../src/design';

function TabGlyph({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 20, color: focused ? C.mint : C.muted }}>{glyph}</Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(6,9,13,0.92)',
          borderTopColor: C.line,
          borderTopWidth: 1,
          height: 84,
          paddingTop: 10,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', fontFamily: FONT.regular },
        tabBarActiveTintColor: C.mint,
        tabBarInactiveTintColor: C.muted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ focused }) => <TabGlyph glyph="◎" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Plan',
          tabBarIcon: ({ focused }) => <TabGlyph glyph="▤" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ focused }) => <TabGlyph glyph="↗" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarIcon: ({ focused }) => <TabGlyph glyph="✦" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabGlyph glyph="◍" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
