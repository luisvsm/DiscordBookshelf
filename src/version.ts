import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const VERSION_FILE = resolve(process.cwd(), 'version.json');

/** Returns the current version string, or null if running on an untagged commit with no baked version. */
export function getGitVersion(): string | null {
  // Prefer the version baked in at Docker build time
  if (existsSync(VERSION_FILE)) {
    try {
      const version = (JSON.parse(readFileSync(VERSION_FILE, 'utf8')) as { version: string }).version;
      if (version) return version;
    } catch {
      // fall through
    }
  }

  // Fall back to git for local development
  try {
    return execSync('git describe --tags --exact-match', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}
