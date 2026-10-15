import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

/**
 * Android: FLAG_SECURE (bloqueia screenshot/gravação e deixa a miniatura de "recentes" em branco).
 * iOS: blur no app switcher. Ambos: cobertura opaca quando o app não está ativo.
 */
export function PrivacyShield({ children }: { children: ReactNode }) {
  const [covered, setCovered] = useState(AppState.currentState !== 'active');

  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync('global').catch(() => {});
    if (Platform.OS === 'ios') ScreenCapture.enableAppSwitcherProtectionAsync(0.95).catch(() => {});
    const sub = AppState.addEventListener('change', (s) => setCovered(s !== 'active'));
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.fill}>
      {children}
      {covered && <View style={[StyleSheet.absoluteFill, styles.cover]} pointerEvents="none" />}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 }, cover: { backgroundColor: '#0B0B0F' } });
