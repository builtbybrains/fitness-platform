/* Header for task screens opened on top of the tabs: back, title, and an
   optional line under it. Back falls back to `fallback` when there is no
   history (a deep link, or a refresh on the web). */

import React from 'react';
import { Text, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { T } from '../../design';
import { IconButton } from '../Button';

export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

export function BackHeader({ title, subtitle, fallback, backLabel = 'Back' }: { title: string; subtitle?: string; fallback: Href; backLabel?: string }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ marginLeft: -6 }}>
        <IconButton icon="chevronLeft" variant="bare" onPress={() => goBack(fallback)} accessibilityLabel={backLabel} />
      </View>
      <View style={{ gap: 4 }}>
        <Text style={T.h1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={T.meta}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}
