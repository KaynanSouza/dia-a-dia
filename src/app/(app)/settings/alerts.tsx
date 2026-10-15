import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Linking, Platform, Switch, Text, View } from 'react-native';

import { Chip, ChipSelect } from '@/components/form';
import type { IconName } from '@/components/Icon';
import { Button, Card, Group, ListItem, Loading, Muted, Notice, Screen, SectionTitle } from '@/components/ui';
import { useDb, useDbQuery } from '@/db/DatabaseProvider';
import { batteryGuide, openFix, runAlertChecks, sendTestNotification, type Check } from '@/services/diagnostics/alerts';
import { getReminderSettings, saveReminderSettings } from '@/services/notifications/reminders';
import type { ReminderSettings } from '@/services/notifications/plan';
import { useTheme } from '@/theme';

const STATUS_ICON: Record<Check['status'], IconName> = { ok: 'checkCircle', warn: 'warning', error: 'error', unknown: 'question' };
const FIX_LABEL: Record<NonNullable<Check['fix']>, string> = {
  request_permission: 'Permitir',
  open_settings: 'Abrir ajustes',
  exact_alarm: 'Permitir',
  battery: 'Ajustar',
  test: 'Testar',
};
const HOURS = [7, 8, 9, 10, 12, 18, 20];
const LEADS = [7, 5, 3, 2, 1, 0];

/** A-03/A-04: "Meus alertas estão funcionando?" + preferências do motor de lembretes. */
export default function Alerts() {
  const t = useTheme();
  const { db, bump } = useDb();
  const [tick, setTick] = useState(0);
  const [testSent, setTestSent] = useState<number | null>(null);
  const { data: checks } = useDbQuery((d) => runAlertChecks(d), [tick]);
  const { data: cfg } = useDbQuery(getReminderSettings, [tick]);

  // voltar das configurações do sistema → reavalia
  useFocusEffect(
    useCallback(() => {
      const sub = AppState.addEventListener('change', (s) => s === 'active' && setTick((n) => n + 1));
      return () => sub.remove();
    }, []),
  );

  if (!checks || !cfg) return <Loading />;
  const save = async (patch: Partial<ReminderSettings>) => {
    await saveReminderSettings(db, patch);
    setTick((n) => n + 1);
    bump();
  };
  const color = (st: Check['status']) => ({ ok: t.success, warn: t.warning, error: t.danger, unknown: t.faint })[st];
  const problems = checks.filter((c) => c.status === 'error' || c.status === 'warn').length;
  const guide = batteryGuide();

  const fix = async (c: Check) => {
    if (c.fix === 'test') {
      if (await sendTestNotification()) setTestSent(Date.now());
    } else if (c.fix) await openFix(c.fix);
    setTick((n) => n + 1);
  };

  const toggleLead = (n: number) => {
    const set = new Set(cfg.leadDays);
    if (set.has(n)) set.delete(n);
    else set.add(n);
    save({ leadDays: [...set].sort((a, b) => b - a) });
  };

  return (
    <Screen>
      <Notice tone={problems ? 'warning' : 'success'} title={problems ? `${problems} ponto(s) de atenção` : 'Tudo certo com os alertas'}>
        Os lembretes são agendados no próprio aparelho e funcionam sem internet.
      </Notice>

      <Group title="Meus alertas estão funcionando?">
        {checks.map((c) => (
          <ListItem
            key={c.id}
            icon={STATUS_ICON[c.status]}
            iconColor={color(c.status)}
            title={c.title}
            subtitle={c.detail}
            right={c.fix && (c.status !== 'ok' || c.fix === 'test') ? <Button small variant="secondary" title={FIX_LABEL[c.fix]} onPress={() => fix(c)} /> : undefined}
          />
        ))}
      </Group>
      {testSent && (
        <Notice tone="info" title="Teste agendado">
          Chega em ~1 minuto. Pode bloquear a tela. Ao chegar, toque nela para registrar o horário real de entrega.
        </Notice>
      )}

      {Platform.OS === 'android' && (
        <Card>
          <SectionTitle>Economia de bateria · {guide.brand}</SectionTitle>
          <Muted>{guide.summary}</Muted>
          {guide.steps.map((step, i) => (
            <Text key={i} style={{ color: t.text, fontSize: 14 }}>
              {i + 1}. {step}
            </Text>
          ))}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button small title="Abrir ajustes" icon="battery" onPress={() => openFix('battery')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button small variant="secondary" title="Guia completo" onPress={() => Linking.openURL(guide.url)} />
            </View>
          </View>
        </Card>
      )}

      <SectionTitle>Lembretes de contas</SectionTitle>
      <Group>
        <ListItem
          icon="bell"
          title="Lembrar vencimentos"
          right={<Switch value={cfg.enabled} onValueChange={(v) => save({ enabled: v })} trackColor={{ true: t.primary }} />}
        />
        <ListItem
          icon="eyeOff"
          title="Mostrar valor na notificação"
          subtitle={cfg.showAmount ? 'Nome + valor (aparece na tela bloqueada)' : 'Só o nome da conta (mais privado)'}
          right={<Switch value={cfg.showAmount} onValueChange={(v) => save({ showAmount: v })} trackColor={{ true: t.primary }} />}
        />
      </Group>

      <Text style={{ color: t.text, fontWeight: '600' }}>Antecedência</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {LEADS.map((n) => (
          <Chip key={n} label={n === 0 ? 'No dia' : n === 1 ? '1 dia antes' : `${n} dias antes`} active={cfg.leadDays.includes(n)} onPress={() => toggleLead(n)} />
        ))}
      </View>
      <ChipSelect label="Horário" options={HOURS.map((h) => ({ id: h, label: `${String(h).padStart(2, '0')}:00` }))} value={cfg.hour} onChange={(h) => save({ hour: h })} />
      <ChipSelect
        label="Avisos de atraso (1 por dia)"
        options={[0, 1, 2, 3].map((n) => ({ id: n, label: n === 0 ? 'Não avisar' : `Até ${n} dia${n > 1 ? 's' : ''}` }))}
        value={cfg.overdueDays}
        onChange={(n) => save({ overdueDays: n })}
      />
      <ChipSelect
        label="Silêncio (não notificar)"
        options={[
          { id: '22-7', label: '22h às 7h' },
          { id: '23-8', label: '23h às 8h' },
          { id: '21-7', label: '21h às 7h' },
          { id: '0-0', label: 'Sem silêncio' },
        ]}
        value={`${cfg.quietStart}-${cfg.quietEnd}`}
        onChange={(v) => {
          const [a, b] = v.split('-').map(Number);
          save({ quietStart: a, quietEnd: b });
        }}
      />
      <Muted>
        Até 60 lembretes ficam agendados por vez (limite do iOS), nos próximos 60 dias; o restante entra automaticamente quando você abre o app.
      </Muted>
    </Screen>
  );
}
