import { Client, User } from 'discord.js';
import { LaunchStore } from '../database/store';
import { Alert, TokenLaunch } from '../types';
import { formatUsd, formatPrice, truncateAddress } from '../utils/formatters';

export class AlertChecker {
  private store: LaunchStore;
  private discordClient: Client;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(store: LaunchStore, discordClient: Client) {
    this.store = store;
    this.discordClient = discordClient;
  }

  startChecking(intervalMs: number = 60000): void {
    console.log(`Starting alert checker with ${intervalMs}ms interval`);

    // Initial check
    this.checkAlerts().catch(err => console.error('Alert check error:', err));

    // Set up interval
    this.checkInterval = setInterval(() => {
      this.checkAlerts().catch(err => console.error('Alert check error:', err));
    }, intervalMs);
  }

  stopChecking(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('Alert checker stopped');
  }

  private async checkAlerts(): Promise<void> {
    const activeAlerts = this.store.getActiveAlerts();

    if (activeAlerts.length === 0) {
      return;
    }

    console.log(`Checking ${activeAlerts.length} active alerts...`);

    for (const alert of activeAlerts) {
      try {
        const launch = this.store.getLaunchByToken(alert.tokenAddress);

        if (!launch) {
          continue;
        }

        const isTriggered = this.evaluateAlert(alert, launch);

        if (isTriggered) {
          await this.triggerAlert(alert, launch);
          this.store.markAlertTriggered(alert.id);
        }
      } catch (error) {
        console.error(`Error checking alert ${alert.id}:`, error);
      }
    }
  }

  private evaluateAlert(alert: Alert, launch: TokenLaunch): boolean {
    let currentValue: number;

    switch (alert.conditionType) {
      case 'price':
        currentValue = launch.priceUsd;
        break;
      case 'volume':
        currentValue = launch.volume24h;
        break;
      case 'mcap':
        currentValue = launch.marketCap;
        break;
      default:
        return false;
    }

    switch (alert.operator) {
      case '>':
        return currentValue > alert.threshold;
      case '<':
        return currentValue < alert.threshold;
      case '=':
        // For equality, use a small tolerance
        const tolerance = alert.threshold * 0.01; // 1% tolerance
        return Math.abs(currentValue - alert.threshold) <= tolerance;
      default:
        return false;
    }
  }

  private async triggerAlert(alert: Alert, launch: TokenLaunch): Promise<void> {
    try {
      const user = await this.discordClient.users.fetch(alert.userId);

      if (!user) {
        console.log(`Could not find user ${alert.userId} for alert ${alert.id}`);
        return;
      }

      const conditionStr = this.formatCondition(alert);
      const currentValue = this.getCurrentValue(alert, launch);

      const message = [
        `**Alert Triggered!**`,
        ``,
        `**Token:** ${launch.name} (${launch.symbol})`,
        `**Condition:** ${conditionStr}`,
        `**Current Value:** ${currentValue}`,
        ``,
        `**Price:** ${formatPrice(launch.priceUsd)}`,
        `**Market Cap:** ${formatUsd(launch.marketCap)}`,
        `**24h Volume:** ${formatUsd(launch.volume24h)}`,
        ``,
        `**Contract:** \`${truncateAddress(launch.tokenAddress)}\``,
        `**DexScreener:** ${launch.dexscreenerUrl}`,
      ].join('\n');

      await user.send(message);
      console.log(`Alert ${alert.id} triggered for user ${alert.userId}`);
    } catch (error: any) {
      if (error.code === 50007) {
        console.log(`Cannot DM user ${alert.userId} - DMs are closed`);
      } else {
        console.error(`Error sending alert DM:`, error);
      }
    }
  }

  private formatCondition(alert: Alert): string {
    const typeStr = alert.conditionType === 'mcap' ? 'Market Cap' :
                    alert.conditionType === 'price' ? 'Price' : '24h Volume';
    const thresholdStr = alert.conditionType === 'price'
      ? formatPrice(alert.threshold)
      : formatUsd(alert.threshold);

    return `${typeStr} ${alert.operator} ${thresholdStr}`;
  }

  private getCurrentValue(alert: Alert, launch: TokenLaunch): string {
    switch (alert.conditionType) {
      case 'price':
        return formatPrice(launch.priceUsd);
      case 'volume':
        return formatUsd(launch.volume24h);
      case 'mcap':
        return formatUsd(launch.marketCap);
      default:
        return 'N/A';
    }
  }
}
