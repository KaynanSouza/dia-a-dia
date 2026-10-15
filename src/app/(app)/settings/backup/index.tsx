import { router } from 'expo-router';
import { Switch } from 'react-native';

import { Card, Group, IconBadge, ListItem, Muted, Screen, Title } from '@/components/ui';
import { useDb, useDbQuery } from '@/db/DatabaseProvider';
import { getSetting, setSetting } from '@/db/repositories/settings.repo';
import { ensureNotificationPermission, scheduleBackupReminder } from '@/notifications/backup-reminder';
import { useTheme } from '@/theme';

export default function Backup() {
  const t = useTheme();
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
      <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
        <IconBadge name={data?.lastAt ? 'checkCircle' : 'backup'} color={data?.lastAt ? t.success : t.warning} size={60} />
        <Title>{data?.lastAt ? 'Último backup' : 'Nenhum backup ainda'}</Title>
        <Muted center>
          {data?.lastAt
            ? new Date(data.lastAt).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })
            : 'Se o celular for perdido ou o app reinstalado, só um backup recupera seus dados.'}
        </Muted>
      </Card>
      <Group footer="Arquivo único protegido por uma senha sua (Argon2id + AES-256-GCM). Guarde-o fora do aparelho, como no seu drive ou e-mail.">
        <ListItem icon="backup" title="Fazer backup agora" onPress={() => router.push('/settings/backup/export')} />
        <ListItem icon="restore" iconColor="#0EA5E9" title="Restaurar de um arquivo" onPress={() => router.push('/settings/backup/restore')} />
        <ListItem
          icon="bell"
          iconColor="#F59E0B"
          title="Lembrete mensal"
          subtitle="Notificação no dia 1º de cada mês"
          right={<Switch value={data?.reminder ?? true} onValueChange={toggleReminder} trackColor={{ true: t.primary }} />}
        />
      </Group>
    </Screen>
  );
}
