import { Platform, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Icon, IconName, Txt } from '@/components';
import { useTabBarHeight } from '@/lib/tabBar';
import { colors, radius, s, shadow, spacing } from '@/theme';

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'ai', title: 'AI', icon: 'ai' },
  { name: 'plan', title: 'Plan', icon: 'plan' },
  { name: 'progress', title: 'Progress', icon: 'progress' },
  { name: 'profile', title: 'Profile', icon: 'profile' },
];

/** Bold black floating pill, echoing the design's primary buttons. */
export default function TabsLayout() {
  const { barHeight, bottomOffset } = useTabBarHeight();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: [
          styles.bar,
          { height: barHeight, bottom: bottomOffset },
        ],
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
                    size={s(20)}
                    color={focused ? colors.onAccent : 'rgba(255,255,255,0.55)'}
                    strokeWidth={focused ? 2.1 : 1.6}
                  />
                </View>
                <Txt
                  variant="caption"
                  color={focused ? colors.onPrimary : 'rgba(255,255,255,0.45)'}
                  maxFontSizeMultiplier={1}
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
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    borderTopWidth: 0,
    paddingTop: s(6),
    paddingBottom: 0,
    elevation: 8,
    ...shadow.glow,
  },
  item: { paddingTop: 0 },
  tab: { alignItems: 'center', justifyContent: 'center', gap: 2, width: s(62) },
  iconWrap: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  iconActive: { backgroundColor: colors.accent },
});
