import React, { useRef } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBarHeight } from '@/lib/tabBar';
import { colors, isTablet, spacing } from '@/theme';

interface Props {
  children: React.ReactNode;
  /**
   * Pinned above the scroll area. Content passes underneath it, and a hairline
   * fades in once the page has moved so the join reads cleanly.
   */
  header?: React.ReactNode;
  scroll?: boolean;
  /** Leaves room for the floating tab bar. */
  tabBarPadding?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  keyboardAware?: boolean;
  edges?: { top?: boolean; bottom?: boolean };
}

/**
 * The single place safe areas are handled. Screens never read insets directly,
 * so nothing ends up under a notch, a home indicator, or Android's gesture bar.
 * Content is also width-capped so it does not stretch on tablets and foldables.
 */
export function Screen({
  children,
  header,
  scroll = true,
  tabBarPadding,
  onRefresh,
  refreshing = false,
  contentStyle,
  keyboardAware,
  edges,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: tabBarHeight } = useTabBarHeight();
  const top = edges?.top === false ? 0 : insets.top;
  const bottom = edges?.bottom === false ? 0 : insets.bottom;

  const divider = useRef(new Animated.Value(0)).current;
  const shown = useRef(false);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const past = e.nativeEvent.contentOffset.y > 4;
    if (past === shown.current) return;
    shown.current = past;
    Animated.timing(divider, {
      toValue: past ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  };

  const padding: ViewStyle = {
    // With a pinned header the inset is already spent above; without one the
    // scroll content carries it. `padding` is applied last so a screen passing
    // its own paddingTop cannot erase the safe area.
    paddingTop: header ? spacing.lg : top + spacing.md,
    paddingBottom: tabBarPadding ? tabBarHeight + spacing.xl : bottom + spacing.xl,
    paddingHorizontal: spacing.lg,
  };

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, padding]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      onScroll={header ? onScroll : undefined}
      scrollEventThrottle={header ? 16 : undefined}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        ) : undefined
      }
    >
      <View style={[styles.inner, contentStyle]}>{children}</View>
    </ScrollView>
  ) : (
    <View style={[styles.flex, padding]}>
      <View style={[styles.inner, styles.flex, contentStyle]}>{children}</View>
    </View>
  );

  return (
    <View style={styles.root}>
      {header ? (
        <View style={[styles.header, { paddingTop: top + spacing.md }]}>
          <View style={styles.inner}>{header}</View>
          <Animated.View style={[styles.divider, { opacity: divider }]} />
        </View>
      ) : null}

      {keyboardAware ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { flexGrow: 1 },
  inner: {
    width: '100%',
    maxWidth: isTablet ? 620 : undefined,
    alignSelf: 'center',
  },
  header: {
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    zIndex: 10,
  },
  divider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
