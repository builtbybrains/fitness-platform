import React from 'react';
import { StyleSheet } from 'react-native';
import { FadeIn } from './FadeIn';
import { Header } from './Header';
import { Screen } from './Screen';
import { Txt } from './Txt';
import { colors, gap, spacing } from '@/theme';

export interface LegalSection {
  heading: string;
  body: string;
}

export function LegalPage({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <Screen contentStyle={styles.content}>
      <Header title={title} subtitle={`Last updated ${updated}`} back />
      {sections.map((s, i) => (
        <FadeIn key={s.heading} delay={i * 45} style={styles.section}>
          <Txt variant="h3">{s.heading}</Txt>
          <Txt variant="body" color={colors.textSoft}>
            {s.body}
          </Txt>
        </FadeIn>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: gap.md, paddingTop: spacing.md },
  section: { gap: spacing.xs },
});
