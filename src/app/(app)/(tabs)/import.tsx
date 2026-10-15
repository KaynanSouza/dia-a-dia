import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Badge, Button, Card, IconBadge, Loading, Screen, ScreenHeader, SectionTitle } from '@/components/ui';
import { useDb, useDbQuery } from '@/db/DatabaseProvider';
import { useImportProgress } from '@/import/progress-store';
import { canUndo, listImportLogs, undoImport, type ImportLogRow } from '@/import/undo';
import { makeStyles, useTheme } from '@/theme';

const STATUS: Record<ImportLogRow['status'], { label: string; tone: 'success' | 'danger' | 'neutral' }> = {
  committed: { label: 'Importado', tone: 'success' },
  failed: { label: 'Falhou', tone: 'danger' },
  undone: { label: 'Desfeito', tone: 'neutral' },
};

const BANKS = ['Nubank', 'Itaú', 'Bradesco', 'BB', 'Caixa', 'Inter', '+ outros'];
const HOW = [
  { icon: 'doc', text: 'Escolha o CSV de qualquer lugar do celular' },
  { icon: 'sparkles', text: 'O app reconhece o banco e categoriza sozinho' },
  { icon: 'checkCircle', text: 'Confira e importe; dá para desfazer por 30 dias' },
] as const;

/** Histórico de importações + desfazer (C-03). */
export default function ImportHome() {
  const t = useTheme();
  const s = useStyles();
  const { db, bump } = useDb();
  const { data: logs, loading } = useDbQuery((d) => listImportLogs(d));
  const progress = useImportProgress();
  const [busy, setBusy] = useState<string | null>(null);
  const running = progress.phase === 'analyzing' || progress.phase === 'committing';

  const undo = (l: ImportLogRow) =>
    Alert.alert(
      'Desfazer importação?',
      `${l.rows_imported} transação(ões) desta importação serão removidas, inclusive categorias que você corrigiu nelas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desfazer',
          style: 'destructive',
          onPress: async () => {
            setBusy(l.id);
            try {
              await undoImport(db, l.id);
              bump();
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );

  if (loading && !logs) return <Loading />;

  return (
    <Screen edges={['top']}>
      <ScreenHeader title="Importar" />

      <LinearGradient colors={t.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
        <View style={s.heroIcon}>
          <Icon name="import" size={26} color="#FFF" />
        </View>
        <Text style={s.heroTitle}>Extrato em CSV</Text>
        <Text style={s.heroText}>Conta corrente ou cartão. Tudo é processado no aparelho e o arquivo é apagado depois.</Text>
        <View style={s.chips}>
          {BANKS.map((b) => (
            <View key={b} style={s.chip}>
              <Text style={s.chipText}>{b}</Text>
            </View>
          ))}
        </View>
        {running ? (
          <View style={{ gap: 10, marginTop: 6 }}>
            <View style={s.runningBox}>
              <ActivityIndicator color="#FFF" />
              <Text style={s.runningText}>{progress.phase === 'analyzing' ? 'Analisando extrato…' : 'Gravando transações…'}</Text>
              <Text style={s.runningText}>{Math.round(progress.ratio * 100)}%</Text>
            </View>
            <Pressable
              style={s.heroButton}
              onPress={() => router.push(progress.phase === 'analyzing' ? '/import/preview' : '/import/progress')}
            >
              <Text style={[s.heroButtonText, { color: t.hero[0] }]}>Ver progresso</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={({ pressed }) => [s.heroButton, pressed && { opacity: 0.9 }]} onPress={() => router.push('/import/upload')}>
            <Icon name="plus" size={18} color={t.hero[0]} />
            <Text style={[s.heroButtonText, { color: t.hero[0] }]}>Nova importação</Text>
          </Pressable>
        )}
      </LinearGradient>

      {!logs?.length && (
        <Card>
          <SectionTitle>Como funciona</SectionTitle>
          {HOW.map((h, i) => (
            <View key={i} style={s.howRow}>
              <IconBadge name={h.icon} size={36} />
              <Text style={s.howText}>{h.text}</Text>
            </View>
          ))}
        </Card>
      )}

      {!!logs?.length && <SectionTitle>Histórico</SectionTitle>}
      {logs?.map((l) => {
        const st = STATUS[l.status];
        return (
          <Card key={l.id} style={{ gap: 10 }}>
            <View style={s.logHead}>
              <IconBadge name="doc" color={l.status === 'failed' ? t.danger : l.status === 'undone' ? t.faint : t.primary} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={s.logTitle} numberOfLines={1}>{l.account_name}</Text>
                <Text style={s.logDate}>{new Date(l.finished_at).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}</Text>
              </View>
              <Badge label={st.label} tone={st.tone} />
            </View>
            {l.status === 'failed' ? (
              <Text style={s.logDate}>Erro: {l.error_code ?? 'desconhecido'}. Nada foi gravado.</Text>
            ) : (
              <View style={s.stats}>
                <Stat value={l.rows_imported} label="novas" />
                <Stat value={l.rows_duplicate} label="duplicadas" />
                <Stat value={l.rows_categorized} label="categorizadas" />
              </View>
            )}
            {canUndo(l) && (
              <Button title="Desfazer importação" icon="undo" variant="ghost" small onPress={() => undo(l)} loading={busy === l.id} disabled={!!busy} />
            )}
          </Card>
        );
      })}

    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const s = useStyles();
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    hero: { borderRadius: 24, padding: 20, gap: 8, overflow: 'hidden' },
    heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    heroTitle: { color: '#FFF', fontSize: 22, fontWeight: '800' },
    heroText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 },
    chip: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    chipText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
    heroButton: { backgroundColor: '#FFF', borderRadius: 14, minHeight: 50, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    heroButtonText: { fontWeight: '800', fontSize: 16 },
    runningBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.14)', padding: 12, borderRadius: 14 },
    runningText: { color: '#FFF', fontWeight: '600', flexShrink: 1 },
    howRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    howText: { flex: 1, color: t.text, fontSize: 15 },
    logHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    logTitle: { color: t.text, fontSize: 16, fontWeight: '700' },
    logDate: { color: t.muted, fontSize: 13 },
    stats: { flexDirection: 'row', gap: 8 },
    stat: { flex: 1, backgroundColor: t.surfaceAlt, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
    statValue: { color: t.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
    statLabel: { color: t.muted, fontSize: 12 },
  }),
);
