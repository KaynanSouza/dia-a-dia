import { router } from 'expo-router';
import { Switch } from 'react-native';

import { ListItem, Muted, Screen } from '@/components/ui';
import { useDb, useDbQuery } from '@/db/DatabaseProvider';
import { getSetting, setSetting } from '@/db/repositories/settings.repo';
import { ensureNotificationPermission, scheduleBackupReminder } from '@/notifications/backup-reminder';

export default function Backup() {
  const { db, bump } = useDb();
  const { data } = useDbQuery(async (d) => ({
    lastAt: await getSetting<number | null>(d, 'backup.last_at', null),
    reminder: await getSetting<boolean>(d, 'backup.reminder_enabled', true),
  }));

  const toggleReminder = async (enabled: boolean) => {
    if (enabled && !(await ensureNotificationPermission())) return;
    await setSetting(db, 'backup.reminder_enabled', enabled);
    await scheduleBackupReminder(db);
    bump();
  };

  return (
    <Screen>
      <Muted>
        {data?.lastAt ? `Último backup: ${new Date(data.lastAt).toLocaleString('pt-BR')}` : 'Você ainda não fez nenhum backup.'}
      </Muted>
      <Muted>
        O backup é um arquivo único protegido por uma senha sua (Argon2id + AES-256-GCM). Guarde-o fora do aparelho, por exemplo no
        seu drive ou e-mail. Sem a senha ele não pode ser aberto.
      </Muted>
      <ListItem title="Fazer backup agora" onPress={() => router.push('/settings/backup/export')} />
      <ListItem title="Restaurar de um arquivo" onPress={() => router.push('/settings/backup/restore')} />
      <ListItem
        title="Lembrete mensal"
        subtitle="Notificação no dia 1º de cada mês"
        right={<Switch value={data?.reminder ?? true} onValueChange={toggleReminder} />}
      />
    </Screen>
  );
}
