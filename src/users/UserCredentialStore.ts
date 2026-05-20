import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { UserCredentials } from '../abs/types';

interface PlainEntry {
  absServerUrl: string;
  absApiToken: string;
  encrypted?: false;
}

interface EncryptedEntry {
  encrypted: true;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

type StoredEntry = PlainEntry | EncryptedEntry;
type CredentialMap = Record<string, StoredEntry>;

const DEFAULT_FILE_PATH = resolve(process.cwd(), 'data', 'users.json');

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32) as Buffer;
}

function encrypt(password: string, plaintext: string): EncryptedEntry {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(password, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    encrypted: true,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    data: encrypted.toString('hex'),
  };
}

function decrypt(password: string, entry: EncryptedEntry): string {
  const key = deriveKey(password, Buffer.from(entry.salt, 'hex'));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(entry.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(entry.tag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(entry.data, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

export class UserCredentialStore {
  private store: CredentialMap = {};
  private passwordCache = new Map<string, string>();

  constructor(private readonly filePath = DEFAULT_FILE_PATH) {
    this.load();
  }

  private load(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(this.filePath)) return;
    try {
      this.store = JSON.parse(readFileSync(this.filePath, 'utf8')) as CredentialMap;
    } catch {
      this.store = {};
    }
  }

  private persist(): void {
    writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), 'utf8');
  }

  get(discordUserId: string): UserCredentials | 'locked' | undefined {
    const entry = this.store[discordUserId];
    if (!entry) return undefined;

    if (!entry.encrypted) {
      return { discordUserId, absServerUrl: entry.absServerUrl, absApiToken: entry.absApiToken };
    }

    const password = this.passwordCache.get(discordUserId);
    if (!password) return 'locked';

    try {
      const { absServerUrl, absApiToken } = JSON.parse(decrypt(password, entry)) as {
        absServerUrl: string;
        absApiToken: string;
      };
      return { discordUserId, absServerUrl, absApiToken };
    } catch {
      this.passwordCache.delete(discordUserId);
      return 'locked';
    }
  }

  isEncrypted(discordUserId: string): boolean {
    return this.store[discordUserId]?.encrypted === true;
  }

  /** Cache the password after verifying it decrypts the stored credentials. Returns false on wrong password. */
  unlockWithPassword(discordUserId: string, password: string): boolean {
    const entry = this.store[discordUserId];
    if (!entry?.encrypted) return false;
    try {
      decrypt(password, entry);
      this.passwordCache.set(discordUserId, password);
      return true;
    } catch {
      return false;
    }
  }

  set(creds: UserCredentials, password?: string): void {
    this.passwordCache.delete(creds.discordUserId);
    if (password) {
      this.store[creds.discordUserId] = encrypt(
        password,
        JSON.stringify({ absServerUrl: creds.absServerUrl, absApiToken: creds.absApiToken }),
      );
      this.passwordCache.set(creds.discordUserId, password);
    } else {
      this.store[creds.discordUserId] = {
        absServerUrl: creds.absServerUrl,
        absApiToken: creds.absApiToken,
      };
    }
    this.persist();
  }

  delete(discordUserId: string): boolean {
    if (!this.store[discordUserId]) return false;
    delete this.store[discordUserId];
    this.passwordCache.delete(discordUserId);
    this.persist();
    return true;
  }
}

export const userCredentialStore = new UserCredentialStore();
