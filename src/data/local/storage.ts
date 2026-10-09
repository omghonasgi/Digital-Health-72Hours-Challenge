import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StorageAdapter } from './LocalRepository';
import type { Store } from './store';
import { SEED_VERSION } from './seed';

export const STORE_KEY = `carebridge.store.v${SEED_VERSION}`;

/** Persists the demo store on device (localStorage on web). Nothing leaves the device. */
export class AsyncStorageAdapter implements StorageAdapter {
  async load(): Promise<Store | null> {
    try {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Store;
      return parsed.seedVersion === SEED_VERSION ? parsed : null;
    } catch {
      return null;
    }
  }
  async save(store: Store) {
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(store));
  }
  async clear() {
    await AsyncStorage.removeItem(STORE_KEY);
  }
}
