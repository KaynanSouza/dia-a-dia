import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TestModeBanner } from '@/components/TestModeBanner';
import { Loading } from '@/components/ui';
import { peekDatabase } from '@/db/client';
import { startLogger } from '@/logging/logger';
import { initNotificationHandler } from '@/notifications/native';
import { AppLockProvider, useAppLock } from '@/security/lock/AppLockProvider';
import { PrivacyShield } from '@/security/privacy/PrivacyShield';
import { useTheme } from '@/theme';

startLogger(peekDatabase);
initNotificationHandler();

function Gate() {
  const { status } = useAppLock();
  const t = useTheme();
  if (status === 'booting') return <Loading />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
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
  const t = useTheme();
  const base = t.dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: t.primary, background: t.bg, card: t.surface, text: t.text, border: t.border },
  };
  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <PrivacyShield>
          <AppLockProvider>
            <TestModeBanner />
            <View style={{ flex: 1, backgroundColor: t.bg }}>
              <Gate />
            </View>
            <StatusBar style={t.dark ? 'light' : 'dark'} />
          </AppLockProvider>
        </PrivacyShield>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
