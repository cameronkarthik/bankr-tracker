import { Message, EmbedBuilder } from 'discord.js';

export async function handleHelp(message: Message): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle('Base Launch Tracker - Commands')
    .setColor(0x0052FF)
    .setDescription('Track new token launches on Base chain.')
    .addFields(
      {
        name: '📊 !launches <timeframe> [sort]',
        value:
          'View recent token launches on Base.\n' +
          '**Timeframes:** `1h`, `6h`, `12h`, `24h`, `48h`\n' +
          '**Sort:** `vol` (default), `mcap`, `age`\n' +
          '**Example:** `!launches 24h mcap`',
        inline: false
      },
      {
        name: '🔥 !trending',
        value:
          'Show trending tokens on Base.\n' +
          'Ranked by volume and price change.',
        inline: false
      },
      {
        name: 'ℹ️ !info <contract>',
        value:
          'Get detailed info about a token.\n' +
          '**Example:** `!info 0x1234...`',
        inline: false
      },
      {
        name: '👀 !track [contract]',
        value:
          'Manage your personal watchlist.\n' +
          '`!track` - View your watchlist\n' +
          '`!track <contract>` - Add to watchlist\n' +
          '`!track remove <contract>` - Remove from watchlist',
        inline: false
      },
      {
        name: '🔔 !alert <contract> <condition>',
        value:
          'Set price/volume/mcap alerts.\n' +
          '`!alert` - View your alerts\n' +
          '`!alert 0x... price>0.001` - Create alert\n' +
          '`!alert 0x... mcap>1000000` - MCap alert\n' +
          '`!alert 0x... vol>50000` - Volume alert\n' +
          '`!alert delete <id>` - Delete alert\n' +
          '*Alerts are sent via DM when triggered.*',
        inline: false
      },
      {
        name: '❓ !help',
        value: 'Show this help message.',
        inline: false
      }
    )
    .setFooter({
      text: 'Base Launch Tracker | Powered by DexScreener'
    })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}
