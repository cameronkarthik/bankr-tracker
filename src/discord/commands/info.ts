import { Message, EmbedBuilder } from 'discord.js';
import { LaunchStore } from '../../database/store';
import { dexScreenerService } from '../../services/dexscreener';
import { formatUsd, formatPrice, formatAge, truncateAddress, formatPercent } from '../../utils/formatters';

export async function handleInfo(message: Message, args: string[], store: LaunchStore): Promise<void> {
  if (args.length === 0) {
    await message.reply('**Usage:** `!info <contract_address>`\nGet detailed information about a token.');
    return;
  }

  const tokenAddress = args[0];

  // Validate address
  if (!isValidAddress(tokenAddress)) {
    await message.reply('Invalid contract address. Please provide a valid Ethereum address.');
    return;
  }

  // First check local database
  let launch = store.getLaunchByToken(tokenAddress.toLowerCase());

  // If not found locally, try to fetch from DexScreener
  if (!launch) {
    try {
      if ('sendTyping' in message.channel) {
        await message.channel.sendTyping();
      }
      const pairs = await dexScreenerService.fetchTokenPairs(tokenAddress);

      if (pairs.length > 0) {
        // Get the pair with highest volume
        const bestPair = pairs.reduce((best, current) => {
          const bestVol = best.volume?.h24 || 0;
          const currentVol = current.volume?.h24 || 0;
          return currentVol > bestVol ? current : best;
        });

        launch = dexScreenerService.pairToLaunch(bestPair);

        // Also try to get additional info from the pair
        const embed = buildInfoEmbed(launch, bestPair);
        await message.reply({ embeds: [embed] });
        return;
      }
    } catch (error) {
      console.error('Error fetching token info:', error);
    }

    await message.reply('Token not found. Make sure the contract address is correct and the token is traded on a Base chain DEX.');
    return;
  }

  // Build embed with local data
  const embed = buildInfoEmbed(launch, null);
  await message.reply({ embeds: [embed] });
}

function buildInfoEmbed(launch: any, pair: any): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`${launch.name} (${launch.symbol})`)
    .setColor(0x0052FF)
    .setTimestamp();

  // Price and changes
  const priceChangeEmoji = (launch.priceChange24h || 0) >= 0 ? '📈' : '📉';

  embed.addFields(
    { name: '💵 Price', value: formatPrice(launch.priceUsd), inline: true },
    { name: `${priceChangeEmoji} 24h Change`, value: formatPercent(launch.priceChange24h), inline: true },
    { name: '\u200b', value: '\u200b', inline: true }, // Spacer
    { name: '💰 Market Cap', value: formatUsd(launch.marketCap), inline: true },
    { name: '📊 24h Volume', value: formatUsd(launch.volume24h), inline: true },
    { name: '💧 Liquidity', value: formatUsd(launch.liquidityUsd), inline: true },
    { name: '⏰ Age', value: formatAge(launch.pairCreatedAt), inline: true },
    { name: '🏛️ DEX', value: launch.dexId || 'Unknown', inline: true },
    { name: '\u200b', value: '\u200b', inline: true } // Spacer
  );

  // Add price changes if available from pair data
  if (pair?.priceChange) {
    let changeText = '';
    if (pair.priceChange.h1 !== undefined) changeText += `1h: ${formatPercent(pair.priceChange.h1)}\n`;
    if (pair.priceChange.h6 !== undefined) changeText += `6h: ${formatPercent(pair.priceChange.h6)}\n`;
    if (pair.priceChange.h24 !== undefined) changeText += `24h: ${formatPercent(pair.priceChange.h24)}`;

    if (changeText) {
      embed.addFields({ name: '📊 Price Changes', value: changeText, inline: true });
    }
  }

  // Add volume breakdown if available
  if (pair?.volume) {
    let volText = '';
    if (pair.volume.h1 !== undefined) volText += `1h: ${formatUsd(pair.volume.h1)}\n`;
    if (pair.volume.h6 !== undefined) volText += `6h: ${formatUsd(pair.volume.h6)}\n`;
    if (pair.volume.h24 !== undefined) volText += `24h: ${formatUsd(pair.volume.h24)}`;

    if (volText) {
      embed.addFields({ name: '📈 Volume Breakdown', value: volText, inline: true });
    }
  }

  // Contract address
  embed.addFields({
    name: '📝 Contract Address',
    value: `\`${launch.tokenAddress}\``,
    inline: false
  });

  // Links
  let links = `[DexScreener](${launch.dexscreenerUrl})`;

  // Add social links if available
  if (pair?.info?.socials) {
    for (const social of pair.info.socials) {
      if (social.type === 'twitter') {
        links += ` | [Twitter](${social.url})`;
      } else if (social.type === 'telegram') {
        links += ` | [Telegram](${social.url})`;
      }
    }
  }

  if (pair?.info?.websites?.[0]) {
    links += ` | [Website](${pair.info.websites[0].url})`;
  }

  embed.addFields({ name: '🔗 Links', value: links, inline: false });

  // Footer
  embed.setFooter({
    text: `Pair: ${truncateAddress(launch.pairAddress)} | Base Chain`
  });

  // Add thumbnail if available
  if (pair?.info?.imageUrl) {
    embed.setThumbnail(pair.info.imageUrl);
  }

  return embed;
}

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
