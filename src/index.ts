import { config } from './utils/config';
import { LaunchStore } from './database/store';
import { TokenTracker } from './services/tokenTracker';
import { AlertChecker } from './services/alertChecker';
import { DiscordBot } from './discord/bot';

let store: LaunchStore | null = null;
let tokenTracker: TokenTracker | null = null;
let alertChecker: AlertChecker | null = null;
let discordBot: DiscordBot | null = null;

async function main(): Promise<void> {
  console.log('='.repeat(50));
  console.log('Base Chain Launch Tracker');
  console.log('='.repeat(50));

  // Initialize database
  console.log(`Initializing database at: ${config.database.path}`);
  store = new LaunchStore(config.database.path);

  // Initialize Discord bot
  console.log('Initializing Discord bot...');
  discordBot = new DiscordBot(store);

  // Initialize token tracker
  console.log('Initializing token tracker...');
  tokenTracker = new TokenTracker(store);

  // Start Discord bot
  await discordBot.start(config.discord.token);

  // Wait for Discord to be ready before starting other services
  await new Promise<void>((resolve) => {
    const checkReady = setInterval(() => {
      if (discordBot?.isConnected()) {
        clearInterval(checkReady);
        resolve();
      }
    }, 100);
  });

  // Initialize alert checker (needs Discord client for DMs)
  console.log('Initializing alert checker...');
  alertChecker = new AlertChecker(store, discordBot.getClient());

  // Start polling and alert checking
  await tokenTracker.startPolling();
  alertChecker.startChecking(60000); // Check alerts every minute

  console.log('='.repeat(50));
  console.log('Bot is now running!');
  console.log('Commands: !launches, !trending, !info, !track, !alert, !help');
  console.log('='.repeat(50));
}

async function shutdown(): Promise<void> {
  console.log('\nShutting down gracefully...');

  if (alertChecker) {
    alertChecker.stopChecking();
  }

  if (tokenTracker) {
    tokenTracker.stopPolling();
  }

  if (discordBot) {
    await discordBot.stop();
  }

  if (store) {
    store.close();
  }

  console.log('Shutdown complete.');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown();
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// Start the application
main().catch((error) => {
  console.error('Failed to start:', error);
  process.exit(1);
});
