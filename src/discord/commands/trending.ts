import { Message, EmbedBuilder } from 'discord.js';
import { LaunchStore } from '../../database/store';
import { dexScreenerService } from '../../services/dexscreener';
import { TokenLaunch } from '../../types';
import { formatUsd, formatPrice, formatPercent, truncateAddress } from '../../utils/formatters';

export async function handleTrending(message: Message, args: string[], store: LaunchStore): Promise<void> {
  if ('sendTyping' in message.channel) {
    await message.channel.sendTyping();
  }

  // Get trending from local data
  const localTrending = store.getTrendingLaunches(10);

  // Also try to get boosted tokens from DexScreener
  let boostedTokens: string[] = [];
  try {
    const boosts = await dexScreenerService.fetchLatestBoosts();
    boostedTokens = boosts.map(b => b.tokenAddress.toLowerCase());
  } catch (error) {
    console.error('Error fetching boosts:', error);
  }

  if (localTrending.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('Trending on Base')
      .setDescription('No trending tokens found at the moment. Check back later!')
      .setColor(0x0052FF)
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    return;
  }

  // Mark boosted tokens
  const trending = localTrending.map(launch => ({
    ...launch,
    isBoosted: boostedTokens.includes(launch.tokenAddress.toLowerCase())
  }));

  const embed = buildTrendingEmbed(trending);
  await message.reply({ embeds: [embed] });
}

interface TrendingLaunch extends TokenLaunch {
  isBoosted: boolean;
}

function buildTrendingEmbed(trending: TrendingLaunch[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('🔥 Trending on Base')
    .setColor(0xFF6B00) // Orange for trending
    .setTimestamp();

  let description = '';

  for (let i = 0; i < trending.length; i++) {
    const launch = trending[i];
    const rank = i + 1;

    const priceChangeEmoji = launch.priceChange24h >= 0 ? '📈' : '📉';
    const boostBadge = launch.isBoosted ? ' 🚀' : '';

    description += `**${rank}. ${launch.name} (${launch.symbol})${boostBadge}**\n`;
    description += `💰 MCap: ${formatUsd(launch.marketCap)} | 📊 Vol: ${formatUsd(launch.volume24h)}\n`;
    description += `💵 ${formatPrice(launch.priceUsd)} | ${priceChangeEmoji} ${formatPercent(launch.priceChange24h)}\n`;
    description += `🔗 [DexScreener](${launch.dexscreenerUrl}) | \`${truncateAddress(launch.tokenAddress, 8, 6)}\`\n\n`;
  }

  if (description.length > 4000) {
    description = description.substring(0, 3990) + '\n...';
  }

  embed.setDescription(description);

  embed.setFooter({
    text: `Top ${trending.length} by volume × price change | 🚀 = Boosted on DexScreener`
  });

  return embed;
}
