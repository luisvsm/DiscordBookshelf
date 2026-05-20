import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { UserCredentialStore } from '../../src/users/UserCredentialStore';

let tmpDir: string;
let filePath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'abs-test-'));
  filePath = join(tmpDir, 'users.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('UserCredentialStore', () => {
  it('returns undefined for an unknown user', () => {
    const store = new UserCredentialStore(filePath);
    expect(store.get('user1')).toBeUndefined();
  });

  it('stores and retrieves credentials', () => {
    const store = new UserCredentialStore(filePath);
    store.set({ discordUserId: 'u1', absServerUrl: 'https://abs.example.com', absApiToken: 'tok' });
    expect(store.get('u1')).toEqual({
      discordUserId: 'u1',
      absServerUrl: 'https://abs.example.com',
      absApiToken: 'tok',
    });
  });

  it('persists credentials to disk and loads them back', () => {
    const store1 = new UserCredentialStore(filePath);
    store1.set({ discordUserId: 'u1', absServerUrl: 'https://abs.example.com', absApiToken: 'tok' });

    const store2 = new UserCredentialStore(filePath);
    expect(store2.get('u1')?.absApiToken).toBe('tok');
  });

  it('overwrites existing credentials for the same user', () => {
    const store = new UserCredentialStore(filePath);
    store.set({ discordUserId: 'u1', absServerUrl: 'https://old.example.com', absApiToken: 'old-tok' });
    store.set({ discordUserId: 'u1', absServerUrl: 'https://new.example.com', absApiToken: 'new-tok' });
    expect(store.get('u1')?.absServerUrl).toBe('https://new.example.com');
  });

  it('deletes credentials and returns true', () => {
    const store = new UserCredentialStore(filePath);
    store.set({ discordUserId: 'u1', absServerUrl: 'https://abs.example.com', absApiToken: 'tok' });
    expect(store.delete('u1')).toBe(true);
    expect(store.get('u1')).toBeUndefined();
  });

  it('returns false when deleting a non-existent user', () => {
    const store = new UserCredentialStore(filePath);
    expect(store.delete('nonexistent')).toBe(false);
  });

  it('recovers gracefully from a corrupted JSON file', () => {
    writeFileSync(filePath, 'not valid json');
    const store = new UserCredentialStore(filePath);
    expect(store.get('anyone')).toBeUndefined();
  });
});
