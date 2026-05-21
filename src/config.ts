import 'dotenv/config';

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

export const config = {
  discordToken: requireEnv('DISCORD_TOKEN'),
  discordClientId: requireEnv('DISCORD_CLIENT_ID'),
  guildId: process.env.GUILD_ID ?? null,
  passwordTtlMs: (() => {
    const days = parseInt(process.env.PASSWORD_TTL_DAYS ?? '3', 10);
    return days === -1 ? -1 : days * 24 * 60 * 60 * 1000;
  })(),
  requireEncryption: process.env.REQUIRE_ENCRYPTION !== 'false',
};
