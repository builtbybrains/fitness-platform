import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { Icon, IconName, Txt } from '@/components';
import { useTabBarHeight } from '@/lib/tabBar';
import { colors, radius, s, shadow, spacing } from '@/theme';

const TABS: Record<string, { title: string; icon: IconName }> = {
  index: { title: 'Home', icon: 'home' },
  ai: { title: 'AI', icon: 'ai' },
  plan: { title: 'Plan', icon: 'plan' },
  progress: { title: 'Progress', icon: 'progress' },
  profile: { title: 'Profile', icon: 'profile' },
};

/**
 * Fully custom bar instead of styling React Navigation's default. Its built-in
 * layout splits each item into separate icon and label regions with their own
 * padding, which is why a styled icon+label combination never quite centred.
 * Here every tab is one flex column, so centring is exact by construction.
 */
function BlackTabBar({ state, navigation }: BottomTabBarProps) {
  const { barHeight, bottomOffset } = useTabBarHeight();

  return (
    <View style={[styles.bar, { height: barHeight, bottom: bottomOffset }]}>
      {state.routes.map((route, i) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === i;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.title}
            style={styles.tab}
            hitSlop={6}
          >
            <View style={[styles.iconPill, focused && styles.iconPillActive]}>
              <Icon
                name={tab.icon}
                size={s(20)}
                color={focused ? colors.primary : 'rgba(255,255,255,0.55)'}
                strokeWidth={focused ? 2.1 : 1.6}
              />
            </View>
            <Txt
              variant="caption"
              color={focused ? colors.onPrimary : 'rgba(255,255,255,0.4)'}
              maxFontSizeMultiplier={1}
              numberOfLines={1}
            >
              {tab.title}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <BlackTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarHideOnKeyboard: Platform.OS === 'android',
      }}
    >
      {Object.entries(TABS).map(([name, tab]) => (
        <Tabs.Screen key={name} name={name} options={{ title: tab.title }} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: s(8),
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    ...shadow.glow,
    elevation: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iconPill: {
    width: s(44),
    height: s(27),
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: { backgroundColor: colors.accent },
});
