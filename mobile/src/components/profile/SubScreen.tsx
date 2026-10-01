/* Frame for screens opened from Profile: back, a title, scrolling content
   and an optional sticky action bar. Plus the shared loading, empty and
   error states and the list row used across these screens. */

import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { C, FONT, R, screen, T } from '../../design';
import { Button, IconButton } from '../Button';
import { Icon } from '../Icon';
import { AnyIcon, type AnyIconName } from './icons';

export function goBack(fallback = '/(tabs)/profile') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}

export function SubScreen({
  title,
  subtitle,
  children,
  footer,
  onBack,
  scroll = true,
  right,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onBack?: () => void;
  scroll?: boolean;
  right?: React.ReactNode;
}) {
  const body = (
    <View style={{ gap: 24 }}>
      {subtitle ? <Text style={[T.body, { color: C.muted }]}>{subtitle}</Text> : null}
      {children}
    </View>
  );
  return (
    <SafeAreaView style={screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 4, minHeight: 56 }}>
            <IconButton icon="chevronLeft" variant="bare" onPress={onBack ?? (() => goBack())} accessibilityLabel="Back" />
            <Text style={[T.h2, { flex: 1 }]} accessibilityRole="header" numberOfLines={2}>
              {title}
            </Text>
            {right}
          </View>
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 }}>
              {body}
            </ScrollView>
          ) : (
            <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12 }}>{body}</View>
          )}
          {footer ? (
            <View style={{ paddingHorizontal: 20, paddingVertical: 12, gap: 8, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg }}>{footer}</View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12 }} accessibilityLabel={label} accessibilityLiveRegion="polite">
      <ActivityIndicator color={C.green} />
      <Text style={T.meta}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry, retrying }: { message: string; onRetry: () => void; retrying?: boolean }) {
  return (
    <View style={{ paddingVertical: 32, gap: 16 }} accessibilityLiveRegion="polite">
      <Text style={[T.body, { color: C.stone }]}>{message}</Text>
      <Button label={retrying ? 'Trying again' : 'Try again'} variant="secondary" icon="refresh" onPress={onRetry} busy={retrying} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: AnyIconName; title: string; body: string; action?: React.ReactNode }) {
  return (
    <View style={{ paddingVertical: 32, gap: 16, alignItems: 'flex-start' }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
        <AnyIcon name={icon} size={26} />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={T.h3}>{title}</Text>
        <Text style={[T.body, { color: C.muted }]}>{body}</Text>
      </View>
      {action}
    </View>
  );
}

/** A list row: optional icon tile, title, detail, and a chevron or a value. */
export function Row({
  title,
  detail,
  value,
  icon,
  onPress,
  badge,
  accessibilityLabel,
}: {
  title: string;
  detail?: string;
  value?: string;
  icon?: AnyIconName;
  onPress?: () => void;
  badge?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? [title, value, detail, badge].filter(Boolean).join('. ')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        minHeight: 56,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: pressed ? C.raised : C.card,
      })}
    >
      {icon ? (
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
          <AnyIcon name={icon} size={20} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 16, lineHeight: 22, color: C.text }}>{title}</Text>
        {detail ? (
          <Text style={T.meta} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill, backgroundColor: C.green }}>
          <Text style={{ fontFamily: FONT.bodySemi, fontSize: 12, color: C.onGreen }}>{badge}</Text>
        </View>
      ) : null}
      {value ? (
        <Text style={[T.meta, { maxWidth: '45%', textAlign: 'right' }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress ? <Icon name="chevronRight" size={18} color={C.faint} /> : null}
    </Pressable>
  );
}

/** Rows grouped on one Carbon surface with hairlines between them. */
export function RowGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: 10 }}>
      {title ? <Text style={{ fontFamily: FONT.displaySemi, fontSize: 17, color: C.text }}>{title}</Text> : null}
      <View style={{ borderRadius: R.card, overflow: 'hidden', backgroundColor: C.card }}>
        {items.map((child, i) => (
          <View key={i} style={i ? { borderTopWidth: 1, borderTopColor: C.line } : undefined}>
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}
