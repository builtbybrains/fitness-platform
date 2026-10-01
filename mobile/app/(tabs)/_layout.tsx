/* BUILT tab bar: Carbon, green active icon and label, grey inactive.
   Icons are the app's own 2px outline set. */

import { Tabs } from 'expo-router';

import { C, FONT } from '../../src/design';
import { Icon, IconName } from '../../src/components/Icon';

function tab(title: string, icon: IconName) {
  return {
    title,
    tabBarAccessibilityLabel: title,
    tabBarIcon: ({ focused }: { focused: boolean }) => <Icon name={icon} size={24} color={focused ? C.green : C.faint} />,
  };
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: C.bg },
        tabBarStyle: {
          backgroundColor: C.card,
          borderTopColor: C.line,
          borderTopWidth: 1,
          minHeight: 64,
          paddingTop: 8,
        },
        tabBarItemStyle: { minHeight: 48 },
        tabBarLabelStyle: { fontSize: 12, fontFamily: FONT.bodyMedium, marginTop: 2 },
        tabBarActiveTintColor: C.green,
        tabBarInactiveTintColor: C.faint,
      }}
    >
      <Tabs.Screen name="index" options={tab('Today', 'home')} />
      <Tabs.Screen name="plan" options={tab('Plan', 'dumbbell')} />
      <Tabs.Screen name="progress" options={tab('Progress', 'bars')} />
      <Tabs.Screen name="coach" options={tab('Coach', 'brain')} />
      <Tabs.Screen name="profile" options={tab('Profile', 'person')} />
    </Tabs>
  );
}
