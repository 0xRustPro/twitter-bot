# Twitter Marketing Automation Tool

Node.js/TypeScript Twitter automation tool that bypasses anti-bot detection (Error 226).

## Features

- ✅ Auth via auth_token cookies (NOT OAuth login)
- ✅ Generate x-client-transaction-id headers
- ✅ Fetch ct0 CSRF via update_profile.json
- ✅ HTTP/2 support (with HTTP/1.1 fallback for proxies)
- ✅ Bypass Cloudflare + Error 226
- ✅ Enhanced residential proxy support with rotation, health tracking, and retry logic
- ✅ Token validation
- ✅ Scrapers (followers, following, likers, retweeters)
- ✅ Campaign system with quote tweet automation
- ✅ Basic actions (post, like, retweet, quote, reply, follow, DM)
- ✅ Warmup mode
- ✅ **Full TypeScript support**

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build TypeScript:
```bash
npm run build
```

3. Create input files:
- `tokens.txt` - One auth_token per line
- `users.txt` - One @username per line (for campaigns)
- `post_templates.txt` - Tweet templates (one per line)
- `proxies.txt` - Proxy format: `user:pass:host:port` (one per line, optional)

## Usage

### Token Validation
```bash
npm run validate
```

### Scrape Users
```bash
npm run scrape
```

### Run Campaign
```bash
npm run campaign
```

### Warmup Mode
```bash
npm run warmup
```

### Basic Actions
```bash
npm run action
```

## Development

Watch mode for development:
```bash
npm run dev
```

## Proxy Configuration

### Proxy Format

```
user:pass:host:port
```

Example:
```
myuser:mypass:proxy.example.com:8080
```

One proxy per line in `proxies.txt`

### Proxy Features

The proxy manager supports multiple rotation modes and automatic health tracking:

**Rotation Modes:**
- **`sticky`** (default): Each token gets a dedicated proxy that persists across requests
- **`random`**: Randomly selects a healthy proxy for each request
- **`round-robin`**: Cycles through proxies sequentially

**Health Tracking:**
- Automatically tracks proxy failures and successes
- Marks proxies as unhealthy after configurable failure threshold (default: 3 failures)
- Automatically retries unhealthy proxies after cooldown period (default: 5 minutes)
- Only uses healthy proxies for new requests

**Retry Logic:**
- Automatically retries failed requests with different proxies
- Retries on network errors, timeouts, and connection failures
- Configurable max retries (default: 2 retries)

**Usage:**
The proxy manager is automatically initialized when the client starts. Proxies are loaded from `proxies.txt` and used for all HTTP/1.1 requests (HTTP/2 is used for direct connections without proxies).

## Token Format

```
auth_token=YOUR_TOKEN_HERE
```

One token per line in `tokens.txt`

## TypeScript

The project is fully written in TypeScript with:
- Strict type checking
- Full type definitions
- Source maps for debugging
- Declaration files generated
