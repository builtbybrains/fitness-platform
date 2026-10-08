/* Pull to refresh for a tab's ScrollView: a Built Green spinner on a
   Carbon disc while `run` re-reads the data, then a light tap when it is
   done. A failed read keeps what is on screen (each store falls back to
   its saved copy). On the web the browser has no pull gesture, so the
   control is simply not there. */

import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';

import { C } from '../design';
import { haptic } from '../lib/haptics';

export function usePullRefresh(run: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await run();
    } catch {
      /* the stores keep their last good copy */
    } finally {
      setRefreshing(false);
      haptic.tap();
    }
  }, [run]);
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.green} colors={[C.green]} progressBackgroundColor={C.card} />;
}
