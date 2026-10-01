/* Bottom sheet: slides up from the thumb zone over a dimmed screen. Tap
   outside or the close button to dismiss. Slides in 280ms (ease-out quart);
   with Reduce Motion it just appears. Content scrolls when it is tall. */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, R, T } from '../../design';
import { IconButton } from '../Button';
import { useReduceMotion } from '../motion';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Pinned under the scrolling content (primary action). */
  footer?: React.ReactNode;
};

export function Sheet({ visible, onClose, title, subtitle, children, footer }: Props) {
  const reduce = useReduceMotion();
  const inset = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const t = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    if (reduce) {
      t.setValue(visible ? 1 : 0);
      if (!visible) setMounted(false);
      return;
    }
    Animated.timing(t, {
      toValue: visible ? 1 : 0,
      duration: visible ? 280 : 180,
      easing: visible ? Easing.out(Easing.poly(4)) : Easing.in(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, reduce, t]);

  if (!mounted) return null;
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [Math.min(480, height * 0.6), 0] });

  return (
    <Modal transparent visible={mounted} onRequestClose={onClose} animationType="none" statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.72)', opacity: t }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={{
            maxHeight: height * 0.88,
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
            backgroundColor: C.card,
            borderTopLeftRadius: R.card + 8,
            borderTopRightRadius: R.card + 8,
            paddingBottom: inset.bottom,
            transform: [{ translateY }],
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: 10 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.pressed }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
            <View style={{ flex: 1, gap: 4, paddingTop: 6 }}>
              <Text style={T.h2} accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? <Text style={T.meta}>{subtitle}</Text> : null}
            </View>
            <IconButton icon="close" variant="bare" onPress={onClose} accessibilityLabel="Close" />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: footer ? 12 : 24, gap: 12 }}>
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, borderTopWidth: 1, borderTopColor: C.line }}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
