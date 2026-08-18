import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isAndroid, s, spacing } from '@/theme';

/** Height of the bar itself, above whatever safe-area padding sits under it. */
export const TAB_BAR_CONTENT_HEIGHT = s(58);

/**
 * The tab bar is absolutely positioned so content can scroll underneath it.
 * That means screens must reserve the space themselves, and both the bar and
 * the screens have to agree on exactly how tall it is. This is the one place
 * that number is computed.
 */
export function useTabBarHeight() {
  const insets = useSafeAreaInsets();
  // Android gesture bars report a small or zero inset; give it a floor so the
  // bar never sits flush against the bottom edge on either platform.
  const bottomInset = Math.max(insets.bottom, isAndroid ? spacing.sm : spacing.xs);
  return { height: TAB_BAR_CONTENT_HEIGHT + bottomInset, bottomInset };
}
