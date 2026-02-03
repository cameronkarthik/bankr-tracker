import { formatDistanceToNow } from 'date-fns';

/**
 * Format USD amount with appropriate suffix (K, M, B)
 */
export function formatUsd(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '$0';
  }

  const absAmount = Math.abs(amount);

  if (absAmount >= 1_000_000_000) {
    return `$${(amount / 1_000_000_000).toFixed(2)}B`;
  }
  if (absAmount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (absAmount >= 1_000) {
    return `$${(amount / 1_000).toFixed(2)}K`;
  }
  if (absAmount >= 1) {
    return `$${amount.toFixed(2)}`;
  }

  // For small decimals, show more precision
  return `$${amount.toFixed(6)}`;
}

/**
 * Format price with appropriate decimal places
 */
export function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined || isNaN(price)) {
    return '$0';
  }

  if (price >= 1) {
    return `$${price.toFixed(2)}`;
  }
  if (price >= 0.0001) {
    return `$${price.toFixed(6)}`;
  }

  // For very small prices, use scientific notation or more decimals
  return `$${price.toFixed(10)}`;
}

/**
 * Format age from timestamp to human-readable
 */
export function formatAge(timestampMs: number): string {
  const now = Date.now();
  const diffMs = now - timestampMs;

  if (diffMs < 0) {
    return 'just now';
  }

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    const remainingHours = diffHours % 24;
    return remainingHours > 0 ? `${diffDays}d ${remainingHours}h` : `${diffDays}d`;
  }

  if (diffHours > 0) {
    const remainingMinutes = diffMinutes % 60;
    return remainingMinutes > 0 ? `${diffHours}h ${remainingMinutes}m` : `${diffHours}h`;
  }

  return `${diffMinutes}m`;
}

/**
 * Format age using date-fns (alternative)
 */
export function formatAgeRelative(timestampMs: number): string {
  return formatDistanceToNow(new Date(timestampMs), { addSuffix: true });
}

/**
 * Truncate Ethereum address
 */
export function truncateAddress(address: string, startChars: number = 6, endChars: number = 4): string {
  if (!address || address.length <= startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Format percentage change
 */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0%';
  }
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Format large numbers with commas
 */
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) {
    return '0';
  }
  return num.toLocaleString('en-US');
}
