/* The amber "can't reach BUILT" line at the top of Plan, Food, Progress
   and Profile. Shown only for an account whose last read couldn't reach
   the server; Try again reloads the plan, history, activities and the
   profile, and the line goes away once the server answers. */

import { useState } from 'react';
import { Text, View } from 'react-native';

import { C, card, T } from '../design';
import { usePlan } from '../planStore';
import { Notice } from './Bits';
import { Button } from './Button';
import { Icon } from './Icon';

export const OFFLINE_PLAN = "Can't reach BUILT. Showing your last saved plan.";

export function OfflineNotice({ text = OFFLINE_PLAN, show, onRetry }: { text?: string; show?: boolean; onRetry?: () => Promise<unknown> }) {
  const { syncState, reload } = usePlan();
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  if (!(show ?? syncState === 'offline')) return null;
  return (
    <Notice
      tone="warn"
      action={
        <Button
          compact
          variant="secondary"
          icon="refresh"
          label={busy ? 'Trying again' : 'Try again'}
          busy={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await (onRetry ? onRetry() : reload());
            } finally {
              setBusy(false);
              setTried(true);
            }
          }}
          style={{ alignSelf: 'flex-start' }}
          accessibilityLabel="Try reaching BUILT again"
        />
      }
    >
      {tried ? `${text} Still no connection.` : text}
    </Notice>
  );
}

/** Nothing saved on this device to show: say so plainly instead of
    zeros or starter defaults, with Try again. */
export function OfflineBlock({ body, onRetry }: { body: string; onRetry?: () => Promise<unknown> }) {
  const { reload } = usePlan();
  const [busy, setBusy] = useState(false);
  return (
    <View style={[card, { gap: 16 }]} accessibilityLiveRegion="polite">
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="refresh" size={24} color={C.warn} />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={T.h3} accessibilityRole="header">
          Can&apos;t reach BUILT
        </Text>
        <Text style={[T.body, { color: C.muted }]}>{body}</Text>
      </View>
      <Button
        variant="secondary"
        icon="refresh"
        label={busy ? 'Trying again' : 'Try again'}
        busy={busy}
        style={{ alignSelf: 'flex-start' }}
        onPress={async () => {
          setBusy(true);
          try {
            await (onRetry ? onRetry() : reload());
          } finally {
            setBusy(false);
          }
        }}
      />
    </View>
  );
}
