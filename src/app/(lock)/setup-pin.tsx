import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { PinDots, PinPad } from '@/components/PinPad';
import { Button, Notice } from '@/components/ui';
import { useAppLock } from '@/security/lock/AppLockProvider';
import { validatePin } from '@/security/pin/pin-hash';
import { useTheme } from '@/theme';

type Step = 'create' | 'confirm' | 'biometric';

/** F-01: primeira abertura. Sem e-mail, senha ou conta. */
export default function SetupPin() {
  const t = useTheme();
  const lock = useAppLock();
  const [step, setStep] = useState<Step>('create');
  const [pin, setPin] = useState('');
  const [entry, setEntry] = useState('');
  const [error, setError] = useState<string>();
  const [shake, setShake] = useState(0);

  const fail = (msg: string) => {
    setError(msg);
    setShake((n) => n + 1);
    setEntry('');
  };

  const finish = async (bio: boolean) => {
    if (await lock.setupPin(pin, bio)) router.replace('/');
  };

  useEffect(() => {
    if (entry.length !== 6) return;
    if (step === 'create') {
      const v = validatePin(entry);
      if (v === 'format') return fail('O PIN deve ter 6 dígitos.');
      if (v === 'weak') return fail('PIN muito fácil. Evite sequências e números repetidos.');
      setPin(entry);
      setEntry('');
      setError(undefined);
      setStep('confirm');
    } else if (step === 'confirm') {
      if (entry !== pin) {
        setPin('');
        setStep('create');
        return fail('Os PINs não conferem. Crie novamente.');
      }
      setEntry('');
      setError(undefined);
      if (lock.biometricAvailable) setStep('biometric');
      else void finish(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);

  if (lock.status !== 'setup') return <Redirect href="/" />;

  if (step === 'biometric') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
        <View style={styles.top}>
          <BrandMark icon="biometric" title="Usar biometria?" subtitle="Desbloqueie com digital ou rosto. O PIN continua funcionando como alternativa." />
        </View>
        <View style={{ gap: 10 }}>
          <Button title="Ativar biometria" icon="biometric" onPress={() => finish(true)} loading={lock.busy} />
          <Button title="Agora não" variant="ghost" onPress={() => finish(false)} disabled={lock.busy} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <View style={styles.top}>
        <BrandMark
          icon="shield"
          title={step === 'create' ? 'Proteja suas finanças' : 'Confirme o PIN'}
          subtitle={step === 'create' ? 'Tudo fica só neste aparelho, criptografado. Crie um PIN de 6 dígitos.' : 'Digite o mesmo PIN mais uma vez.'}
        />
        <PinDots length={6} filled={entry.length} errorKey={shake} />
        <Text style={[styles.message, { color: t.danger }]}>{error ?? ' '}</Text>
        {step === 'create' && (
          <Notice tone="info">Sem o PIN e sem backup não há como recuperar os dados: não existe conta nem servidor.</Notice>
        )}
      </View>
      <PinPad value={entry} onChange={setEntry} disabled={lock.busy} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 24, paddingBottom: 24, justifyContent: 'space-between' },
  top: { flex: 1, justifyContent: 'center', gap: 18 },
  message: { textAlign: 'center', fontSize: 14, fontWeight: '600', minHeight: 20 },
});
