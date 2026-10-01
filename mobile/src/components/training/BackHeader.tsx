/* The one header for every screen opened on top of the tabs: a chevron row
   (back, plus an optional control on the right), then the title in T.h1
   and an optional line under it. Back falls back to `fallback` when there
   is no history (a deep link, or a refresh on the web). */

import React from 'react';
import { Text, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { T } from '../../design';
import { IconButton } from '../Button';

export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

export function BackHeader({
  title,
  subtitle,
  fallback,
  onBack,
  backLabel = 'Back',
  right,
}: {
  title: string;
  subtitle?: string;
  /** Where back goes when there is no history. */
  fallback?: Href;
  /** Replaces the default back behaviour. */
  onBack?: () => void;
  backLabel?: string;
  /** A control on the chevron row, right aligned. */
  right?: React.ReactNode;
}) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginLeft: -6, minHeight: 48 }}>
        <IconButton icon="chevronLeft" variant="bare" onPress={onBack ?? (() => goBack(fallback ?? '/(tabs)'))} accessibilityLabel={backLabel} />
        {right}
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
