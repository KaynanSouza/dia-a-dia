import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { Text, View } from 'react-native';

import { ProgressBar } from '@/components/charts';
import { categoryIcon } from '@/components/Icon';
import { Amount, Badge, Button, Card, EmptyState, ErrorText, Group, IconBadge, ListItem, Muted, Notice, Screen, Steps, Title, formatDate } from '@/components/ui';
import { useDb, useDbQuery } from '@/db/DatabaseProvider';
import { listCategoryTree } from '@/db/repositories/finance.repo';
import { cancelImport, runAnalyze, runCommit } from '@/import/job';
import { IMPORT_ERROR_MESSAGE, type ImportError } from '@/import/limits';
import { importProgress, useImportProgress } from '@/import/progress-store';
import { discardSession, getSession } from '@/import/session';
import { IMPORT_STEPS } from '@/import/steps';
import { ensureNotificationPermission } from '@/notifications/backup-reminder';
import { useTheme } from '@/theme';

const STAGE_LABEL = { reading: 'Lendo arquivo', deduplicating: 'Verificando duplicatas', categorizing: 'Categorizando' } as const;
const SOURCE_LABEL = { user_rule: 'suas regras', dictionary: 'dicionário', fuzzy: 'nome parecido', ml: 'modelo local', none: 'sem categoria' } as const;
const PREVIEW_ROWS = 25;

/** Passo 3/4: análise (streaming, sem gravar nada) e conferência antes de importar. */
export default function Preview() {
  const t = useTheme();
  const { db } = useDb();
  const { data: tree } = useDbQuery(listCategoryTree);
  const progress = useImportProgress();
  const session = getSession();
  const started = useRef(false);

  useEffect(() => {
    if (!started.current && session?.mapping && !session.plan && progress.phase !== 'analyzing') {
      started.current = true;
      runAnalyze(db);
    }
  }, [db, session, progress.phase]);

  const byId = new Map((tree ?? []).map((c) => [c.id, c]));
  const names = new Map((tree ?? []).map((c) => [c.id, c.name]));
  const rootOf = (id: string | null) => {
    let c = id ? byId.get(id) : undefined;
    while (c?.parent_id) c = byId.get(c.parent_id);
    return c?.id ?? id;
  };
  const colorOf = (id: string) => byId.get(id)?.color ?? byId.get(rootOf(id) ?? '')?.color ?? null;

  if (!session) {
    return (
      <Screen>
        <EmptyState icon="doc" title="Importação não encontrada" action={<Button title="Voltar" onPress={() => router.replace('/import')} />} />
      </Screen>
    );
  }

  const cancel = () => {
    cancelImport();
    discardSession();
    importProgress.reset();
    router.replace('/import');
  };

  if (progress.phase === 'analyzing' || (!session.plan && progress.phase !== 'failed')) {
    const stage = progress.stage && progress.stage in STAGE_LABEL ? STAGE_LABEL[progress.stage as keyof typeof STAGE_LABEL] : 'Preparando';
    return (
      <Screen>
        <Steps current={3} labels={IMPORT_STEPS} />
        <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 14 }}>
          <IconBadge name="sparkles" size={64} />
          <Title>Analisando extrato</Title>
          <View style={{ alignSelf: 'stretch' }}>
            <ProgressBar ratio={progress.ratio} label={`${stage}…${progress.rows ? ` ${progress.rows} linhas` : ''}`} />
          </View>
          <Muted center>Você pode usar o app normalmente; nada é gravado até você confirmar.</Muted>
        </Card>
        <Button title="Cancelar" variant="ghost" onPress={cancel} />
      </Screen>
    );
  }

  if (progress.phase === 'failed' || !session.plan) {
    return (
      <Screen>
        <Steps current={3} labels={IMPORT_STEPS} />
        <EmptyState icon="error" title="Não foi possível analisar" />
        <ErrorText>{IMPORT_ERROR_MESSAGE[progress.errorCode as ImportError['code']] ?? 'Erro ao ler o arquivo.'}</ErrorText>
        {!!progress.errorDetail && <Muted>Detalhe: {progress.errorDetail}</Muted>}
        <Button title="Ajustar colunas" onPress={() => router.replace('/import/mapping')} />
        <Button title="Cancelar" variant="ghost" onPress={cancel} />
      </Screen>
    );
  }

  const plan = session.plan;
  const confirm = async () => {
    await ensureNotificationPermission(); // para avisar se terminar com o app em segundo plano
    runCommit(db);
    router.replace('/import/progress');
  };
  const sources = (Object.keys(SOURCE_LABEL) as (keyof typeof SOURCE_LABEL)[]).filter((k) => plan.bySource[k]);

  return (
    <Screen>
      <Steps current={3} labels={IMPORT_STEPS} />

      <Card style={{ gap: 14 }}>
        <View>
          <Text style={{ color: t.muted, fontWeight: '600' }}>Prontos para importar</Text>
          <Text style={{ color: t.text, fontSize: 34, fontWeight: '800', letterSpacing: -1 }}>{plan.fresh.length} lançamentos</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat label="duplicados" value={String(plan.duplicates)} />
          <Stat label="com erro" value={String(plan.errors.length)} tone={plan.errors.length ? t.warning : undefined} />
          <Stat label="categorizados" value={`${Math.round(plan.coverage * 100)}%`} tone={t.success} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: t.muted }}>Soma do período</Text>
          <Amount cents={plan.sumCents} size={15} />
        </View>
        {sources.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {sources.map((k) => (
              <Badge key={k} label={`${plan.bySource[k]} · ${SOURCE_LABEL[k]}`} tone={k === 'none' ? 'warning' : 'neutral'} />
            ))}
          </View>
        )}
      </Card>

      {plan.alreadyImported && <ErrorText>Este arquivo já foi importado nesta conta.</ErrorText>}
      {plan.errors.length > 0 && (
        <Notice tone="warning" title="Algumas linhas foram ignoradas">
          Linhas: {plan.errors.slice(0, 12).map((e) => `${e.line} (${e.reason})`).join(', ')}{plan.errors.length > 12 ? '…' : ''}
        </Notice>
      )}

      <Button title={`Importar ${plan.fresh.length} lançamentos`} icon="check" onPress={confirm} disabled={!plan.fresh.length || plan.alreadyImported} />
      <Button title="Cancelar" variant="ghost" onPress={cancel} />

      {plan.fresh.length > 0 && (
        <Group title="Amostra" footer={plan.fresh.length > PREVIEW_ROWS ? `… e mais ${plan.fresh.length - PREVIEW_ROWS}.` : undefined}>
          {plan.fresh.slice(0, PREVIEW_ROWS).map((r) => (
            <ListItem
              key={r.dedupHash}
              icon={r.type === 'transfer' ? 'transfer' : r.type === 'card_payment' ? 'card' : categoryIcon(rootOf(r.categoryId))}
              iconColor={r.categoryId ? (colorOf(r.categoryId) ?? t.primary) : t.warning}
              title={r.description}
              subtitle={`${formatDate(r.postedOn)} · ${r.categoryId ? (names.get(r.categoryId) ?? 'categoria') : 'sem categoria'}${
                r.installment ? ` · ${r.installment.n}/${r.installment.total}` : ''
              }`}
              right={<Amount cents={r.amountCents} size={14} />}
            />
          ))}
        </Group>
      )}
    </Screen>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.surfaceAlt, borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
      <Text style={{ color: tone ?? t.text, fontSize: 18, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: t.muted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
