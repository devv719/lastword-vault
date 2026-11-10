// Mock localStorage and sessionStorage for Node.js test environment
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  get length(): number {
    return this.store.size;
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as unknown as { localStorage: Storage }).localStorage = new MemoryStorage();
}

if (typeof globalThis.sessionStorage === 'undefined') {
  (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = new MemoryStorage();
}

