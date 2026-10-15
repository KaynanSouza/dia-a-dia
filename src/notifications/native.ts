import { bus } from '@/events/bus';

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

/**
 * Carrega expo-notifications sob demanda. Em binários sem o módulo nativo (Expo Go, dev build antigo)
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

export function initNotificationHandler() {
  getNotifications()?.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}
