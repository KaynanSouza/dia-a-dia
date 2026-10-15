import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Text } from 'react-native';

import { Button, Group, ListItem, Screen, ScreenHeader } from '@/components/ui';
import { DB_ENCRYPTED } from '@/lib/runtime';
import { useAppLock } from '@/security/lock/AppLockProvider';
import { useTheme } from '@/theme';

export default function Settings() {
  const t = useTheme();
  const { lock } = useAppLock();
  return (
    <Screen edges={['top']}>
      <ScreenHeader title="Ajustes" />

      <Group title="Segurança e privacidade">
        <ListItem icon="shield" title="Segurança" subtitle="PIN, biometria e bloqueio automático" onPress={() => router.push('/settings/security')} />
        <ListItem icon="backup" iconColor="#0EA5E9" title="Backup" subtitle="Cópia criptografada e restauração" onPress={() => router.push('/settings/backup')} />
      </Group>

      <Group title="Contas a pagar">
        <ListItem icon="bell" iconColor="#F59E0B" title="Lembretes e alertas" subtitle="Antecedência, silêncio, privacidade e diagnóstico" onPress={() => router.push('/settings/alerts')} />
        <ListItem icon="bills" iconColor="#EC4899" title="Nova conta a pagar" onPress={() => router.push('/bills/new')} />
      </Group>

      <Group title="Organização">
        <ListItem icon="tag" iconColor="#F97316" title="Categorias" subtitle="Categorias e subcategorias" onPress={() => router.push('/settings/categories')} />
        <ListItem icon="bank" iconColor="#10B981" title="Nova conta bancária" subtitle="Conta corrente, cartão ou carteira" onPress={() => router.push('/accounts/new')} />
      </Group>

      <Group title="Seus dados">
        <ListItem icon="share" iconColor="#6366F1" title="Exportar meus dados" subtitle="Arquivos JSON e CSV" onPress={() => router.push('/settings/data/export')} />
        <ListItem icon="pulse" iconColor="#64748B" title="Diagnóstico" subtitle="Log local, sem dados financeiros" onPress={() => router.push('/settings/diagnostics')} />
        <ListItem icon="trash" destructive title="Apagar todos os dados" onPress={() => router.push('/settings/data/wipe')} />
      </Group>

      <Button title="Travar agora" icon="lock" variant="secondary" onPress={lock} />
      <Text style={{ color: t.faint, fontSize: 12, textAlign: 'center' }}>
        Dia a Dia {Constants.expoConfig?.version ?? ''} · {DB_ENCRYPTED ? 'dados criptografados neste aparelho' : 'modo de teste'}
      </Text>
    </Screen>
  );
}
