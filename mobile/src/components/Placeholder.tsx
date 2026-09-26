/* Placeholder screens for the tabs that come after Today is verified. */

import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { C, card as cardStyle, screen, sectionLabel, title } from '../../src/design';

export function Placeholder({ label }: { label: string }) {
  return (
    <SafeAreaView style={screen} edges={['top']}>
      <View style={{ padding: 20, gap: 14 }}>
        <Text style={sectionLabel}>VITAL</Text>
        <Text style={title}>{label}</Text>
        <View style={cardStyle}>
          <Text style={{ color: C.muted, fontSize: 14, lineHeight: 21 }}>
            Arriving in the next step. Today is being verified first — one layer
            at a time, each proven on the phone before the next is added.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
