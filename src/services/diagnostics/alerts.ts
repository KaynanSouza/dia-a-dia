import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Linking, Platform } from 'react-native';

import { getSetting } from '@/db/repositories/settings.repo';
import { IS_EXPO_GO } from '@/lib/runtime';
import { TEST_NOTIFICATION_ID, takePendingTest, type TestResult } from '@/services/notifications/actions';
import { CHANNELS, getNotifications, setupChannelsAndCategories, type ChannelId } from '@/services/notifications/native';
import { MAX_PENDING_BILLS } from '@/services/notifications/plan';

export type CheckStatus = 'ok' | 'warn' | 'error' | 'unknown';
export type CheckId = 'module' | 'permission' | 'channels' | 'exact_alarm' | 'battery' | 'scheduled' | 'test';
export type Check = { id: CheckId; status: CheckStatus; title: string; detail: string; fix?: 'request_permission' | 'open_settings' | 'exact_alarm' | 'battery' | 'test' };

const ANDROID_API = Platform.OS === 'android' ? Number(Platform.Version) : 0;
/** Atraso acima disto no teste sugere alarme inexato/economia de bateria. */
const LATE_THRESHOLD_S = 120;

const packageName = () => (IS_EXPO_GO ? 'host.exp.exponent' : (Constants.expoConfig?.android?.package ?? 'com.diaadia.app'));

/** Checklist "Meus alertas estão funcionando?" (A-03). Não pede nada sozinho: só lê o estado. */
export async function runAlertChecks(db: SQLiteDatabase): Promise<Check[]> {
  const N = getNotifications();
  const checks: Check[] = [];
  if (!N) {
    return [{ id: 'module', status: 'error', title: 'Notificações indisponíveis', detail: 'Este build não inclui o módulo de notificações.' }];
  }

  const perm = await N.getPermissionsAsync();
  checks.push(
    perm.granted
      ? { id: 'permission', status: 'ok', title: 'Permissão de notificações', detail: 'Concedida.' }
      : {
          id: 'permission',
          status: 'error',
          title: 'Permissão de notificações',
          detail: perm.canAskAgain ? 'Ainda não concedida.' : 'Negada. Ative nas configurações do sistema.',
          fix: perm.canAskAgain ? 'request_permission' : 'open_settings',
        },
  );

  if (Platform.OS === 'android') {
    const channels = await N.getNotificationChannelsAsync().catch(() => []);
    const byId = new Map(channels.map((c) => [c.id, c]));
    const missing = (Object.keys(CHANNELS) as ChannelId[]).filter((id) => !byId.has(id));
    if (missing.length) await setupChannelsAndCategories();
    const muted = (Object.keys(CHANNELS) as ChannelId[]).filter((id) => (byId.get(id)?.importance ?? 3) <= N.AndroidImportance.MIN);
    checks.push(
      muted.includes('bills')
        ? { id: 'channels', status: 'error', title: 'Canal "Contas a pagar"', detail: 'Silenciado nas configurações do sistema.', fix: 'open_settings' }
        : muted.length
          ? { id: 'channels', status: 'warn', title: 'Canais de notificação', detail: `Silenciados: ${muted.map((m) => CHANNELS[m].name).join(', ')}.`, fix: 'open_settings' }
          : { id: 'channels', status: 'ok', title: 'Canais de notificação', detail: 'Contas, backup e assinaturas ativos.' },
    );
  }

  const last = takePendingTest() ?? (await getSetting<TestResult | null>(db, 'reminders.last_test', null));

  if (Platform.OS === 'android' && ANDROID_API >= 31) {
    // Não há API JS para AlarmManager.canScheduleExactAlarms(); o teste mede o atraso real.
    const late = last && last.delayS > LATE_THRESHOLD_S;
    checks.push({
      id: 'exact_alarm',
      status: !last ? 'unknown' : late ? 'warn' : 'ok',
      title: 'Alarmes exatos (Android 12+)',
      detail: !last
        ? 'Faça o teste para medir. Sem esta permissão o Android pode atrasar os lembretes.'
        : late
          ? `O teste chegou ${Math.round(last.delayS / 60)} min atrasado. Permita "Alarmes e lembretes".`
          : 'Último teste chegou no horário.',
      fix: 'exact_alarm',
    });
    checks.push({
      id: 'battery',
      status: late ? 'warn' : 'unknown',
      title: 'Economia de bateria',
      detail: `${batteryGuide().summary} Isso evita que o sistema adie ou descarte lembretes.`,
      fix: 'battery',
    });
  }

  const scheduled = (await N.getAllScheduledNotificationsAsync().catch(() => [])).filter((n) => n.identifier.startsWith('bill_')).length;
  const pendingBills = (await db.getFirstAsync<{ n: number }>("SELECT count(*) AS n FROM bill_instances WHERE status = 'pending';"))?.n ?? 0;
  checks.push({
    id: 'scheduled',
    status: pendingBills && !scheduled && perm.granted ? 'warn' : 'ok',
    title: 'Lembretes agendados',
    detail: `${scheduled} agendado(s) no aparelho (limite ${MAX_PENDING_BILLS}); ${pendingBills} conta(s) pendente(s).`,
  });

  checks.push({
    id: 'test',
    status: !last ? 'unknown' : last.delayS > LATE_THRESHOLD_S ? 'warn' : 'ok',
    title: 'Notificação de teste',
    detail: last
      ? `Último teste ${new Date(last.deliveredAt).toLocaleString('pt-BR')}: ${last.delayS <= 5 ? 'no horário' : `${last.delayS}s de atraso`}.`
      : 'Ainda não testado.',
    fix: 'test',
  });
  return checks;
}

/** Agenda uma notificação para daqui a 1 minuto; o atraso é medido quando ela chega ou é tocada. */
export async function sendTestNotification(): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  if (!(await N.getPermissionsAsync()).granted && !(await N.requestPermissionsAsync()).granted) return false;
  await setupChannelsAndCategories();
  await N.cancelScheduledNotificationAsync(TEST_NOTIFICATION_ID).catch(() => {});
  const scheduledFor = Date.now() + 60_000;
  await N.scheduleNotificationAsync({
    identifier: TEST_NOTIFICATION_ID,
    content: { title: 'Teste do Dia a Dia', body: 'Seus alertas estão funcionando. Toque para registrar o resultado.', data: { kind: 'test', scheduledFor } },
    trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: scheduledFor, channelId: 'bills' },
  });
  return true;
}

export async function requestNotificationPermission(): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  const r = await N.requestPermissionsAsync();
  if (r.granted) await setupChannelsAndCategories();
  return r.granted;
}

export async function openFix(fix: NonNullable<Check['fix']>) {
  if (fix === 'request_permission') return requestNotificationPermission();
  if (Platform.OS !== 'android') return Linking.openSettings();
  try {
    if (fix === 'exact_alarm') {
      return await IntentLauncher.startActivityAsync('android.settings.REQUEST_SCHEDULE_EXACT_ALARM', { data: `package:${packageName()}` });
    }
    if (fix === 'battery') {
      return await IntentLauncher.startActivityAsync('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
    }
    if (fix === 'open_settings') {
      return await IntentLauncher.startActivityAsync('android.settings.APP_NOTIFICATION_SETTINGS', {
        extra: { 'android.provider.extra.APP_PACKAGE': packageName() },
      });
    }
  } catch {}
  return Linking.openSettings();
}

/** Passos de isenção de bateria por fabricante (as telas variam entre marcas e versões). */
export function batteryGuide(): { brand: string; summary: string; steps: string[]; url: string } {
  const c = (Platform.constants ?? {}) as { Manufacturer?: string; Brand?: string };
  const brand = (c.Manufacturer || c.Brand || '').toLowerCase();
  const generic = {
    summary: 'Deixe o app sem restrição de bateria.',
    steps: ['Configurações › Apps › Dia a Dia (ou Expo Go)', 'Bateria › "Sem restrições"'],
  };
  const guides: Record<string, { summary: string; steps: string[] }> = {
    samsung: {
      summary: 'Samsung: tire o app de "Apps em suspensão".',
      steps: ['Configurações › Cuidados com o dispositivo › Bateria', 'Limites de uso em segundo plano › remova o app de "Apps em suspensão" e "Em suspensão profunda"', 'Apps › Dia a Dia › Bateria › "Sem restrições"'],
    },
    xiaomi: {
      summary: 'Xiaomi/Redmi/POCO: ative "Início automático" e "Sem restrições".',
      steps: ['Configurações › Apps › Gerenciar apps › Dia a Dia', 'Ative "Início automático"', 'Economia de bateria › "Sem restrições"'],
    },
    motorola: {
      summary: 'Motorola: bateria "Sem restrições".',
      steps: ['Configurações › Apps › Dia a Dia › Bateria', 'Escolha "Sem restrições"'],
    },
    huawei: {
      summary: 'Huawei: gerenciar inicialização manualmente.',
      steps: ['Configurações › Bateria › Inicialização de apps', 'Desative o automático para o app e ative as 3 opções'],
    },
    oppo: {
      summary: 'OPPO/realme/OnePlus: permitir atividade em segundo plano.',
      steps: ['Configurações › Bateria › Mais configurações › Otimizar uso da bateria', 'Escolha o app › "Não otimizar"', 'Permita "Início automático"'],
    },
    asus: { summary: 'ASUS: desative o "Gerenciador de inicialização automática" para o app.', steps: ['Gerenciador móvel › Gerenciador de inicialização automática', 'Permita o app'] },
    vivo: { summary: 'vivo: permitir alto consumo em segundo plano.', steps: ['Configurações › Bateria › Consumo de energia em segundo plano', 'Permita o app'] },
  };
  const key = Object.keys(guides).find((k) => brand.includes(k)) ?? (/(realme|oneplus)/.test(brand) ? 'oppo' : /(redmi|poco)/.test(brand) ? 'xiaomi' : '');
  const g = guides[key] ?? generic;
  return { brand: brand || 'android', ...g, url: `https://dontkillmyapp.com/${key || ''}` };
}
