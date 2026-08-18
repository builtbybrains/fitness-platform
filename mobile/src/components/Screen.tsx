import React from 'react';
import {
  KeyboardAvoidingView,
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

  const padding: ViewStyle = {
    paddingTop: top + spacing.xs,
    // The tab bar floats above the scene, so tab screens reserve its exact
    // height. It already covers the bottom inset, so that is not added twice.
    paddingBottom: tabBarPadding ? tabBarHeight + spacing.lg : bottom + spacing.lg,
    paddingHorizontal: spacing.lg,
  };

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, padding, contentStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
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
      <View style={styles.inner}>{children}</View>
    </ScrollView>
  ) : (
    <View style={[styles.flex, padding, contentStyle]}>
      <View style={[styles.inner, styles.flex]}>{children}</View>
    </View>
  );

  return (
    <View style={styles.root}>
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
});
