import { router } from 'expo-router';

import { Button, ListItem, Screen } from '@/components/ui';
import { useAppLock } from '@/security/lock/AppLockProvider';

export default function Settings() {
  const { lock } = useAppLock();
  return (
    <Screen>
      <ListItem title="Segurança" subtitle="PIN, biometria, bloqueio automático" onPress={() => router.push('/settings/security')} />
      <ListItem title="Backup" subtitle="Backup criptografado e restauração" onPress={() => router.push('/settings/backup')} />
      <ListItem title="Exportar meus dados" subtitle="JSON e CSV" onPress={() => router.push('/settings/data/export')} />
      <ListItem title="Diagnóstico" subtitle="Log local sem dados financeiros" onPress={() => router.push('/settings/diagnostics')} />
      <ListItem title="Apagar todos os dados" onPress={() => router.push('/settings/data/wipe')} />
      <Button title="Travar agora" variant="secondary" onPress={lock} />
    </Screen>
  );
}
