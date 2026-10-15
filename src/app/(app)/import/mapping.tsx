import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';

import { Amount, Button, Card, ErrorText, Field, Group, IconBadge, ListItem, Muted, Notice, Screen, SectionTitle, Steps, formatDate } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { IMPORT_ERROR_MESSAGE, ImportError } from '@/import/limits';
import { configFromManual, profileSignature } from '@/import/profiles/detect';
import { saveCustomProfile } from '@/import/profiles/repo';
import type { DateFormat, ResolvedMapping } from '@/import/profiles/types';
import { isRowError, mapRow } from '@/import/row-mapper';
import { applyMapping, discardSession, getSession } from '@/import/session';
import { IMPORT_STEPS } from '@/import/steps';
import { useTheme } from '@/theme';

const DELIM_LABEL = { ',': 'vírgula', ';': 'ponto e vírgula', '	': 'tabulação' } as const;
const formatBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

type Role = 'date' | 'description' | 'amount' | 'debit' | 'credit';
const ROLE_LABEL: Record<Role, string> = { date: 'Data', description: 'Descrição', amount: 'Valor', debit: 'Débito', credit: 'Crédito' };
const DATE_FORMATS: { id: DateFormat; label: string }[] = [
  { id: 'auto', label: 'Automático' },
  { id: 'dmy', label: 'DD/MM/AAAA' },
  { id: 'ymd', label: 'AAAA-MM-DD' },
  { id: 'ymd_compact', label: 'AAAAMMDD' },
];

/** Passo 2/4: perfil detectado ou mapeamento manual de colunas (salvável como perfil). */
export default function Mapping() {
  const t = useTheme();
  const { db } = useDb();
  const session = getSession();
  const [manual, setManual] = useState(!session?.profile);
  const [roles, setRoles] = useState<Partial<Record<Role, number>>>(() => guessRoles(session?.mapping));
  const [dateFormat, setDateFormat] = useState<DateFormat>('auto');
  const [invert, setInvert] = useState(session?.accountKind === 'credit_card');
  const [saveAs, setSaveAs] = useState('');
  const [error, setError] = useState<string>();

  if (!session) {
    return (
      <Screen>
        <Muted>Nenhum arquivo selecionado.</Muted>
        <Button title="Escolher arquivo" onPress={() => router.replace('/import/upload')} />
      </Screen>
    );
  }

  const cycleRole = (col: number) => {
    const order: (Role | undefined)[] = [undefined, 'date', 'description', 'amount', 'debit', 'credit'];
    const current = (Object.keys(roles) as Role[]).find((r) => roles[r] === col);
    const next = order[(order.indexOf(current) + 1) % order.length];
    setRoles((prev) => {
      const out = { ...prev };
      if (current) delete out[current];
      if (next) out[next] = col;
      return out;
    });
  };

  const proceed = async () => {
    setError(undefined);
    try {
      if (!manual && session.profile) {
        applyMapping(session.profile.config, session.profile, session.profileId);
      } else {
        if (roles.date === undefined || roles.description === undefined || (roles.amount ?? roles.debit ?? roles.credit) === undefined) {
          throw new ImportError('mapping');
        }
        const config = configFromManual(session.headers, {
          date: roles.date, description: roles.description, amount: roles.amount, debit: roles.debit, credit: roles.credit, dateFormat, invert,
        });
        let profileId = `manual-${session.accountKind}`;
        if (saveAs.trim()) {
          profileId = await saveCustomProfile(db, {
            name: saveAs, bank: saveAs, kind: session.accountKind, signature: profileSignature(session.headers), config,
          });
        }
        applyMapping(config, null, profileId);
      }
      router.push('/import/preview');
    } catch (e) {
      setError(e instanceof ImportError ? IMPORT_ERROR_MESSAGE[e.code] : 'Mapeamento inválido.');
    }
  };

  const roleOf = (col: number) => (Object.keys(roles) as Role[]).find((r) => roles[r] === col);

  return (
    <Screen>
      <Steps current={2} labels={IMPORT_STEPS} />

      <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconBadge name="doc" size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }} numberOfLines={1}>{session.fileName}</Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>
            {formatBytes(session.bytes)} · {session.encoding === 'utf-8' ? 'UTF-8' : 'Windows-1252'} · {DELIM_LABEL[session.delimiter]}
          </Text>
        </View>
      </Card>

      {session.profile ? (
        <Group>
          <ListItem
            icon="sparkles"
            iconColor={t.success}
            title={`Formato reconhecido: ${session.profile.name}`}
            subtitle={manual ? 'Usando mapeamento manual' : 'Desative para escolher as colunas'}
            right={<Switch value={!manual} onValueChange={(v) => setManual(!v)} trackColor={{ true: t.primary }} />}
          />
        </Group>
      ) : (
        <Notice tone="warning" title="Formato não reconhecido">Indique as colunas tocando no rótulo acima de cada uma.</Notice>
      )}

      {session.profile && session.mapping && !manual && (
        <Group title="Prévia">
          {session.sample.slice(0, 4).map((cols, i) => {
            const r = mapRow(cols, i, session.mapping!);
            if (!r) return null;
            return isRowError(r) ? (
              <ListItem key={i} icon="warning" iconColor={t.warning} title={`Linha ${i + 1} não reconhecida`} subtitle={r.reason} />
            ) : (
              <ListItem key={i} title={r.description} subtitle={formatDate(r.postedOn)} right={<Amount cents={r.amountCents} size={15} />} />
            );
          })}
        </Group>
      )}

      {manual && (
        <>
          <SectionTitle>Colunas</SectionTitle>
          <Muted>Toque no rótulo de cada coluna para alternar: Data → Descrição → Valor → Débito → Crédito.</Muted>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {session.headers.map((h, col) => {
              const role = roleOf(col);
              return (
                <View key={col} style={{ width: 150, gap: 6, backgroundColor: t.surface, borderRadius: 16, padding: 10, borderWidth: 1.5, borderColor: role ? t.primary : t.border }}>
                  <Button small title={role ? ROLE_LABEL[role] : 'Ignorar'} variant={role ? 'primary' : 'secondary'} onPress={() => cycleRole(col)} />
                  <Text style={{ fontWeight: '700', color: t.text }} numberOfLines={1}>{h || `Coluna ${col + 1}`}</Text>
                  {session.sample.slice(0, 5).map((r, i) => (
                    <Text key={i} style={{ color: t.muted, fontSize: 12 }} numberOfLines={1}>{r[col] ?? ''}</Text>
                  ))}
                </View>
              );
            })}
          </ScrollView>

          <Group title="Formato da data">
            {DATE_FORMATS.map((f) => (
              <ListItem key={f.id} title={f.label} onPress={() => setDateFormat(f.id)} selected={dateFormat === f.id} />
            ))}
          </Group>
          <Group>
            <ListItem
              title="Inverter sinal dos valores"
              subtitle="Para faturas de cartão em que a compra aparece positiva"
              right={<Switch value={invert} onValueChange={setInvert} trackColor={{ true: t.primary }} />}
            />
          </Group>
          <Field label="Salvar como perfil (opcional)" value={saveAs} onChangeText={setSaveAs} placeholder="Ex.: Banco X — Conta" autoCapitalize="words" />
        </>
      )}

      <ErrorText>{error}</ErrorText>
      <Button title="Continuar" icon="chevronRight" onPress={proceed} />
      <Button
        title="Cancelar"
        variant="ghost"
        onPress={() => {
          discardSession();
          router.back();
        }}
      />
    </Screen>
  );
}

function guessRoles(m: ResolvedMapping | null | undefined) {
  if (!m) return {};
  const r: Partial<Record<Role, number>> = { date: m.date, description: m.description };
  if (m.amount !== null) r.amount = m.amount;
  if (m.debit !== null) r.debit = m.debit;
  if (m.credit !== null) r.credit = m.credit;
  return r;
}
