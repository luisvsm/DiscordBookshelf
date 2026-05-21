import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { registerCommands } from './registerCommands';
import { getGitVersion } from './version';

const VERSION_FILE = resolve(process.cwd(), 'data', 'deployed-version.json');

function readDeployedVersion(): string | null {
  if (!existsSync(VERSION_FILE)) return null;
  try {
    return (JSON.parse(readFileSync(VERSION_FILE, 'utf8')) as { version: string }).version;
  } catch {
    return null;
  }
}

function writeDeployedVersion(version: string): void {
  const dir = dirname(VERSION_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(VERSION_FILE, JSON.stringify({ version }, null, 2), 'utf8');
}

export async function checkCommandDeployment(): Promise<void> {
  const version = getGitVersion();
  if (!version) {
    console.log('No git tag on current commit — skipping automatic command deployment.');
    return;
  }

  const deployed = readDeployedVersion();
  if (deployed === version) {
    console.log(`Commands already deployed for ${version}.`);
    return;
  }

  console.log(`Deploying commands for ${version} (previously: ${deployed ?? 'none'})…`);
  await registerCommands();
  writeDeployedVersion(version);
}
