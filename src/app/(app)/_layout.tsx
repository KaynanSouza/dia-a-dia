import { router, Stack } from 'expo-router';
import { useEffect } from 'react';

import { wipeAllData } from '@/data-rights/wipe';
import { DatabaseProvider, useDb } from '@/db/DatabaseProvider';
import { takePendingRoute } from '@/services/notifications/actions';
import { useAppLock } from '@/security/lock/AppLockProvider';
import { useTheme } from '@/theme';

export default function AppLayout() {
  const { resetAfterWipe } = useAppLock();
  const t = useTheme();
  return (
    <DatabaseProvider onKeyLost={() => wipeAllData().then(resetAfterWipe)}>
      <Stack
        screenOptions={{
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.primary,
          headerTitleStyle: { color: t.text, fontWeight: '700' },
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="accounts/new" options={{ title: 'Nova conta', presentation: 'modal' }} />
        <Stack.Screen name="transactions/[id]" options={{ title: 'Transação' }} />
        <Stack.Screen name="transactions/manual" options={{ title: 'Lançamento', presentation: 'modal' }} />
        <Stack.Screen name="bills/new" options={{ title: 'Conta a pagar', presentation: 'modal' }} />
        <Stack.Screen name="bills/[id]" options={{ title: 'Conta' }} />
        <Stack.Screen name="settings/alerts" options={{ title: 'Lembretes e alertas' }} />
        <Stack.Screen name="import/upload" options={{ title: 'Importar extrato' }} />
        <Stack.Screen name="import/mapping" options={{ title: 'Importar extrato' }} />
        <Stack.Screen name="import/preview" options={{ title: 'Importar extrato' }} />
        <Stack.Screen name="import/progress" options={{ title: 'Importar extrato', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="settings/categories" options={{ title: 'Categorias' }} />
        <Stack.Screen name="settings/security" options={{ title: 'Segurança' }} />
        <Stack.Screen name="settings/backup/index" options={{ title: 'Backup' }} />
        <Stack.Screen name="settings/backup/export" options={{ title: 'Fazer backup' }} />
        <Stack.Screen name="settings/backup/restore" options={{ title: 'Restaurar backup' }} />
        <Stack.Screen name="settings/data/export" options={{ title: 'Exportar meus dados' }} />
        <Stack.Screen name="settings/data/wipe" options={{ title: 'Apagar todos os dados' }} />
        <Stack.Screen name="settings/diagnostics" options={{ title: 'Diagnóstico' }} />
      </Stack>
      <PendingRoute />
    </DatabaseProvider>
  );
}

/** Toque numa notificação com o app travado: abre a tela pedida depois do desbloqueio. */
function PendingRoute() {
  useDb();
  useEffect(() => {
    const route = takePendingRoute();
    if (route) setTimeout(() => router.push(route as never), 50);
  }, []);
  return null;
}
