/* Create account. The name travels as signup metadata; a server trigger
   turns it into the profile row. */

import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { C, screen } from '../../src/design';
import { useAuth } from '../../src/auth';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (password !== confirm) {
      setErr('Passwords do not match');
      return;
    }
    setBusy(true);
    setErr(null);
    setInfo(null);
    const { error } = await signUp(email.trim(), password, name.trim());
    setBusy(false);
    if (error?.startsWith('CONFIRM_EMAIL:')) {
      setInfo(error.slice('CONFIRM_EMAIL:'.length));
      return;
    }
    if (error) setErr(error);
  }

  const field = {
    color: C.text,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
  } as const;

  return (
    <SafeAreaView style={screen} edges={['top', 'bottom']}>
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 18 }}>
        <View style={{ gap: 6 }}>
          <Text style={{ color: C.mint, fontSize: 34, fontWeight: '900', letterSpacing: 8 }}>VITAL</Text>
          <Text style={{ color: C.muted, fontSize: 14 }}>Start your streak today.</Text>
        </View>

        <View style={{ gap: 10 }}>
          <TextInput value={name} onChangeText={setName} placeholder="First name" placeholderTextColor={C.muted} style={field} />
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={C.muted} style={field} />
          <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Password (min 8 characters)" placeholderTextColor={C.muted} style={field} />
          <TextInput value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Confirm password" placeholderTextColor={C.muted} style={field} />
          {err ? <Text style={{ color: C.danger, fontSize: 13 }}>{err}</Text> : null}
          {info ? <Text style={{ color: C.mint, fontSize: 13 }}>{info}</Text> : null}
        </View>

        <Pressable
          onPress={submit}
          disabled={busy}
          style={({ pressed }) => ({
            backgroundColor: busy || pressed ? 'rgba(92,224,184,0.8)' : C.mint,
            borderRadius: 14,
            paddingVertical: 15,
            alignItems: 'center',
          })}
        >
          <Text style={{ color: '#04120C', fontWeight: '800', fontSize: 16 }}>
            {busy ? 'Creating account…' : 'Create account'}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.back()}>
          <Text style={{ color: C.muted, textAlign: 'center', fontSize: 14 }}>
            Already have an account? <Text style={{ color: C.mint, fontWeight: '700' }}>Sign in</Text>
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}