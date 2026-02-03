import axios, { AxiosInstance } from 'axios';
import { DexScreenerPair, DexScreenerSearchResponse, DexScreenerBoost, TokenLaunch } from '../types';
import { config } from '../utils/config';

export class DexScreenerService {
  private client: AxiosInstance;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 1000; // 1 second between requests

  constructor() {
    this.client = axios.create({
      baseURL: config.dexscreener.baseUrl,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        ...(config.dexscreener.apiKey && { 'X-API-KEY': config.dexscreener.apiKey }),
      },
    });
  }

  private async rateLimitedRequest<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
    }

    this.lastRequestTime = Date.now();
    return fn();
  }

  private async retryWithBackoff<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        console.error(`Request failed (attempt ${attempt + 1}/${maxRetries}):`, error.message);

        if (attempt < maxRetries - 1) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    throw lastError;
  }

  async fetchBasePairs(): Promise<DexScreenerPair[]> {
    return this.retryWithBackoff(async () => {
      return this.rateLimitedRequest(async () => {
        const response = await this.client.get<DexScreenerSearchResponse>('/latest/dex/search', {
          params: { q: 'base' },
        });

        // Filter to only Base chain pairs
        const basePairs = (response.data.pairs || []).filter(
          pair => pair.chainId === 'base'
        );

        return basePairs;
      });
    });
  }

  async fetchPairByAddress(pairAddress: string): Promise<DexScreenerPair | null> {
    return this.retryWithBackoff(async () => {
      return this.rateLimitedRequest(async () => {
        try {
          const response = await this.client.get<{ pairs: DexScreenerPair[] }>(
            `/latest/dex/pairs/base/${pairAddress}`
          );
          return response.data.pairs?.[0] || null;
        } catch (error: any) {
          if (error.response?.status === 404) {
            return null;
          }
          throw error;
        }
      });
    });
  }

  async fetchTokenPairs(tokenAddress: string): Promise<DexScreenerPair[]> {
    return this.retryWithBackoff(async () => {
      return this.rateLimitedRequest(async () => {
        const response = await this.client.get<{ pairs: DexScreenerPair[] }>(
          `/token-pairs/v1/base/${tokenAddress}`
        );
        return response.data.pairs || [];
      });
    });
  }

  async fetchLatestBoosts(): Promise<DexScreenerBoost[]> {
    return this.retryWithBackoff(async () => {
      return this.rateLimitedRequest(async () => {
        const response = await this.client.get<DexScreenerBoost[]>('/token-boosts/latest/v1');
        // Filter to Base chain only
        return (response.data || []).filter(boost => boost.chainId === 'base');
      });
    });
  }

  filterValidPairs(pairs: DexScreenerPair[]): DexScreenerPair[] {
    const now = Date.now();
    const minAgeMs = config.filters.minPairAgeMinutes * 60 * 1000;

    return pairs.filter(pair => {
      // Must have basic info
      if (!pair.baseToken?.name || !pair.baseToken?.symbol) {
        return false;
      }

      // Check liquidity
      const liquidity = pair.liquidity?.usd || 0;
      if (liquidity < config.filters.minLiquidityUsd) {
        return false;
      }

      // Check volume
      const volume = pair.volume?.h24 || 0;
      if (volume < config.filters.minVolumeUsd) {
        return false;
      }

      // Check pair age (must be at least 5 minutes old)
      if (pair.pairCreatedAt) {
        const ageMs = now - pair.pairCreatedAt;
        if (ageMs < minAgeMs) {
          return false;
        }
      }

      return true;
    });
  }

  pairToLaunch(pair: DexScreenerPair): TokenLaunch {
    return {
      pairAddress: pair.pairAddress.toLowerCase(),
      tokenAddress: pair.baseToken.address.toLowerCase(),
      name: pair.baseToken.name,
      symbol: pair.baseToken.symbol,
      dexId: pair.dexId,
      priceUsd: parseFloat(pair.priceUsd || '0'),
      marketCap: pair.marketCap || pair.fdv || 0,
      volume24h: pair.volume?.h24 || 0,
      liquidityUsd: pair.liquidity?.usd || 0,
      priceChange24h: pair.priceChange?.h24 || 0,
      pairCreatedAt: pair.pairCreatedAt || Date.now(),
      dexscreenerUrl: pair.url,
      lastUpdated: Date.now(),
    };
  }
}

export const dexScreenerService = new DexScreenerService();
