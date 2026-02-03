import { Message, EmbedBuilder } from 'discord.js';
import { LaunchStore } from '../../database/store';
import { formatUsd, formatPrice, truncateAddress } from '../../utils/formatters';

type ConditionType = 'price' | 'volume' | 'mcap';
type Operator = '>' | '<' | '=';

interface ParsedCondition {
  type: ConditionType;
  operator: Operator;
  threshold: number;
}

export async function handleAlert(message: Message, args: string[], store: LaunchStore): Promise<void> {
  if (args.length === 0) {
    await showAlerts(message, store);
    return;
  }

  const subcommand = args[0].toLowerCase();

  // Handle list command
  if (subcommand === 'list') {
    await showAlerts(message, store);
    return;
  }

  // Handle delete command
  if (subcommand === 'delete' || subcommand === 'rm' || subcommand === 'remove') {
    if (args.length < 2) {
      await message.reply('**Usage:** `!alert delete <alert_id>`');
      return;
    }
    await deleteAlert(message, args[1], store);
    return;
  }

  // Create new alert: !alert <contract> <condition>
  if (args.length < 2) {
    await showAlertHelp(message);
    return;
  }

  await createAlert(message, args[0], args.slice(1).join(''), store);
}

async function showAlerts(message: Message, store: LaunchStore): Promise<void> {
  const alerts = store.getUserAlerts(message.author.id);

  if (alerts.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('Your Alerts')
      .setDescription('You have no alerts set.\n\n' +
        '**Usage:** `!alert <contract> <condition>`\n' +
        '**Example:** `!alert 0x123... price>0.001`')
      .setColor(0x0052FF)
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    return;
  }

  let description = '';

  for (const alert of alerts) {
    const launch = store.getLaunchByToken(alert.tokenAddress);
    const tokenName = launch ? `${launch.name} (${launch.symbol})` : truncateAddress(alert.tokenAddress);
    const status = alert.triggered ? '✅ Triggered' : '⏳ Active';

    const conditionStr = formatCondition(alert.conditionType, alert.operator, alert.threshold);

    description += `**ID: ${alert.id}** - ${status}\n`;
    description += `Token: ${tokenName}\n`;
    description += `Condition: ${conditionStr}\n\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle('Your Alerts')
    .setDescription(description)
    .setColor(0x0052FF)
    .setFooter({ text: `${alerts.length} alerts | Use !alert delete <id> to remove` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function createAlert(message: Message, tokenAddress: string, conditionStr: string, store: LaunchStore): Promise<void> {
  // Validate address
  if (!isValidAddress(tokenAddress)) {
    await message.reply('Invalid contract address. Please provide a valid Ethereum address.');
    return;
  }

  // Parse condition
  const condition = parseCondition(conditionStr);
  if (!condition) {
    await showAlertHelp(message);
    return;
  }

  // Create alert
  const alertId = store.createAlert(
    message.author.id,
    tokenAddress,
    condition.type,
    condition.operator,
    condition.threshold
  );

  const launch = store.getLaunchByToken(tokenAddress.toLowerCase());
  const tokenName = launch ? `${launch.name} (${launch.symbol})` : truncateAddress(tokenAddress);

  const embed = new EmbedBuilder()
    .setTitle('Alert Created')
    .setDescription(`Alert set for **${tokenName}**`)
    .addFields(
      { name: 'Alert ID', value: `${alertId}`, inline: true },
      { name: 'Condition', value: formatCondition(condition.type, condition.operator, condition.threshold), inline: true }
    )
    .setColor(0x00FF00)
    .setFooter({ text: "You'll receive a DM when this alert triggers" })
    .setTimestamp();

  if (launch) {
    embed.addFields(
      { name: 'Current Price', value: formatPrice(launch.priceUsd), inline: true },
      { name: 'Current MCap', value: formatUsd(launch.marketCap), inline: true },
      { name: 'Current Volume', value: formatUsd(launch.volume24h), inline: true }
    );
  }

  await message.reply({ embeds: [embed] });
}

async function deleteAlert(message: Message, alertIdStr: string, store: LaunchStore): Promise<void> {
  const alertId = parseInt(alertIdStr, 10);

  if (isNaN(alertId)) {
    await message.reply('Invalid alert ID. Please provide a number.');
    return;
  }

  const deleted = store.deleteAlert(alertId, message.author.id);

  if (deleted) {
    await message.reply(`Alert #${alertId} has been deleted.`);
  } else {
    await message.reply('Alert not found or you do not have permission to delete it.');
  }
}

async function showAlertHelp(message: Message): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle('Alert Command Help')
    .setDescription(
      '**Create an alert:**\n' +
      '`!alert <contract_address> <condition>`\n\n' +
      '**Condition formats:**\n' +
      '• `price>0.001` - Price above $0.001\n' +
      '• `price<0.0005` - Price below $0.0005\n' +
      '• `mcap>1000000` - Market cap above $1M\n' +
      '• `vol>100000` - 24h volume above $100K\n\n' +
      '**Other commands:**\n' +
      '• `!alert` or `!alert list` - View your alerts\n' +
      '• `!alert delete <id>` - Delete an alert'
    )
    .setColor(0x0052FF)
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

function parseCondition(input: string): ParsedCondition | null {
  // Remove spaces and lowercase
  const cleaned = input.replace(/\s/g, '').toLowerCase();

  // Match patterns like "price>0.001", "mcap<1000000", "vol>50000"
  const match = cleaned.match(/^(price|mcap|vol|volume|marketcap)([><]=?)(\d+\.?\d*)$/);

  if (!match) {
    return null;
  }

  let type: ConditionType;
  switch (match[1]) {
    case 'price':
      type = 'price';
      break;
    case 'mcap':
    case 'marketcap':
      type = 'mcap';
      break;
    case 'vol':
    case 'volume':
      type = 'volume';
      break;
    default:
      return null;
  }

  let operator: Operator;
  switch (match[2]) {
    case '>':
    case '>=':
      operator = '>';
      break;
    case '<':
    case '<=':
      operator = '<';
      break;
    case '=':
      operator = '=';
      break;
    default:
      return null;
  }

  const threshold = parseFloat(match[3]);
  if (isNaN(threshold) || threshold < 0) {
    return null;
  }

  return { type, operator, threshold };
}

function formatCondition(type: ConditionType, operator: Operator, threshold: number): string {
  const typeStr = type === 'price' ? 'Price' : type === 'mcap' ? 'Market Cap' : 'Volume';
  const thresholdStr = type === 'price' ? formatPrice(threshold) : formatUsd(threshold);
  return `${typeStr} ${operator} ${thresholdStr}`;
}

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
