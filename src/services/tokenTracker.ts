import { dexScreenerService } from './dexscreener';
import { LaunchStore } from '../database/store';
import { config } from '../utils/config';

export class TokenTracker {
  private store: LaunchStore;
  private pollInterval: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;

  constructor(store: LaunchStore) {
    this.store = store;
  }

  async startPolling(): Promise<void> {
    if (this.isPolling) {
      console.log('Token tracker is already polling');
      return;
    }

    this.isPolling = true;
    console.log(`Starting token tracker with ${config.polling.intervalMs}ms interval`);

    // Initial fetch
    await this.poll();

    // Set up interval
    this.pollInterval = setInterval(() => {
      this.poll().catch(err => console.error('Polling error:', err));
    }, config.polling.intervalMs);
  }

  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isPolling = false;
    console.log('Token tracker stopped');
  }

  private async poll(): Promise<void> {
    try {
      console.log(`[${new Date().toISOString()}] Fetching Base pairs from DexScreener...`);

      // Fetch pairs from DexScreener
      const pairs = await dexScreenerService.fetchBasePairs();
      console.log(`Fetched ${pairs.length} Base pairs`);

      // Filter valid pairs
      const validPairs = dexScreenerService.filterValidPairs(pairs);
      console.log(`${validPairs.length} pairs pass filters`);

      // Convert to launches and store
      const launches = validPairs.map(pair => dexScreenerService.pairToLaunch(pair));
      this.store.upsertLaunches(launches);

      // Prune old data
      const pruned = this.store.pruneOldLaunches(48);
      if (pruned > 0) {
        console.log(`Pruned ${pruned} old launches`);
      }

      console.log(`[${new Date().toISOString()}] Poll complete. Stored ${launches.length} launches.`);
    } catch (error) {
      console.error('Error during polling:', error);
    }
  }

  async manualRefresh(): Promise<number> {
    await this.poll();
    return this.store.getLaunches(24, 'volume', 1000).length;
  }
}
