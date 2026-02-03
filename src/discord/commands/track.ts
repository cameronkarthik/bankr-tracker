import { Message, EmbedBuilder } from 'discord.js';
import { LaunchStore } from '../../database/store';
import { dexScreenerService } from '../../services/dexscreener';
import { formatUsd, formatPrice, truncateAddress } from '../../utils/formatters';

export async function handleTrack(message: Message, args: string[], store: LaunchStore): Promise<void> {
  if (args.length === 0) {
    await showWatchlist(message, store);
    return;
  }

  const subcommand = args[0].toLowerCase();

  // Handle remove command
  if (subcommand === 'remove' || subcommand === 'rm') {
    if (args.length < 2) {
      await message.reply('**Usage:** `!track remove <contract_address>`');
      return;
    }
    await removeFromWatchlist(message, args[1], store);
    return;
  }

  // Otherwise, treat as contract address to add
  await addToWatchlist(message, args[0], store);
}

async function showWatchlist(message: Message, store: LaunchStore): Promise<void> {
  const watchlist = store.getWatchlist(message.author.id);

  if (watchlist.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('Your Watchlist')
      .setDescription('Your watchlist is empty.\n\n**Usage:** `!track <contract_address>` to add a token.')
      .setColor(0x0052FF)
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    return;
  }

  let description = '';

  for (const entry of watchlist) {
    const launch = store.getLaunchByToken(entry.tokenAddress);

    if (launch) {
      description += `**${launch.name} (${launch.symbol})**\n`;
      description += `💰 MCap: ${formatUsd(launch.marketCap)} | 💵 ${formatPrice(launch.priceUsd)}\n`;
      description += `\`${truncateAddress(entry.tokenAddress)}\`\n\n`;
    } else {
      description += `**Unknown Token**\n`;
      description += `\`${truncateAddress(entry.tokenAddress)}\`\n\n`;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('Your Watchlist')
    .setDescription(description)
    .setColor(0x0052FF)
    .setFooter({ text: `${watchlist.length} tokens | Use !track remove <address> to remove` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function addToWatchlist(message: Message, tokenAddress: string, store: LaunchStore): Promise<void> {
  // Validate address format
  if (!isValidAddress(tokenAddress)) {
    await message.reply('Invalid contract address. Please provide a valid Ethereum address.');
    return;
  }

  const normalizedAddress = tokenAddress.toLowerCase();

  // Try to get token info
  let tokenName = 'Unknown Token';
  let tokenSymbol = '???';
  let launch = store.getLaunchByToken(normalizedAddress);

  if (!launch) {
    // Try to fetch from DexScreener
    try {
      const pairs = await dexScreenerService.fetchTokenPairs(normalizedAddress);
      if (pairs.length > 0) {
        const pair = pairs[0];
        tokenName = pair.baseToken.name;
        tokenSymbol = pair.baseToken.symbol;
      }
    } catch (error) {
      console.error('Error fetching token info:', error);
    }
  } else {
    tokenName = launch.name;
    tokenSymbol = launch.symbol;
  }

  // Add to watchlist
  const added = store.addToWatchlist(message.author.id, normalizedAddress);

  if (added) {
    const embed = new EmbedBuilder()
      .setTitle('Added to Watchlist')
      .setDescription(`**${tokenName} (${tokenSymbol})** has been added to your watchlist.`)
      .addFields(
        { name: 'Contract', value: `\`${truncateAddress(normalizedAddress)}\``, inline: true }
      )
      .setColor(0x00FF00)
      .setTimestamp();

    if (launch) {
      embed.addFields(
        { name: 'Price', value: formatPrice(launch.priceUsd), inline: true },
        { name: 'Market Cap', value: formatUsd(launch.marketCap), inline: true }
      );
    }

    await message.reply({ embeds: [embed] });
  } else {
    await message.reply('This token is already in your watchlist.');
  }
}

async function removeFromWatchlist(message: Message, tokenAddress: string, store: LaunchStore): Promise<void> {
  if (!isValidAddress(tokenAddress)) {
    await message.reply('Invalid contract address.');
    return;
  }

  const removed = store.removeFromWatchlist(message.author.id, tokenAddress.toLowerCase());

  if (removed) {
    await message.reply(`Token \`${truncateAddress(tokenAddress)}\` removed from your watchlist.`);
  } else {
    await message.reply('Token not found in your watchlist.');
  }
}

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
