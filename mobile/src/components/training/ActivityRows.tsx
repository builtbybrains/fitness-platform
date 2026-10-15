/* Logged activities as rows: the sport, minutes, effort and calories, and a
   delete control for the ones logged by hand (health app imports are kept
   in step by the health sync). Deleting asks first. Shared by Today's
   Activity card and the Plan tab's "Log a sport" section. */

import { Text, View } from 'react-native';

import { C, T } from '../../design';
import { activityDef } from '../../data/activities';
import { haptic } from '../../lib/haptics';
import { showConfirm } from '../../lib/dialog';
import { IconButton } from '../Button';
import type { Activity } from '../../types';

export function activityName(a: Pick<Activity, 'label' | 'kind'>): string {
  return a.label || activityDef(a.kind).label;
}

export function ActivityRows({ list, onRemove }: { list: readonly Activity[]; onRemove: (id: string) => void }) {
  async function remove(a: Activity) {
    const name = activityName(a);
    const yes = await showConfirm({
      title: `Delete ${name.toLowerCase()}?`,
      message: `${a.minutes} min, about ${a.kcal} kcal. It comes off that day's activity.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!yes) return;
    haptic.tap();
    onRemove(a.id);
  }
  return (
    <View>
      {list.map((a, i) => (
        <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={T.bodyStrong}>{activityName(a)}</Text>
            <Text style={T.small}>
              {a.minutes} min · {a.effort} · {a.kcal} kcal{a.source === 'health' ? ' · from your health app' : ''}
            </Text>
          </View>
          {a.source === 'manual' ? <IconButton icon="trash" variant="bare" onPress={() => void remove(a)} accessibilityLabel={`Delete ${activityName(a)}, ${a.minutes} min`} /> : null}
        </View>
      ))}
    </View>
  );
}
