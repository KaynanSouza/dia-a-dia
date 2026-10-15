import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { ProgressBar } from '@/components/charts';
import { Button, Card, EmptyState, ErrorText, IconBadge, Muted, Notice, Screen, Steps, Title } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { IMPORT_ERROR_MESSAGE, type ImportError } from '@/import/limits';
import { importProgress, useImportProgress } from '@/import/progress-store';
import { IMPORT_STEPS } from '@/import/steps';
import { useTheme } from '@/theme';

const STAGE = { committing: 'Gravando transações', matching_transfers: 'Identificando transferências entre suas contas' } as const;

/** Passo 4/4: gravação atômica. Pode sair da tela; avisamos por notificação se o app estiver em segundo plano. */
export default function Progress() {
  const t = useTheme();
  const { bump } = useDb();
  const p = useImportProgress();

  const finish = (to: '/home' | '/transactions' | '/import') => {
    importProgress.reset();
    bump();
    router.replace(to);
  };

  if (p.phase === 'done' && p.result) {
    const r = p.result;
    return (
      <Screen>
        <Steps current={4} labels={IMPORT_STEPS} />
        <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 12 }}>
          <IconBadge name="checkCircle" color={t.success} size={72} />
          <Title>Importação concluída</Title>
          <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
            <Stat value={r.imported} label="novas" />
            <Stat value={r.categorized} label="categorizadas" />
            <Stat value={r.duplicates} label="duplicadas" />
          </View>
          {r.transfers ? <Muted center>{r.transfers} transferência(s) entre suas contas identificadas.</Muted> : null}
          {r.billsLinked ? <Muted center>{r.billsLinked} conta(s) a pagar marcada(s) como paga(s) automaticamente.</Muted> : null}
        </Card>
        <Notice tone="info">Você pode desfazer esta importação inteira em até 30 dias na aba Importar.</Notice>
        <Button title="Ver painel" icon="home" onPress={() => finish('/home')} />
        <Button title="Revisar transações" variant="secondary" onPress={() => finish('/transactions')} />
      </Screen>
    );
  }

  if (p.phase === 'failed') {
    return (
      <Screen>
        <Steps current={4} labels={IMPORT_STEPS} />
        <EmptyState icon="error" title="A importação falhou" text="Nada foi gravado: a importação é tudo ou nada." />
        <ErrorText>{IMPORT_ERROR_MESSAGE[p.errorCode as ImportError['code']] ?? 'Erro inesperado.'}</ErrorText>
        {!!p.errorDetail && <Muted>Detalhe: {p.errorDetail}</Muted>}
        <Button title="Voltar" onPress={() => finish('/import')} />
      </Screen>
    );
  }

  const label = p.stage && p.stage in STAGE ? STAGE[p.stage as keyof typeof STAGE] : 'Preparando';
  return (
    <Screen>
      <Steps current={4} labels={IMPORT_STEPS} />
      <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 14 }}>
        <IconBadge name="import" size={64} />
        <Title>Importando…</Title>
        <View style={{ alignSelf: 'stretch' }}>
          <ProgressBar ratio={p.ratio} label={`${label}${p.rows ? ` · ${p.rows}` : ''}`} />
        </View>
        <Muted center>Pode sair desta tela. Se o app for para segundo plano, avisamos quando terminar.</Muted>
      </Card>
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.surfaceAlt, borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
      <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: t.muted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
