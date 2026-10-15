import { Stack } from 'expo-router';

import { wipeAllData } from '@/data-rights/wipe';
import { DatabaseProvider } from '@/db/DatabaseProvider';
import { useAppLock } from '@/security/lock/AppLockProvider';

export default function AppLayout() {
  const { resetAfterWipe } = useAppLock();
  return (
    <DatabaseProvider onKeyLost={() => wipeAllData().then(resetAfterWipe)}>
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="accounts/new" options={{ title: 'Nova conta', presentation: 'modal' }} />
        <Stack.Screen name="import/review" options={{ title: 'Revisar importação' }} />
        <Stack.Screen name="settings/security" options={{ title: 'Segurança' }} />
        <Stack.Screen name="settings/backup/index" options={{ title: 'Backup' }} />
        <Stack.Screen name="settings/backup/export" options={{ title: 'Fazer backup' }} />
        <Stack.Screen name="settings/backup/restore" options={{ title: 'Restaurar backup' }} />
        <Stack.Screen name="settings/data/export" options={{ title: 'Exportar meus dados' }} />
        <Stack.Screen name="settings/data/wipe" options={{ title: 'Apagar todos os dados' }} />
        <Stack.Screen name="settings/diagnostics" options={{ title: 'Diagnóstico' }} />
      </Stack>
    </DatabaseProvider>
  );
}
