import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { s, spacing } from '@/theme';

/** Height of the floating pill itself. */
export const TAB_BAR_CONTENT_HEIGHT = s(62);
/** Air between the pill and the content scrolling behind it. */
export const TAB_BAR_FLOAT_GAP = s(12);

/**
 * The tab bar is a floating black pill, absolutely positioned, so content can
 * scroll underneath it. Screens must reserve the space themselves, and both
 * the bar and the screens have to agree on exactly how much. This is the one
 * place that number is computed.
 */
export function useTabBarHeight() {
  const insets = useSafeAreaInsets();
  // Distance from the screen's bottom edge to the pill.
  const bottomOffset = Math.max(insets.bottom, s(12));
  return {
    barHeight: TAB_BAR_CONTENT_HEIGHT,
    bottomOffset,
    /** Clearance a scrolling screen needs at the bottom. */
    height: TAB_BAR_CONTENT_HEIGHT + bottomOffset + TAB_BAR_FLOAT_GAP,
    bottomInset: bottomOffset,
  };
}
export { spacing as tabBarSpacing };
