import { deleteDatabaseFiles } from '@/db/client';
import { bus } from '@/events/bus';
import { dirs, removeDir } from '@/lib/files';
import { clearAllNotifications } from '@/notifications/scheduler';
import { deleteDbKey } from '@/security/keystore/db-key';
import { lockStore } from '@/security/lock/lock-store';

export const WIPE_CONFIRM_WORD = 'APAGAR';

/**
 * F-04: apaga banco (+ WAL/SHM/rollback), chave do SQLCipher, PIN/config de bloqueio,
 * notificações e todos os arquivos temporários. Irreversível.
 * Pré-condição: confirmIdentity() + palavra de confirmação (validadas na UI).
 */
export async function wipeAllData() {
  bus.emit('data.wiped', {}); // antes de apagar: é o último evento (some junto com o banco)
  await deleteDatabaseFiles();
  await deleteDbKey();
  await lockStore.clear();
  await clearAllNotifications();
  for (const d of Object.values(dirs)) removeDir(d());
}
