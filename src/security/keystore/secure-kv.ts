import * as SecureStore from 'expo-secure-store';

// Android: valores cifrados com chave do Android Keystore. iOS: Keychain sem sync/backup.
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const secureKv = {
  get: (k: string) => SecureStore.getItemAsync(k, OPTS),
  set: (k: string, v: string) => SecureStore.setItemAsync(k, v, OPTS),
  del: (k: string) => SecureStore.deleteItemAsync(k, OPTS),
  async getJson<T>(k: string, fallback: T): Promise<T> {
    const raw = await SecureStore.getItemAsync(k, OPTS);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  setJson: (k: string, v: unknown) => SecureStore.setItemAsync(k, JSON.stringify(v), OPTS),
};
