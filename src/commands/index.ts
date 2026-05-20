import { Collection } from 'discord.js';
import { Command } from './types';
import connect from './connect';
import disconnect from './disconnect';
import nowplaying from './nowplaying';
import pause from './pause';
import play from './play';
import resume from './resume';
import search from './search';
import seek from './seek';
import stop from './stop';

export const commands = new Collection<string, Command>();

for (const cmd of [connect, disconnect, play, pause, resume, stop, seek, search, nowplaying]) {
  commands.set(cmd.data.name, cmd);
}
