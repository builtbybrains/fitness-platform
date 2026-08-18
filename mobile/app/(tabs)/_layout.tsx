import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Icon, IconName, Txt } from '@/components';
import { useTabBarHeight } from '@/lib/tabBar';
import { colors, radius, s, spacing } from '@/theme';

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'ai', title: 'AI', icon: 'ai' },
  { name: 'plan', title: 'Plan', icon: 'plan' },
  { name: 'progress', title: 'Progress', icon: 'progress' },
  { name: 'profile', title: 'Profile', icon: 'profile' },
];

export default function TabsLayout() {
  const { height, bottomInset } = useTabBarHeight();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: [styles.bar, { height, paddingBottom: bottomInset }],
        tabBarItemStyle: styles.item,
        tabBarHideOnKeyboard: Platform.OS === 'android',
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarAccessibilityLabel: tab.title,
            tabBarIcon: ({ focused }) => (
              <View style={styles.tab}>
                <View style={[styles.iconWrap, focused && styles.iconActive]}>
                  <Icon
                    name={tab.icon}
                    size={s(21)}
                    color={focused ? colors.primaryLight : colors.muted}
                    strokeWidth={focused ? 2 : 1.6}
                  />
                </View>
                <Txt
                  variant="caption"
                  color={focused ? colors.primaryLight : colors.muted}
                  maxFontSizeMultiplier={1.1}
                  numberOfLines={1}
                >
                  {tab.title}
                </Txt>
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgElevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    elevation: 0,
  },
  item: { paddingTop: 0 },
  tab: { alignItems: 'center', justifyContent: 'center', gap: 2, width: s(64) },
  iconWrap: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  iconActive: { backgroundColor: colors.primarySoft },
});
