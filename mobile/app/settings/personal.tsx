import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, FadeIn, Header, Input, Screen } from '@/components';
import { useStore } from '@/state/store';
import { gap, spacing } from '@/theme';

export default function Personal() {
  const profile = useStore((s) => s.profile);
  const update = useStore((s) => s.updateProfile);

  const [first, setFirst] = useState(profile.firstName);
  const [last, setLast] = useState(profile.lastName);
  const [email, setEmail] = useState(profile.email);
  const [age, setAge] = useState(String(profile.age));
  const [height, setHeight] = useState(String(profile.heightCm));

  const save = () => {
    update({
      firstName: first.trim() || profile.firstName,
      lastName: last.trim(),
      email: email.trim(),
      age: Number(age) || profile.age,
      heightCm: Number(height) || profile.heightCm,
    });
    router.back();
  };

  return (
    <Screen keyboardAware contentStyle={styles.content}>
      <Header title="Profile information" back />
      <FadeIn style={styles.form}>
        <View style={styles.row}>
          <View style={styles.half}>
            <Input label="First name" value={first} onChangeText={setFirst} autoComplete="given-name" />
          </View>
          <View style={styles.half}>
            <Input label="Last name" value={last} onChangeText={setLast} autoComplete="family-name" />
          </View>
        </View>
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <View style={styles.row}>
          <View style={styles.half}>
            <Input label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={3} />
          </View>
          <View style={styles.half}>
            <Input label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="number-pad" maxLength={3} />
          </View>
        </View>
        <Button label="Save changes" onPress={save} />
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: gap.md },
  form: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
});
