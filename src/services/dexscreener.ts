import axios, { AxiosInstance } from 'axios';
import { DexScreenerPair, DexScreenerSearchResponse, DexScreenerBoost, TokenLaunch } from '../types';
import { config } from '../utils/config';

interface TokenProfile {
  chainId: string;
  tokenAddress: string;
  url: string;
  icon?: string;
  description?: string;
}

export class DexScreenerService {
  private client: AxiosInstance;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 500; // 500ms between requests

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

  // Common search terms to find new memecoins
  private readonly SEARCH_TERMS = [
    'ai', 'agent', 'gpt', 'trump', 'elon', 'musk',
    'dog', 'cat', 'frog', 'pepe', 'wojak',
    'moon', 'rocket', 'lambo', 'rich', 'based',
    'meme', 'degen', 'ape', 'chad', 'gigachad',
    'coin', 'token', 'inu', 'shib', 'floki',
  ];

  // Fetch latest token profiles and get their pairs
  async fetchBasePairs(): Promise<DexScreenerPair[]> {
    const allPairs: DexScreenerPair[] = [];
    const seenAddresses = new Set<string>();

    const addPairs = (pairs: DexScreenerPair[]) => {
      for (const pair of pairs) {
        const addr = pair.pairAddress.toLowerCase();
        if (!seenAddresses.has(addr)) {
          seenAddresses.add(addr);
          allPairs.push(pair);
        }
      }
    };

    // Strategy 1: Get latest token profiles (new listings)
    try {
      const profiles = await this.fetchLatestProfiles();
      const baseProfiles = profiles.filter(p => p.chainId === 'base');
      console.log(`Found ${baseProfiles.length} Base tokens from profiles`);

      if (baseProfiles.length > 0) {
        const tokenAddresses = baseProfiles.map(p => p.tokenAddress);
        const pairs = await this.fetchMultipleTokens(tokenAddresses);
        addPairs(pairs);
      }
    } catch (error) {
      console.error('Error fetching token profiles:', error);
    }

    // Strategy 2: Get boosted tokens (latest)
    try {
      const boosts = await this.fetchLatestBoosts();
      const baseBoosts = boosts.filter(b => b.chainId === 'base');
      console.log(`Found ${baseBoosts.length} Base tokens from latest boosts`);

      if (baseBoosts.length > 0) {
        const tokenAddresses = baseBoosts.map(b => b.tokenAddress);
        const pairs = await this.fetchMultipleTokens(tokenAddresses);
        addPairs(pairs);
      }
    } catch (error) {
      console.error('Error fetching boosts:', error);
    }

    // Strategy 3: Get top boosted tokens
    try {
      const topBoosts = await this.fetchTopBoosts();
      const baseTopBoosts = topBoosts.filter(b => b.chainId === 'base');
      console.log(`Found ${baseTopBoosts.length} Base tokens from top boosts`);

      if (baseTopBoosts.length > 0) {
        const tokenAddresses = baseTopBoosts.map(b => b.tokenAddress);
        const pairs = await this.fetchMultipleTokens(tokenAddresses);
        addPairs(pairs);
      }
    } catch (error) {
      console.error('Error fetching top boosts:', error);
    }

    // Strategy 4: Search for common memecoin terms
    console.log(`Searching ${this.SEARCH_TERMS.length} terms for new Base pairs...`);
    for (const term of this.SEARCH_TERMS) {
      try {
        const pairs = await this.searchPairs(term);
        const basePairs = pairs.filter(p => p.chainId === 'base');
        addPairs(basePairs);
      } catch (error) {
        // Continue with other terms
      }
    }

    console.log(`Total unique Base pairs found: ${allPairs.length}`);
    return allPairs;
  }

  async searchPairs(query: string): Promise<DexScreenerPair[]> {
    return this.retryWithBackoff(async () => {
      return this.rateLimitedRequest(async () => {
        const response = await this.client.get<DexScreenerSearchResponse>('/latest/dex/search', {
          params: { q: query },
        });
        return response.data.pairs || [];
      });
    });
  }

  async fetchTopBoosts(): Promise<DexScreenerBoost[]> {
    return this.retryWithBackoff(async () => {
      return this.rateLimitedRequest(async () => {
        const response = await this.client.get<DexScreenerBoost[]>('/token-boosts/top/v1');
        return response.data || [];
      });
    });
  }

  async fetchLatestProfiles(): Promise<TokenProfile[]> {
    return this.retryWithBackoff(async () => {
      return this.rateLimitedRequest(async () => {
        const response = await this.client.get<TokenProfile[]>('/token-profiles/latest/v1');
        return response.data || [];
      });
    });
  }

  async fetchMultipleTokens(tokenAddresses: string[]): Promise<DexScreenerPair[]> {
    if (tokenAddresses.length === 0) return [];

    // DexScreener allows fetching multiple tokens at once (comma-separated, max 30)
    // Split into batches of 30
    const batches: string[][] = [];
    for (let i = 0; i < tokenAddresses.length; i += 30) {
      batches.push(tokenAddresses.slice(i, i + 30));
    }

    const allPairs: DexScreenerPair[] = [];

    for (const batch of batches) {
      const addressList = batch.join(',');

      try {
        const pairs = await this.retryWithBackoff(async () => {
          return this.rateLimitedRequest(async () => {
            const response = await this.client.get<DexScreenerPair[]>(
              `/tokens/v1/base/${addressList}`
            );
            // Response is an array of pairs directly
            return Array.isArray(response.data) ? response.data : [];
          });
        });
        allPairs.push(...pairs);
      } catch (error) {
        console.error('Error fetching token batch:', error);
      }
    }

    return allPairs;
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

  // Blocklist of tokens we don't want (wrapped tokens, stablecoins, major tokens)
  private readonly BLOCKED_SYMBOLS = new Set([
    // Wrapped tokens
    'WETH', 'WBTC', 'WSOL', 'WMATIC', 'WAVAX', 'WBNB', 'WFTM',
    // Coinbase wrapped tokens
    'CBETH', 'CBBTC', 'CBTC', 'CBLTC', 'CBXRP', 'CBSOL', 'CBDOGE',
    // Other wrapped/bridged
    'RETH', 'STETH', 'WSTETH', 'TBTC', 'RENBTC', 'HBTC',
    // Stablecoins
    'USDC', 'USDT', 'DAI', 'BUSD', 'TUSD', 'USDP', 'GUSD', 'FRAX', 'LUSD', 'SUSD', 'USDD', 'USDBC', 'EURC', 'PYUSD',
    // Major tokens that aren't "new launches"
    'ETH', 'BTC', 'SOL', 'MATIC', 'AVAX', 'BNB', 'FTM', 'OP', 'ARB', 'LTC', 'XRP', 'DOGE', 'ADA', 'DOT',
    'LINK', 'UNI', 'AAVE', 'CRV', 'MKR', 'SNX', 'COMP', 'SUSHI', 'YFI', 'BAL',
    'PEPE', 'SHIB', 'FLOKI', 'BONK', 'WIF', 'BRETT', 'TOSHI', 'DEGEN',
  ]);

  private readonly BLOCKED_NAME_PATTERNS = [
    /^wrapped\s/i,
    /^bridged\s/i,
    /\bwrapped\b/i,
    /\bbridge[d]?\b/i,
    /^coinbase\s+wrapped/i,
    /^USD\s?Coin/i,
    /^Tether/i,
    /^cb[A-Z]/,  // Coinbase wrapped tokens like cbBTC, cbETH
  ];

  // Max market cap for "new launch" - anything above this is established
  private readonly MAX_MCAP_FOR_NEW_LAUNCH = 50_000_000; // $50M

  filterValidPairs(pairs: DexScreenerPair[]): DexScreenerPair[] {
    const now = Date.now();
    const minAgeMs = config.filters.minPairAgeMinutes * 60 * 1000;
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days

    return pairs.filter(pair => {
      // Must have basic info
      if (!pair.baseToken?.name || !pair.baseToken?.symbol) {
        return false;
      }

      const symbol = pair.baseToken.symbol.toUpperCase();
      const name = pair.baseToken.name;

      // Exclude blocked symbols (wrapped tokens, stablecoins, major tokens)
      if (this.BLOCKED_SYMBOLS.has(symbol)) {
        return false;
      }

      // Exclude blocked name patterns
      if (this.BLOCKED_NAME_PATTERNS.some(pattern => pattern.test(name))) {
        return false;
      }

      // Must have a creation timestamp
      if (!pair.pairCreatedAt) {
        return false;
      }

      const ageMs = now - pair.pairCreatedAt;

      // Must be at least 5 minutes old (avoid failed launches)
      if (ageMs < minAgeMs) {
        return false;
      }

      // Must be less than 48 hours old (only new launches)
      if (ageMs > maxAgeMs) {
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

      // Check market cap - too high means established token, not a new launch
      const marketCap = pair.marketCap || pair.fdv || 0;
      if (marketCap > this.MAX_MCAP_FOR_NEW_LAUNCH) {
        return false;
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
