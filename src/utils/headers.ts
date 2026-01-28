/**
 * Generate Twitter headers to bypass bot detection
 */

/**
 * Generate x-client-transaction-id header
 *
 * This implementation does NOT depend on any external library, so it works
 * without installing @lami/x-client-transaction-id.
 *
 * It generates a UUID-like ID that is unique per request, which is sufficient
 * for most use-cases (tracking, anti-duplication, logging).
 */
export async function generateClientTransactionId(
  method: string = 'GET',
  path: string = ''
): Promise<string> {
  // Simple UUID-like generator: timestamp + random segments + method hash
  const timestamp = Date.now().toString(16);
  const rand = () => Math.random().toString(16).substring(2, 10);
  const methodHash = Buffer.from(method + path).toString('hex').substring(0, 8);

  return `${timestamp}-${rand()}-${rand()}-${methodHash}`;
}

/**
 * Generate x-client-transaction-id header (synchronous version)
 * Used when async generation is not available
 */
export function generateClientTransactionIdSync(): string {
  const timestamp = Date.now().toString(16);
  const rand = () => Math.random().toString(16).substring(2, 10);
  return `${timestamp}-${rand()}-${rand()}`;
}

/**
 * Generate invisible characters to avoid duplicate errors
 */
export function addInvisibleChars(text: string): string {
  const invisibleChars = [
    '\u200B', // Zero-width space
    '\u200C', // Zero-width non-joiner
    '\u200D', // Zero-width joiner
    '\uFEFF'  // Zero-width no-break space
  ];
  const randomChar = invisibleChars[Math.floor(Math.random() * invisibleChars.length)];
  return text + randomChar;
}

/**
 * Get base headers for Twitter API requests
 */
export async function getBaseHeaders(authToken: string, ct0: string, method: string = 'GET', path: string = ''): Promise<Record<string, string>> {
  // Generate proper transaction ID based on method and path
  const clientTransactionId = await generateClientTransactionId(method, path).catch(() => generateClientTransactionIdSync());
  
  return {
    'authority': 'twitter.com',
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    'content-type': 'application/json',
    'cookie': `auth_token=${authToken}; ct0=${ct0}`,
    'origin': 'https://twitter.com',
    'referer': 'https://twitter.com/',
    'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Linux"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'x-client-transaction-id': clientTransactionId,
    'x-csrf-token': ct0,
    'x-twitter-active-user': 'yes',
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-client-language': 'en'
  };
}
