/**
 * Authentication handler - fetches ct0 CSRF token
 */

/**
 * Optional hard-coded ct0 overrides for specific auth_tokens.
 * The user provided real ct0 values from their browser for these tokens.
 */
const CT0_OVERRIDES: Record<string, string> = {
  // auth_token -> ct0
  'f3d3b05733d06082f7dae6139040be5d3e7cf203':
    '8e27de1c58d6d6de0442b58be6a5ca7038045cff2fa3c4b83fbf61286f6452302d424e11b50c8b8d01f6ab26461c380e072cc66e25a8a2d171a4c53bba3a11d06e495e1af7ae9e62bb3cc2fd618f9ed3',
  'db1e89bcd4b026a20af710915319bb0630dba85e':
    '8be1ddade8e8578c569fc0b81bfd85721b5179c743bbbba7c2c2cf3b96da1832615ef7ad668bfa151b52b6142d2a0006a453ec596dc57490a7686507a3ece3f50bba4eb5ed2e575bef565d6aca581ab3'
};

/**
 * Fetch ct0 CSRF token
 * 1) If a hard-coded override exists for this auth_token, use it
 * 2) Otherwise, try to fetch from /i/api/1.1/onboarding/task/credentials.json
 * 3) Fallbacks if network calls fail
 */
export async function fetchCSRFToken(authToken: string): Promise<string> {
  try {
    // 1) Use user-provided ct0 override if available
    if (CT0_OVERRIDES[authToken]) {
      const override = CT0_OVERRIDES[authToken];
      console.log(
        `Using hard-coded ct0 override for token ${authToken.substring(0, 8)}...`
      );
      return override;
    }

    // 2) Normal network-based ct0 discovery
    // Use HTTP/2 for CSRF token fetching
    const http2 = await import('http2-wrapper');
    const { URL } = await import('url');
    
    // Helper function to make HTTP/2 fetch-like request
    const http2Fetch = async (url: string, options: { method?: string; headers?: Record<string, string> } = {}): Promise<{ headers: { get: (name: string) => string | null } }> => {
      return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const requestOptions = {
          hostname: urlObj.hostname,
          port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method: options.method || 'GET',
          headers: options.headers || {},
          protocol: urlObj.protocol
        };

        const req = http2.request(requestOptions, (res) => {
          const chunks: Buffer[] = [];
          
          res.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });
          
          res.on('end', () => {
            resolve({
              headers: {
                get: (name: string) => {
                  const value = res.headers[name.toLowerCase()];
                  if (Array.isArray(value)) {
                    return value.join(', ');
                  }
                  return value ? String(value) : null;
                }
              }
            });
          });
        });

        req.on('error', reject);
        req.end();
      });
    };
    
    // Get ct0 from the correct endpoint: /i/api/1.1/onboarding/task/credentials.json
    const headers: Record<string, string> = {
      'authority': 'twitter.com',
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
      'cookie': `auth_token=${authToken}`,
      'origin': 'https://twitter.com',
      'referer': 'https://twitter.com/',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    };

    const response = await http2Fetch('https://twitter.com/i/api/1.1/onboarding/task/credentials.json', {
      method: 'GET',
      headers
    });

    // Extract ct0 from Set-Cookie header
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const ct0Match = setCookie.match(/ct0=([^;]+)/);
      if (ct0Match) {
        return ct0Match[1];
      }
    }

    // Fallback: try to get from response cookies if set-cookie header format is different
    const allCookies = response.headers.get('set-cookie') || response.headers.get('cookie') || '';
    const ct0FromCookies = allCookies.match(/ct0=([^;,\s]+)/);
    if (ct0FromCookies) {
      return ct0FromCookies[1];
    }

    // Fallback: try Twitter homepage
    const homeResponse = await http2Fetch('https://twitter.com/', {
      headers: {
        'cookie': `auth_token=${authToken}`,
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    const homeCookies = homeResponse.headers.get('set-cookie') || '';
    const ct0FromHome = homeCookies.match(/ct0=([^;]+)/);
    if (ct0FromHome) {
      return ct0FromHome[1];
    }

    // Last resort: generate a random token (won't work but prevents crash)
    console.warn('⚠ Could not fetch ct0 token, using fallback (may cause authentication failures)');
    return generateFallbackCT0();
  } catch (error) {
    const err = error as Error & { code?: string; cause?: Error };
    console.error('Error fetching CSRF token:', err.message);
    
    // Log more details for debugging
    if (err.code) {
      console.error(`  → Error code: ${err.code}`);
    }
    if (err.cause) {
      console.error(`  → Cause: ${err.cause.message}`);
    }
    
    if (err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND') || err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      console.error('  → Network issue: Cannot reach Twitter. Check internet connection and DNS.');
    } else if (err.message.includes('timeout') || err.code === 'ETIMEDOUT') {
      console.error('  → Timeout: Request took too long. Check proxy or network speed.');
    } else if (err.message.includes('fetch failed') || err.message === 'fetch failed') {
      console.error('  → Connection failed: Cannot reach Twitter. Check network, DNS, or firewall.');
    }
    
    return generateFallbackCT0();
  }
}

function generateFallbackCT0(): string {
  // Generate a random hex string (32 chars)
  return Array.from({ length: 32 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

/**
 * Parse auth token from string
 */
export function parseAuthToken(tokenString: string): string {
  // Handle both formats: "auth_token=xxx" and just "xxx"
  if (tokenString.includes('auth_token=')) {
    return tokenString.split('auth_token=')[1].split(';')[0].trim();
  }
  return tokenString.trim();
}
