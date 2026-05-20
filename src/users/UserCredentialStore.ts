import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { UserCredentials } from '../abs/types';

type StoredEntry = Omit<UserCredentials, 'discordUserId'>;
type CredentialMap = Record<string, StoredEntry>;

const DEFAULT_FILE_PATH = resolve(process.cwd(), 'data', 'users.json');

export class UserCredentialStore {
  private store: CredentialMap = {};

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

  get(discordUserId: string): UserCredentials | undefined {
    const entry = this.store[discordUserId];
    if (!entry) return undefined;
    return { discordUserId, ...entry };
  }

  set(creds: UserCredentials): void {
    this.store[creds.discordUserId] = {
      absServerUrl: creds.absServerUrl,
      absApiToken: creds.absApiToken,
    };
    this.persist();
  }

  delete(discordUserId: string): boolean {
    if (!this.store[discordUserId]) return false;
    delete this.store[discordUserId];
    this.persist();
    return true;
  }
}

export const userCredentialStore = new UserCredentialStore();
