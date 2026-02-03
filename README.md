# Base Chain Launch Tracker

A Discord bot that tracks new token launches on Base chain, providing real-time data via DexScreener API.

## Features

- **Launch Tracking**: View recent token launches sorted by volume, market cap, or age
- **Trending Tokens**: See what's hot on Base chain
- **Token Info**: Get detailed information about any token
- **Watchlist**: Track your favorite tokens
- **Price Alerts**: Set alerts for price, volume, or market cap changes

## Commands

| Command | Description |
|---------|-------------|
| `!launches <timeframe> [sort]` | View recent launches. Timeframes: `1h`, `6h`, `12h`, `24h`, `48h`. Sort: `vol`, `mcap`, `age` |
| `!trending` | Show trending tokens on Base |
| `!info <contract>` | Get detailed token information |
| `!track [contract]` | View or add to your watchlist |
| `!track remove <contract>` | Remove from watchlist |
| `!alert <contract> <condition>` | Set a price/volume/mcap alert |
| `!alert delete <id>` | Delete an alert |
| `!help` | Show all commands |

### Alert Conditions

- `price>0.001` - Price above $0.001
- `price<0.0005` - Price below $0.0005
- `mcap>1000000` - Market cap above $1M
- `vol>100000` - 24h volume above $100K

## Setup

### Prerequisites

- Node.js 18+
- A Discord bot token

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd bankr-tracker
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Edit `.env` with your Discord bot token:
```env
DISCORD_BOT_TOKEN=your_token_here
```

5. Build the project:
```bash
npm run build
```

6. Start the bot:
```bash
npm start
```

## Configuration

Edit `.env` to customize:

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_BOT_TOKEN` | Your Discord bot token | Required |
| `DATABASE_PATH` | SQLite database location | `./data/launches.db` |
| `POLL_INTERVAL_MS` | How often to fetch new data | `30000` (30s) |
| `MIN_LIQUIDITY_USD` | Minimum liquidity filter | `1000` |
| `MIN_VOLUME_USD` | Minimum volume filter | `500` |
| `MIN_PAIR_AGE_MINUTES` | Minimum pair age | `5` |

## Creating a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to "Bot" section and click "Add Bot"
4. Copy the bot token (keep it secret!)
5. Enable "Message Content Intent" under Privileged Gateway Intents
6. Go to "OAuth2" > "URL Generator"
7. Select scopes: `bot`
8. Select permissions: `Send Messages`, `Embed Links`, `Read Message History`
9. Copy the generated URL and open it to add the bot to your server

## Development

```bash
# Build and watch for changes
npm run dev

# Build only
npm run build

# Clean build directory
npm run clean
```

## Deployment

For production, use a process manager like PM2:

```bash
npm install -g pm2
pm2 start dist/index.js --name bankr-tracker
pm2 save
pm2 startup
```

Or use Docker:

```bash
docker build -t bankr-tracker .
docker run -d --env-file .env bankr-tracker
```

## Data Source

This bot uses the [DexScreener API](https://docs.dexscreener.com/) to fetch token data. The API is polled every 30 seconds (configurable) to get the latest Base chain pairs.

## License

MIT
