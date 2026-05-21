import { registerCommands } from './registerCommands';

registerCommands().catch((err) => {
  console.error('Failed to register commands:', err);
  process.exit(1);
});
