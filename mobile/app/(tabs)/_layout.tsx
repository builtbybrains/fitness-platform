/* BUILT tab bar: Carbon, green active icon and label, grey inactive.
   Five tabs for what people do every day: Today, Plan (Train), Food
   (Nutrition), Coach and Profile. Progress is a weekly look, so it opens
   from Today's Progress tile and streak (and Profile) instead of taking a
   tab; it keeps the tab bar, and Back returns to where it was opened from.

   Motion: a short Stone bar under the active tab springs across to
   the new tab (about 250ms), and the new tab's icon pops (scale 0.9 to 1,
   180ms, ease-out quart), with a selection tick on phones. On Progress no
   tab is active, so the bar fades out. The new tab's content slides 24px
   in from the side it came from and fades in (220ms; tabLayout in
   ScreenFade). Reduce Motion: the bar jumps, no pop, no slide. */

import { ComponentProps, ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';

import { C, FONT } from '../../src/design';
import { Icon, IconName } from '../../src/components/Icon';
import { useReduceMotion } from '../../src/components/motion';
import { tabLayout } from '../../src/components/ScreenFade';
import { haptic } from '../../src/lib/haptics';
import { indicatorX, INDICATOR_WIDTH } from '../../src/lib/tabIndicator';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
type TabIcon = (p: { focused: boolean; color: string; size: number }) => ReactNode;

const NATIVE = Platform.OS !== 'web';
const INDICATOR_HEIGHT = 3;

function tab(title: string, icon: IconName) {
  return {
    title,
    tabBarAccessibilityLabel: title,
    tabBarIcon: ({ focused }: { focused: boolean }) => <Icon name={icon} size={24} color={focused ? C.green : C.faint} />,
  };
}

/** Scale for an icon that just became the active tab. */
function useFocusPop(focused: boolean, reduce: boolean): Animated.Value {
  const scale = useRef(new Animated.Value(1)).current;
  const was = useRef(focused);
  useEffect(() => {
    const popped = focused && !was.current;
    was.current = focused;
    if (!popped || reduce) {
      scale.setValue(1);
      return;
    }
    scale.setValue(0.9);
    const a = Animated.timing(scale, { toValue: 1, duration: 180, easing: Easing.out(Easing.poly(4)), useNativeDriver: NATIVE });
    a.start();
    return () => a.stop();
  }, [focused, reduce, scale]);
  return scale;
}

function TabItem({ label, a11y, focused, icon, reduce, onPress, onLongPress }: { label: string; a11y?: string; focused: boolean; icon?: TabIcon; reduce: boolean; onPress: () => void; onLongPress: () => void }) {
  const scale = useFocusPop(focused, reduce);
  const color = focused ? C.green : C.faint;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      aria-selected={focused}
      accessibilityLabel={a11y ?? label}
      style={({ pressed }) => ({ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingBottom: INDICATOR_HEIGHT + 6, opacity: pressed ? 0.7 : 1 })}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{icon?.({ focused, color, size: 24 })}</Animated.View>
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontFamily: FONT.bodyMedium, marginTop: 4, color }}>
        {label}
      </Text>
    </Pressable>
  );
}

function TabBar({ state, descriptors, navigation, insets }: TabBarProps) {
  const reduce = useReduceMotion();
  const [rowWidth, setRowWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const shown = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  // Routes with `href: null` (Progress) have no tab.
  const visible = state.routes.filter((r) => StyleSheet.flatten(descriptors[r.key].options.tabBarItemStyle)?.display !== 'none');
  const active = visible.findIndex((r) => r.key === state.routes[state.index].key);
  const to = indicatorX(rowWidth, visible.length, active);

  useEffect(() => {
    if (rowWidth === 0) return;
    if (to == null) {
      Animated.timing(shown, { toValue: 0, duration: 150, easing: Easing.out(Easing.poly(4)), useNativeDriver: NATIVE }).start();
      return;
    }
    if (!placed.current || reduce) {
      placed.current = true;
      x.setValue(to);
      shown.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.spring(x, { toValue: to, stiffness: 400, damping: 34, mass: 1, useNativeDriver: NATIVE }),
      Animated.timing(shown, { toValue: 1, duration: 150, easing: Easing.out(Easing.poly(4)), useNativeDriver: NATIVE }),
    ]).start();
  }, [to, rowWidth, reduce, x, shown]);

  return (
    <View
      style={{
        backgroundColor: C.card,
        borderTopColor: C.line,
        borderTopWidth: 1,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 6),
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View accessibilityRole="tablist" onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', width: '100%', maxWidth: 640, alignSelf: 'center' }}>
        {visible.map((route) => {
          const { options } = descriptors[route.key];
          const focused = route.key === state.routes[state.index].key;
          return (
            <TabItem
              key={route.key}
              label={options.title ?? route.name}
              a11y={options.tabBarAccessibilityLabel}
              focused={focused}
              icon={options.tabBarIcon as TabIcon | undefined}
              reduce={reduce}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) {
                  haptic.select();
                  navigation.navigate(route.name, route.params);
                }
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            />
          );
        })}
        <Animated.View
          style={{
            pointerEvents: 'none',
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: INDICATOR_WIDTH,
            height: INDICATOR_HEIGHT,
            borderRadius: INDICATOR_HEIGHT / 2,
            backgroundColor: C.stone,
            opacity: shown,
            transform: [{ translateX: x }],
          }}
        />
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <TabBar {...props} />}
      screenLayout={tabLayout}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen name="index" options={tab('Today', 'home')} />
      <Tabs.Screen name="plan" options={tab('Plan', 'dumbbell')} />
      <Tabs.Screen name="food" options={tab('Food', 'burger')} />
      <Tabs.Screen name="coach" options={tab('Coach', 'brain')} />
      <Tabs.Screen name="profile" options={tab('Profile', 'person')} />
      <Tabs.Screen name="progress" options={{ ...tab('Progress', 'bars'), href: null }} />
    </Tabs>
  );
}
