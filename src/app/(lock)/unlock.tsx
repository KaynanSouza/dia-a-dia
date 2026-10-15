import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { PinDots, PinPad } from '@/components/PinPad';
import { useAppLock, useLockoutRemaining } from '@/security/lock/AppLockProvider';
import { FREE_ATTEMPTS } from '@/security/lock/lock-store';
import { useTheme } from '@/theme';

const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s` : `${s}s`);

export default function Unlock() {
  const t = useTheme();
  const lock = useAppLock();
  const [pin, setPin] = useState('');
  const remaining = useLockoutRemaining(lock.lockoutUntil);
  const autoPrompted = useRef(false);

  // Biometria automática ao abrir a tela (uma vez)
  useEffect(() => {
    if (lock.status === 'locked' && lock.config.biometricEnabled && !autoPrompted.current) {
      autoPrompted.current = true;
      lock.unlockWithBiometrics();
    }
  }, [lock]);

  // Envia sozinho ao completar 6 dígitos (limpa antes para nunca contar a mesma tentativa duas vezes)
  useEffect(() => {
    if (pin.length === 6 && remaining === 0 && !lock.busy) {
      setPin('');
      lock.unlockWithPin(pin);
    }
  }, [pin, remaining, lock]);

  if (lock.status !== 'locked') return <Redirect href="/" />;

  const left = FREE_ATTEMPTS - lock.failed;
  const message =
    remaining > 0
      ? `Muitas tentativas incorretas. Tente novamente em ${fmt(remaining)}.`
      : lock.error === 'wrong_pin'
        ? `PIN incorreto.${left > 0 && left <= 3 ? ` ${left} tentativa(s) antes do bloqueio temporário.` : ''}`
        : lock.error === 'biometric_failed'
          ? 'Biometria não reconhecida. Use o PIN.'
          : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <View style={styles.top}>
        <BrandMark icon="lock" title="Dia a Dia" subtitle="Digite seu PIN para continuar" />
        <PinDots length={6} filled={pin.length} errorKey={lock.error === 'wrong_pin' ? lock.failed : 0} />
        <Text style={[styles.message, { color: t.danger }]}>{message ?? ' '}</Text>
      </View>
      <PinPad
        value={pin}
        onChange={setPin}
        disabled={remaining > 0 || lock.busy}
        onBiometric={lock.config.biometricEnabled ? () => lock.unlockWithBiometrics() : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 24, paddingBottom: 24, justifyContent: 'space-between' },
  top: { flex: 1, justifyContent: 'center', gap: 20 },
  message: { textAlign: 'center', fontSize: 14, fontWeight: '600', minHeight: 40 },
});
