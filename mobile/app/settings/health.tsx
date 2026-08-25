import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Chip, FadeIn, Header, Input, Screen, Txt } from '@/components';
import { useStore } from '@/state/store';
import { colors, gap, spacing } from '@/theme';

const CONDITIONS = ['Diabetes', 'High blood pressure', 'High cholesterol', 'Thyroid', 'PCOS', 'Asthma', 'Heart condition'];
const INJURIES = ['Lower back', 'Knee', 'Shoulder', 'Wrist', 'Neck', 'Ankle', 'Hip'];
const ALLERGIES = ['Nuts', 'Dairy', 'Gluten', 'Shellfish', 'Eggs', 'Soy'];

export default function Health() {
  const medical = useStore((s) => s.medical);
  const setMedical = useStore((s) => s.setMedical);

  const [conditions, setConditions] = useState(medical.conditions);
  const [injuries, setInjuries] = useState(medical.injuries);
  const [allergies, setAllergies] = useState(medical.allergies);
  const [medications, setMedications] = useState(medical.medications);
  const [notes, setNotes] = useState(medical.notes);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const save = () => {
    setMedical({ conditions, injuries, allergies, medications: medications.trim(), notes: notes.trim(), completed: true });
    router.back();
  };

  return (
    <Screen keyboardAware contentStyle={styles.content}>
      <Header title="Health" subtitle="Every plan is built around this." back />

      <FadeIn>
        <Card accent>
          <Txt variant="small" color={colors.textSoft}>
            Injuries change which exercises I pick, allergies change every meal, and
            conditions change how hard I push you. This stays on your device.
          </Txt>
        </Card>
      </FadeIn>

      <FadeIn delay={60} style={styles.section}>
        <Txt variant="h3">Medical conditions</Txt>
        <View style={styles.chips}>
          {CONDITIONS.map((c) => (
            <Chip key={c} label={c} selected={conditions.includes(c)} onPress={() => toggle(conditions, setConditions, c)} />
          ))}
        </View>
      </FadeIn>

      <FadeIn delay={110} style={styles.section}>
        <Txt variant="h3">Injuries to work around</Txt>
        <View style={styles.chips}>
          {INJURIES.map((c) => (
            <Chip key={c} label={c} selected={injuries.includes(c)} onPress={() => toggle(injuries, setInjuries, c)} />
          ))}
        </View>
      </FadeIn>

      <FadeIn delay={160} style={styles.section}>
        <Txt variant="h3">Food allergies</Txt>
        <View style={styles.chips}>
          {ALLERGIES.map((c) => (
            <Chip key={c} label={c} selected={allergies.includes(c)} onPress={() => toggle(allergies, setAllergies, c)} />
          ))}
        </View>
      </FadeIn>

      <FadeIn delay={210} style={styles.section}>
        <Input label="Medication" value={medications} onChangeText={setMedications} placeholder="Optional" />
        <Input
          label="Anything else I should know"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          multiline
          style={styles.notes}
        />
      </FadeIn>

      <Txt variant="caption" color={colors.faint}>
        VITAL is a wellness product, not a medical service. Speak to your doctor before
        starting a new diet or training programme, particularly with an existing condition.
      </Txt>

      <Button label="Save" onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: gap.md, paddingTop: spacing.md },
  section: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  notes: { minHeight: 90, textAlignVertical: 'top' },
});
