import { Client, GatewayIntentBits, Message, Events } from 'discord.js';
import { LaunchStore } from '../database/store';
import { handleLaunches } from './commands/launches';
import { handleTrack } from './commands/track';
import { handleAlert } from './commands/alert';
import { handleInfo } from './commands/info';
import { handleTrending } from './commands/trending';
import { handleHelp } from './commands/help';

const COMMAND_PREFIX = '!';

export class DiscordBot {
  private client: Client;
  private store: LaunchStore;
  private isReady: boolean = false;

  constructor(store: LaunchStore) {
    this.store = store;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once(Events.ClientReady, (client) => {
      console.log(`Discord bot logged in as ${client.user.tag}`);
      this.isReady = true;
    });

    this.client.on(Events.MessageCreate, async (message) => {
      await this.handleMessage(message);
    });

    this.client.on(Events.Error, (error) => {
      console.error('Discord client error:', error);
    });
  }

  private async handleMessage(message: Message): Promise<void> {
    // Ignore bot messages
    if (message.author.bot) return;

    // Check for command prefix
    if (!message.content.startsWith(COMMAND_PREFIX)) return;

    // Parse command and args
    const args = message.content.slice(COMMAND_PREFIX.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();

    if (!command) return;

    try {
      switch (command) {
        case 'launches':
        case 'launch':
        case 'l':
          await handleLaunches(message, args, this.store);
          break;

        case 'track':
        case 'watchlist':
        case 'watch':
        case 'w':
          await handleTrack(message, args, this.store);
          break;

        case 'alert':
        case 'alerts':
        case 'a':
          await handleAlert(message, args, this.store);
          break;

        case 'info':
        case 'i':
        case 'token':
          await handleInfo(message, args, this.store);
          break;

        case 'trending':
        case 'trend':
        case 't':
          await handleTrending(message, args, this.store);
          break;

        case 'help':
        case 'h':
        case 'commands':
          await handleHelp(message);
          break;

        default:
          // Unknown command - don't respond to avoid spam
          break;
      }
    } catch (error) {
      console.error(`Error handling command "${command}":`, error);

      try {
        await message.reply('An error occurred while processing your command. Please try again.');
      } catch (replyError) {
        console.error('Failed to send error message:', replyError);
      }
    }
  }

  async start(token: string): Promise<void> {
    console.log('Starting Discord bot...');
    await this.client.login(token);
  }

  async stop(): Promise<void> {
    console.log('Stopping Discord bot...');
    this.client.destroy();
    this.isReady = false;
  }

  getClient(): Client {
    return this.client;
  }

  isConnected(): boolean {
    return this.isReady;
  }
}
