import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface Config {
  discord: {
    token: string;
    channelId?: string;
  };
  dexscreener: {
    apiKey?: string;
    baseUrl: string;
  };
  database: {
    path: string;
  };
  polling: {
    intervalMs: number;
  };
  filters: {
    minLiquidityUsd: number;
    minVolumeUsd: number;
    minPairAgeMinutes: number;
  };
}

function getEnvVar(key: string, required: boolean = false): string | undefined {
  const value = process.env[key];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function loadConfig(): Config {
  return {
    discord: {
      token: getEnvVar('DISCORD_BOT_TOKEN', true)!,
      channelId: getEnvVar('DISCORD_CHANNEL_ID'),
    },
    dexscreener: {
      apiKey: getEnvVar('DEXSCREENER_API_KEY'),
      baseUrl: 'https://api.dexscreener.com',
    },
    database: {
      path: getEnvVar('DATABASE_PATH') || './data/launches.db',
    },
    polling: {
      intervalMs: getEnvNumber('POLL_INTERVAL_MS', 30000),
    },
    filters: {
      minLiquidityUsd: getEnvNumber('MIN_LIQUIDITY_USD', 1000),
      minVolumeUsd: getEnvNumber('MIN_VOLUME_USD', 500),
      minPairAgeMinutes: getEnvNumber('MIN_PAIR_AGE_MINUTES', 5),
    },
  };
}

export const config = loadConfig();
