import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading } from '@/components/ui';
import { peekDatabase } from '@/db/client';
import { startLogger } from '@/logging/logger';
import { initNotificationHandler } from '@/notifications/native';
import { AppLockProvider, useAppLock } from '@/security/lock/AppLockProvider';
import { PrivacyShield } from '@/security/privacy/PrivacyShield';

startLogger(peekDatabase);
initNotificationHandler();

function Gate() {
  const { status } = useAppLock();
  if (status === 'booting') return <Loading />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={status !== 'unlocked'}>
        <Stack.Screen name="(lock)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'unlocked'}>
        {/* (app) desmonta ao travar → DatabaseProvider fecha a conexão e tira a chave da memória */}
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PrivacyShield>
        <AppLockProvider>
          <Gate />
          <StatusBar style="auto" />
        </AppLockProvider>
      </PrivacyShield>
    </SafeAreaProvider>
  );
}
