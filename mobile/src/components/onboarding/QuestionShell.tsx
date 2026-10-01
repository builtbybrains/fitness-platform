/* One questionnaire screen: back and progress on top, the question, and a
   sticky action bar in the thumb zone. Also used for check-in steps. */

import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { C, screen, T } from '../../design';
import { ProgressBar, Notice } from '../Bits';
import { Button, IconButton, LinkButton } from '../Button';

export type ShellProps = {
  title: string;
  helper?: string;
  /** 0..1, or omit to hide the bar. */
  progress?: number;
  /** "4 of 21" next to the bar. */
  progressLabel?: string;
  onBack?: () => void;
  backLabel?: string;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  busy?: boolean;
  error?: string | null;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Anything above the title (an icon, a mark). */
  lead?: React.ReactNode;
  children?: React.ReactNode;
  /** Hide the action bar (a screen with its own actions). */
  noActions?: boolean;
};

export function QuestionShell({
  title,
  helper,
  progress,
  progressLabel,
  onBack,
  backLabel = 'Back',
  primaryLabel,
  onPrimary,
  primaryDisabled,
  busy,
  error,
  secondaryLabel,
  onSecondary,
  lead,
  children,
  noActions,
}: ShellProps) {
  return (
    <SafeAreaView style={screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingTop: 4, minHeight: 52 }}>
            {onBack ? <IconButton icon="chevronLeft" variant="bare" onPress={onBack} accessibilityLabel={backLabel} /> : <View style={{ width: 8 }} />}
            {progress != null ? (
              <View
                style={{ flex: 1 }}
                accessibilityRole="progressbar"
                accessibilityLabel="Questionnaire progress"
                accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
              >
                <ProgressBar value={progress} />
              </View>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            {progressLabel ? <Text style={[T.small, { minWidth: 44, textAlign: 'right', paddingRight: 8 }]}>{progressLabel}</Text> : null}
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32, gap: 24, flexGrow: 1 }}
          >
            <View style={{ gap: 8 }}>
              {lead ? <View style={{ marginBottom: 12 }}>{lead}</View> : null}
              <Text style={T.h1} accessibilityRole="header">
                {title}
              </Text>
              {helper ? <Text style={[T.body, { color: C.muted }]}>{helper}</Text> : null}
            </View>
            {children}
          </ScrollView>

          {noActions ? null : (
            <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 8, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg }}>
              {error ? <Notice tone="error">{error}</Notice> : null}
              <Button label={primaryLabel} onPress={onPrimary} disabled={primaryDisabled} busy={busy} />
              {secondaryLabel && onSecondary ? (
                <LinkButton onPress={onSecondary} accessibilityLabel={secondaryLabel}>
                  {secondaryLabel}
                </LinkButton>
              ) : null}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
