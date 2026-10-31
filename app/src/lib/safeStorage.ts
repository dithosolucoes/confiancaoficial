const memoryStore = new Map<string, string>();

const canUseStorage = (): boolean => {
  try {
    if (typeof window === "undefined") return false;
    const testKey = "__test_storage__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
};

let storageAvailable: boolean | null = null;
const isAvailable = (): boolean => {
  if (storageAvailable === null) {
    storageAvailable = canUseStorage();
  }
  return storageAvailable;
};

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (isAvailable()) {
        const val = window.localStorage.getItem(key);
        if (val !== null) return val;
      }
    } catch {
      // fallback to memory
    }
    return memoryStore.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    memoryStore.set(key, value);
    try {
      if (isAvailable()) {
        window.localStorage.setItem(key, value);
      }
    } catch {
      // fallback already saved in memoryStore
    }
  },
  removeItem(key: string): void {
    memoryStore.delete(key);
    try {
      if (isAvailable()) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // ignored
    }
  },
  clear(): void {
    memoryStore.clear();
    try {
      if (isAvailable()) {
        window.localStorage.clear();
      }
    } catch {
      // ignored
    }
  },
};
