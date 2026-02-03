import { Message, EmbedBuilder } from 'discord.js';
import { LaunchStore } from '../../database/store';
import { SortOption, TokenLaunch } from '../../types';
import { formatUsd, formatPrice, formatAge, truncateAddress, formatPercent } from '../../utils/formatters';

// Parse timeframe like "1h", "30m", "2d", "12h", etc.
function parseTimeframe(input: string): number | null {
  const match = input.toLowerCase().match(/^(\d+(?:\.\d+)?)(m|h|d)$/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = match[2];

  switch (unit) {
    case 'm': return value / 60; // minutes to hours
    case 'h': return value;       // hours
    case 'd': return value * 24;  // days to hours
    default: return null;
  }
}

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
  const timeframeHours = timeframeArg ? parseTimeframe(timeframeArg) : null;

  if (!timeframeArg || timeframeHours === null || timeframeHours <= 0 || timeframeHours > 168) {
    await message.reply({
      content: '**Usage:** `!launches <timeframe> [sort]`\n' +
        '**Timeframes:** Any duration like `30m`, `1h`, `6h`, `2d` (max 7d)\n' +
        '**Sort options:** `vol`, `mcap`, `age` (default: vol)\n' +
        '**Examples:** `!launches 1h`, `!launches 30m mcap`, `!launches 2d vol`',
    });
    return;
  }

  // Parse sort option
  const sortArg = args[1]?.toLowerCase();
  const sortBy: SortOption = sortArg && SORT_MAP[sortArg] ? SORT_MAP[sortArg] : 'volume';

  // Fetch launches
  const launches = store.getLaunches(timeframeHours, sortBy, 15);

  // Format timeframe for display
  const timeframeDisplay = formatTimeframeDisplay(timeframeHours);

  if (launches.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle(`Base Chain Launches - Last ${timeframeDisplay}`)
      .setDescription('No launches found matching the criteria.')
      .setColor(0x0052FF) // Base chain blue
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    return;
  }

  // Build embed
  const embed = buildLaunchesEmbed(launches, timeframeDisplay, sortBy);
  await message.reply({ embeds: [embed] });
}

function formatTimeframeDisplay(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`;
  } else if (hours >= 24 && hours % 24 === 0) {
    return `${hours / 24}d`;
  } else {
    return `${hours}h`;
  }
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
