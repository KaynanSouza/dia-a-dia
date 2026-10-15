import { Platform } from 'react-native';

import { bus } from '@/events/bus';

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

/**
 * Carrega expo-notifications sob demanda. Em binários sem o módulo nativo (dev build antigo)
 * o import lança "Cannot find native module"; aqui isso vira `null` e as notificações viram no-op.
 */
export function getNotifications(): NotificationsModule | null {
  if (cached === undefined) {
    try {
      cached = require('expo-notifications') as NotificationsModule;
    } catch {
      cached = null;
      bus.emit('error', { scope: 'notifications', code: 'native_module_missing' });
    }
  }
  return cached;
}

/** Canais isolados (A-03): o usuário pode silenciar backup sem perder os vencimentos. */
export type ChannelId = 'bills' | 'backup' | 'subscriptions' | 'general';

export const CHANNELS: Record<ChannelId, { name: string; description: string; high: boolean }> = {
  bills: { name: 'Contas a pagar', description: 'Lembretes de vencimento e atraso', high: true },
  backup: { name: 'Backup', description: 'Lembrete mensal de backup', high: false },
  subscriptions: { name: 'Assinaturas', description: 'Renovações de assinaturas', high: false },
  general: { name: 'Geral', description: 'Importações e notificações de teste', high: false },
};

export const BILL_CATEGORY = 'bill';
export const ACTION_PAID = 'paid';
export const ACTION_SNOOZE = 'snooze';

/** Idempotente: pode rodar a cada abertura (canais só mudam nome/descrição depois de criados). */
export async function setupChannelsAndCategories() {
  const N = getNotifications();
  if (!N) return;
  if (Platform.OS === 'android') {
    for (const [id, c] of Object.entries(CHANNELS)) {
      await N.setNotificationChannelAsync(id, {
        name: c.name,
        description: c.description,
        importance: c.high ? N.AndroidImportance.HIGH : N.AndroidImportance.DEFAULT,
        // tela bloqueada: o sistema esconde o conteúdo se o usuário escolheu "ocultar conteúdo sensível"
        lockscreenVisibility: N.AndroidNotificationVisibility.PRIVATE,
        showBadge: id === 'bills',
      }).catch(() => {});
    }
  }
  await N.setNotificationCategoryAsync(
    BILL_CATEGORY,
    [
      // não abrem o app: a ação vai para a fila e é aplicada no SQLite quando o app roda (ver actions.ts)
      { identifier: ACTION_PAID, buttonTitle: 'Paguei', options: { opensAppToForeground: false, isAuthenticationRequired: true } },
      { identifier: ACTION_SNOOZE, buttonTitle: 'Lembrar amanhã', options: { opensAppToForeground: false } },
    ],
    { previewPlaceholder: 'Conta a pagar', allowInCarPlay: false },
  ).catch(() => {});
}

export function initNotificationHandler() {
  getNotifications()?.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}
