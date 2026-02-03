import { Message, EmbedBuilder } from 'discord.js';
import { LaunchStore } from '../../database/store';
import { SortOption, TokenLaunch } from '../../types';
import { formatUsd, formatPrice, formatAge, truncateAddress, formatPercent } from '../../utils/formatters';

const TIMEFRAME_MAP: Record<string, number> = {
  '1h': 1,
  '6h': 6,
  '12h': 12,
  '24h': 24,
  '48h': 48,
};

const SORT_MAP: Record<string, SortOption> = {
  'vol': 'volume',
  'volume': 'volume',
  'mcap': 'mcap',
  'marketcap': 'mcap',
  'age': 'age',
};

export async function handleLaunches(message: Message, args: string[], store: LaunchStore): Promise<void> {
  // Parse timeframe
  const timeframeArg = args[0]?.toLowerCase();
  if (!timeframeArg || !TIMEFRAME_MAP[timeframeArg]) {
    await message.reply({
      content: '**Usage:** `!launches <timeframe> [sort]`\n' +
        '**Timeframes:** `1h`, `6h`, `12h`, `24h`, `48h`\n' +
        '**Sort options:** `vol`, `mcap`, `age` (default: vol)',
    });
    return;
  }

  const timeframeHours = TIMEFRAME_MAP[timeframeArg];

  // Parse sort option
  const sortArg = args[1]?.toLowerCase();
  const sortBy: SortOption = sortArg && SORT_MAP[sortArg] ? SORT_MAP[sortArg] : 'volume';

  // Fetch launches
  const launches = store.getLaunches(timeframeHours, sortBy, 15);

  if (launches.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle(`Base Chain Launches - Last ${timeframeArg}`)
      .setDescription('No launches found matching the criteria.')
      .setColor(0x0052FF) // Base chain blue
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    return;
  }

  // Build embed
  const embed = buildLaunchesEmbed(launches, timeframeArg, sortBy);
  await message.reply({ embeds: [embed] });
}

function buildLaunchesEmbed(launches: TokenLaunch[], timeframe: string, sortBy: SortOption): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`Base Chain Launches - Last ${timeframe}`)
    .setColor(0x0052FF) // Base chain blue
    .setTimestamp();

  // Build description with launches
  let description = '';

  for (let i = 0; i < launches.length; i++) {
    const launch = launches[i];
    const rank = i + 1;

    const priceChangeEmoji = launch.priceChange24h >= 0 ? '📈' : '📉';
    const priceChange = formatPercent(launch.priceChange24h);

    description += `**${rank}. ${launch.name} (${launch.symbol})**\n`;
    description += `💰 MCap: ${formatUsd(launch.marketCap)} | 📊 Vol: ${formatUsd(launch.volume24h)}\n`;
    description += `💵 Price: ${formatPrice(launch.priceUsd)} | ${priceChangeEmoji} ${priceChange}\n`;
    description += `⏰ Age: ${formatAge(launch.pairCreatedAt)} | 💧 Liq: ${formatUsd(launch.liquidityUsd)}\n`;
    description += `🔗 [DexScreener](${launch.dexscreenerUrl}) | DEX: ${launch.dexId}\n`;
    description += `\`${truncateAddress(launch.tokenAddress, 10, 8)}\`\n\n`;
  }

  // Discord embed description limit is 4096 characters
  if (description.length > 4000) {
    description = description.substring(0, 3990) + '\n...';
  }

  embed.setDescription(description);

  // Footer with metadata
  const sortLabel = sortBy === 'volume' ? 'Volume' : sortBy === 'mcap' ? 'Market Cap' : 'Age';
  embed.setFooter({
    text: `Showing top ${launches.length} results | Sorted by: ${sortLabel}`,
  });

  return embed;
}
