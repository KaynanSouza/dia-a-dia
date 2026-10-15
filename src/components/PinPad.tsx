import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';
import { Icon } from './Icon';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'] as const;

/** Bolinhas do PIN; `errorKey` muda → tremida (erro). */
export function PinDots({ length, filled, errorKey }: { length: number; filled: number; errorKey?: number }) {
  const t = useTheme();
  const s = useStyles();
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!errorKey) return;
    shake.setValue(0);
    Animated.sequence(
      [12, -12, 9, -9, 5, -5, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 45, useNativeDriver: true })),
    ).start();
  }, [errorKey, shake]);

  return (
    <Animated.View style={[s.dots, { transform: [{ translateX: shake }] }]} accessibilityLabel={`${filled} de ${length} dígitos`}>
      {Array.from({ length }, (_, i) => (
        <View key={i} style={[s.dot, i < filled && { backgroundColor: t.primary, borderColor: t.primary, transform: [{ scale: 1.1 }] }]} />
      ))}
    </Animated.View>
  );
}

/**
 * Teclado numérico próprio: não usa o teclado do sistema (sem sugestões, sem aprendizado do
 * teclado de terceiros, sem histórico). Dígitos nunca vão para um TextInput.
 */
export function PinPad({
  value,
  onChange,
  length = 6,
  disabled,
  onBiometric,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  disabled?: boolean;
  onBiometric?: () => void;
}) {
  const t = useTheme();
  const s = useStyles();

  const press = (k: (typeof KEYS)[number]) => {
    if (disabled) return;
    if (k === 'del') onChange(value.slice(0, -1));
    else if (k === 'bio') onBiometric?.();
    else if (value.length < length) onChange(value + k);
  };

  return (
    <View style={s.pad}>
      {KEYS.map((k) => {
        if (k === 'bio' && !onBiometric) return <View key={k} style={s.key} />;
        return (
          <Pressable
            key={k}
            onPress={() => press(k)}
            onLongPress={k === 'del' ? () => onChange('') : undefined}
            disabled={disabled}
            style={({ pressed }) => [s.key, k.length === 1 && s.digitKey, pressed && { backgroundColor: t.primarySoft }, disabled && { opacity: 0.4 }]}
            accessibilityRole="button"
            accessibilityLabel={k === 'del' ? 'Apagar' : k === 'bio' ? 'Usar biometria' : k}
          >
            {k === 'del' ? (
              <Icon name="backspace" size={26} color={t.text} />
            ) : k === 'bio' ? (
              <Icon name="biometric" size={30} color={t.primary} />
            ) : (
              <Text style={s.digit}>{k}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    dots: { flexDirection: 'row', gap: 16, justifyContent: 'center', paddingVertical: 8 },
    dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: t.faint },
    pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14, width: '100%', maxWidth: 320, alignSelf: 'center' },
    key: { width: '30%', aspectRatio: 1.35, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    digitKey: { backgroundColor: t.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
    digit: { fontSize: 28, fontWeight: '500', color: t.text, fontVariant: ['tabular-nums'] },
  }),
);
