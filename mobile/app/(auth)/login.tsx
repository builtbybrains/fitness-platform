/* Sign in. */

import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { C, screen, sectionLabel } from '../../src/design';
import { useAuth } from '../../src/auth';

export default function LoginScreen() {
  const { signIn, continueOffline } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setErr(null);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) setErr(error);
  }

  return (
    <SafeAreaView style={screen} edges={['top', 'bottom']}>
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 18 }}>
        <View style={{ gap: 6 }}>
          <Text style={{ color: C.mint, fontSize: 34, fontWeight: '900', letterSpacing: 8 }}>VITAL</Text>
          <Text style={{ color: C.muted, fontSize: 14 }}>AI diet & personal training, in your pocket.</Text>
        </View>

        <View style={{ gap: 10 }}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={C.muted}
            style={{ color: C.text, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15 }}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor={C.muted}
            style={{ color: C.text, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15 }}
          />
          {err ? <Text style={{ color: C.danger, fontSize: 13 }}>{err}</Text> : null}
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
            {busy ? 'Signing in…' : 'Sign in'}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.push('/(auth)/register')}>
          <Text style={{ color: C.muted, textAlign: 'center', fontSize: 14 }}>
            No account? <Text style={{ color: C.mint, fontWeight: '700' }}>Create one</Text>
          </Text>
        </Pressable>

        <Pressable
          onPress={() => void continueOffline()}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ color: C.muted, textAlign: 'center', fontSize: 13 }}>
            Continue without an account — data stays on this device
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
