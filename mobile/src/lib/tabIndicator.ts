/* Where the tab bar's green indicator sits: centred under the active tab
   in a row of `count` equal tabs `rowWidth` wide. */

export const INDICATOR_WIDTH = 24;

/** Left edge of the indicator, or null when no visible tab is active. */
export function indicatorX(rowWidth: number, count: number, index: number, width = INDICATOR_WIDTH): number | null {
  if (!(rowWidth > 0) || count < 1 || index < 0 || index >= count) return null;
  const tab = rowWidth / count;
  return Math.round(tab * index + (tab - width) / 2);
}
