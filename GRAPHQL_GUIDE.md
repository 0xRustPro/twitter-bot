# Twitter GraphQL Endpoints Guide

## What is a GraphQL Endpoint?

Twitter uses **GraphQL** (Graph Query Language) for its internal API. Instead of traditional REST endpoints like `/api/users/123`, Twitter uses GraphQL operations with **operation hashes** (also called query IDs).

### Twitter's GraphQL URL Format

```
https://x.com/i/api/graphql/{OPERATION_HASH}/{OPERATION_NAME}?variables={JSON}
```

**Example:**
```
https://x.com/i/api/graphql/1VOOyvKkiI3FMmkeDNxM9A/UserByScreenName?variables={"screen_name":"elonmusk"}
```

### Components:

1. **Operation Hash** (`1VOOyvKkiI3FMmkeDNxM9A`): A unique identifier for the GraphQL query
   - Twitter changes these frequently (sometimes daily/weekly)
   - This is why your code might stop working suddenly

2. **Operation Name** (`UserByScreenName`): The name of the GraphQL operation
   - Examples: `CreateTweet`, `Followers`, `UserByScreenName`, `TweetDetail`

3. **Variables**: JSON-encoded parameters for the query

## How to Find Current GraphQL Hashes

### Method 1: Browser Developer Tools (Recommended)

1. **Open Twitter/X in your browser** (logged in)
2. **Open Developer Tools** (F12 or Right-click → Inspect)
3. **Go to Network tab**
4. **Filter by "graphql"** or "XHR"
5. **Perform the action you want to replicate:**
   - View a profile → Look for `UserByScreenName`
   - View followers → Look for `Followers`
   - Post a tweet → Look for `CreateTweet`
   - View a tweet → Look for `TweetDetail`
6. **Click on the request** → Check the URL in the "Headers" or "Request" tab
7. **Extract the hash** from the URL:
   ```
   https://x.com/i/api/graphql/1VOOyvKkiI3FMmkeDNxM9A/UserByScreenName
                                    ^^^^^^^^^^^^^^^^^^^^
                                    This is the hash!
   ```

### Method 2: Using Browser Console

1. Open Twitter/X in browser
2. Open Developer Tools → Console tab
3. Run this JavaScript to intercept GraphQL requests:
```javascript
// Intercept fetch requests
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const url = args[0];
  if (url && url.includes('/graphql/')) {
    console.log('GraphQL Request:', url);
    // Extract hash: /graphql/{HASH}/{OPERATION}
    const match = url.match(/\/graphql\/([^\/]+)\/([^?]+)/);
    if (match) {
      console.log('Hash:', match[1]);
      console.log('Operation:', match[2]);
    }
  }
  return originalFetch.apply(this, args);
};
```

### Method 3: Using Network Monitoring Tools

- **Burp Suite**: Intercept and log all requests
- **Charles Proxy**: Monitor HTTP/HTTPS traffic
- **mitmproxy**: Command-line tool for intercepting requests

## Common GraphQL Operations

| Operation Name | Purpose | Current Hash (Example) |
|---------------|---------|------------------------|
| `UserByScreenName` | Get user info by username | `1VOOyvKkiI3FMmkeDNxM9A` |
| `CreateTweet` | Post a new tweet | `f4NGXqNlXoGYCWploMNtlQ` |
| `Followers` | Get user's followers | `-` (uses `-` as hash) |
| `Following` | Get user's following | `-` (uses `-` as hash) |
| `TweetDetail` | Get tweet details | Varies |
| `UserTweets` | Get user's tweets | Varies |

**Note:** The hash `-` means Twitter uses a different method (often the operation name directly).

## Why Hashes Change

Twitter changes GraphQL hashes to:
- Prevent scraping/automation
- Update API versions
- Add new features
- Fix security issues

**Frequency:** Can change daily, weekly, or monthly. There's no fixed schedule.

## How to Handle Hash Changes in Your Code

### Strategy 1: Try Multiple Hashes
```typescript
const graphqlHashes = [
  '1VOOyvKkiI3FMmkeDNxM9A', // Current
  'G3KGOASz96M-Qu0nwmGXNg', // Previous
  'OLD_HASH_HERE'           // Older fallback
];

for (const hash of graphqlHashes) {
  try {
    const response = await makeRequest(`.../graphql/${hash}/...`);
    if (response.ok) break;
  } catch (e) {
    continue; // Try next hash
  }
}
```

### Strategy 2: Use Operation Name Only (if supported)
Some operations work with `-` as the hash:
```typescript
const url = `https://x.com/i/api/graphql/-/Followers?variables=...`;
```

### Strategy 3: Auto-Discovery
Periodically check Twitter's network requests to update hashes automatically.

## Finding Hashes for Specific Operations

### Get User Info (UserByScreenName)
1. Visit any Twitter profile: `https://twitter.com/username`
2. Check Network tab for request containing `UserByScreenName`
3. Extract hash from URL

### Get Followers
1. Visit a profile's followers page: `https://twitter.com/username/followers`
2. Check Network tab for request containing `Followers`
3. Extract hash (often uses `-`)

### Post Tweet (CreateTweet)
1. Compose a tweet (don't post it)
2. Check Network tab for `CreateTweet` request
3. Extract hash from URL

### Get Tweet Details
1. Open any tweet
2. Check Network tab for `TweetDetail` or similar
3. Extract hash

## Example: Finding UserByScreenName Hash

1. Go to `https://twitter.com/elonmusk`
2. Open DevTools → Network tab
3. Filter: `graphql` or search for `UserByScreenName`
4. Find request like:
   ```
   GET https://x.com/i/api/graphql/1VOOyvKkiI3FMmkeDNxM9A/UserByScreenName?variables=...
   ```
5. Copy the hash: `1VOOyvKkiI3FMmkeDNxM9A`

## Troubleshooting

### "404 Not Found" Error
- Hash is outdated → Find new hash using Method 1 above

### "403 Forbidden" Error
- Authentication issue → Check auth_token and ct0
- Bot detection → Add delays, use proxies

### "429 Rate Limit" Error
- Too many requests → Add delays between requests

## Tools to Help

- **Twitter API Reverse Engineering Tools**: Search GitHub for "twitter graphql hash"
- **Browser Extensions**: Some extensions can log GraphQL requests automatically
- **Scripts**: Write a script to monitor and log all GraphQL requests

## Important Notes

⚠️ **These are internal APIs** - Twitter doesn't officially support them
⚠️ **Hashes change frequently** - Your code may break without warning
⚠️ **Rate limiting applies** - Don't make too many requests
⚠️ **Terms of Service** - Using these APIs may violate Twitter's ToS
