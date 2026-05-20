import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { UserCredentials } from '../abs/types';

type StoredEntry = Omit<UserCredentials, 'discordUserId'>;
type CredentialMap = Record<string, StoredEntry>;

const DATA_DIR = resolve(process.cwd(), 'data');
const FILE_PATH = resolve(DATA_DIR, 'users.json');

export class UserCredentialStore {
  private store: CredentialMap = {};

  constructor() {
    this.load();
  }

  private load(): void {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(FILE_PATH)) return;
    try {
      this.store = JSON.parse(readFileSync(FILE_PATH, 'utf8')) as CredentialMap;
    } catch {
      this.store = {};
    }
  }

  private persist(): void {
    writeFileSync(FILE_PATH, JSON.stringify(this.store, null, 2), 'utf8');
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
