/**
 * HTTP/2 Client with anti-bot bypass
 */

import * as http2 from 'http2-wrapper';
import { fetch as http1Fetch, Headers, Response } from 'undici';
import { getBaseHeaders } from './headers.js';
import { fetchCSRFToken } from './auth.js';
import { ProxyManager } from './proxy.js';
import { ProxyAgent } from 'undici';
import { URL } from 'url';

/**
 * Fetch-like wrapper for http2-wrapper using its request API
 */
async function http2Fetch(url: string, options: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
} = {}): Promise<Response> {
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
        const body = Buffer.concat(chunks).toString();
        
        // Convert http2-wrapper response to fetch-like Response
        // Filter out HTTP/2 pseudo-headers (starting with ':') as they're not valid HTTP header names
        const responseHeaders = new Headers();
        Object.entries(res.headers).forEach(([key, value]) => {
          // Skip HTTP/2 pseudo-headers like :status, :method, :path, etc.
          if (key.startsWith(':')) {
            return;
          }
          if (Array.isArray(value)) {
            value.forEach(v => responseHeaders.append(key, String(v)));
          } else if (value !== undefined) {
            responseHeaders.set(key, String(value));
          }
        });

        const response = {
          ok: res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode || 0,
          statusText: res.statusMessage || '',
          headers: responseHeaders,
          text: async () => body,
          json: async () => JSON.parse(body),
          arrayBuffer: async () => Buffer.from(body).buffer
        } as Response;
        
        resolve(response);
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

interface TokenCache {
  ct0: string;
  agent: ProxyAgent | null;
  useProxy: boolean;
}

interface RequestOptions {
  authToken: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

interface ResponseData {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  data: unknown;
}

interface BotDetectionResult {
  detected: boolean;
  error?: string;
}

interface DuplicateErrorResult {
  duplicate: boolean;
  error?: string;
}

export class TwitterClient {
  private proxyManager: ProxyManager;
  private tokenCache: Map<string, TokenCache>;

  constructor() {
    this.proxyManager = new ProxyManager();
    this.tokenCache = new Map(); // token -> { ct0, agent }
  }

  /**
   * Initialize - load proxies and cache tokens
   */
  async initialize(): Promise<void> {
    await this.proxyManager.loadProxies();
  }

  /**
   * Get or fetch CSRF token for auth token
   */
  async getCSRFToken(authToken: string, silent: boolean = false): Promise<string> {
    if (this.tokenCache.has(authToken)) {
      const cached = this.tokenCache.get(authToken)!;
      // Only log if not silent mode (reduces duplicate logs during validation)
      if (!silent) {
        console.log(`ct0 (cached) for token ${authToken.substring(0, 8)}...: ${cached.ct0.substring(0, 20)}...`);
      }
      return cached.ct0;
    }

    const ct0 = await fetchCSRFToken(authToken);
    
    const agent = this.proxyManager.getAgent(authToken);
    const useProxy = agent !== null;
    this.tokenCache.set(authToken, { ct0, agent, useProxy });
    // Only log when first fetched (not on subsequent cached calls)
    if (!silent) {
      console.log(`ct0 (fetched) for token ${authToken.substring(0, 8)}...: ${ct0.substring(0, 20)}...`);
    }
    
    return ct0;
  }

  /**
   * Make HTTP/2 request to Twitter API
   * Falls back to HTTP/1.1 if using proxies (most proxies don't support HTTP/2)
   * Includes retry logic with proxy rotation on failure
   */
  async makeRequest(url: string, options: RequestOptions, retryCount: number = 0, maxRetries: number = 2): Promise<ResponseData> {
    const authToken = options.authToken;
    if (!authToken) {
      throw new Error('Auth token required');
    }

    // Get CSRF token
    const ct0 = await this.getCSRFToken(authToken);
    
    // Get proxy agent if available
    let agent = this.proxyManager.getAgent(authToken);
    const useProxy = agent !== null;
    let proxyUrl: string | null = null;

    // Extract path from URL for transaction ID generation
    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search;

    // Build headers with proper transaction ID
    const headers = await getBaseHeaders(authToken, ct0, options.method || 'GET', path);
    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    // Use HTTP/2 for direct connections, HTTP/1.1 for proxied connections
    // (Most HTTP proxies don't support HTTP/2)
    const fetchFn = useProxy ? http1Fetch : http2Fetch;

    // Build fetch options
    const fetchOptions: {
      method?: string;
      headers: Record<string, string>;
      body?: string;
      dispatcher?: ProxyAgent;
    } = {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      ...(useProxy && agent ? { dispatcher: agent } : {})
    };

    try {
      const response = await fetchFn(url, fetchOptions);
      
      // Mark proxy as successful if using proxy
      if (useProxy && agent) {
        proxyUrl = this.proxyManager.getProxyUrlForAgent(agent);
        if (proxyUrl) {
          this.proxyManager.markProxySuccess(proxyUrl);
        }
      }
      
      // Update ct0 if returned in response
      const setCookie = response.headers.get('set-cookie');
      if (setCookie && setCookie.includes('ct0=')) {
        const newCt0 = setCookie.match(/ct0=([^;]+)/)?.[1];
        if (newCt0 && this.tokenCache.has(authToken)) {
          this.tokenCache.get(authToken)!.ct0 = newCt0;
        }
      }

      const data = await response.text();
      
      // Try to parse as JSON
      let jsonData: unknown;
      try {
        jsonData = JSON.parse(data);
      } catch {
        jsonData = data;
      }

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: jsonData
      };
    } catch (error) {
      const err = error as Error & { code?: string; cause?: Error };
      
      // Mark proxy as failed if using proxy
      if (useProxy && agent) {
        proxyUrl = this.proxyManager.getProxyUrlForAgent(agent);
        if (proxyUrl) {
          this.proxyManager.markProxyFailed(proxyUrl);
        }
      }
      
      // Check if this is a retryable error and we have more retries
      const isRetryableError = this.isRetryableError(err);
      
      if (isRetryableError && retryCount < maxRetries && useProxy) {
        // Try with a different proxy
        console.log(`⚠ Request failed, retrying with different proxy (attempt ${retryCount + 1}/${maxRetries})...`);
        const newAgent = this.proxyManager.getRandomAgent();
        if (newAgent && newAgent !== agent) {
          // Update cached agent for this token
          if (this.tokenCache.has(authToken)) {
            this.tokenCache.get(authToken)!.agent = newAgent;
          }
          // Retry with new proxy
          return this.makeRequest(url, options, retryCount + 1, maxRetries);
        }
      }
      
      let errorMessage = err.message;
      
      // Check for underlying error codes
      if (err.code) {
        errorMessage += ` (code: ${err.code})`;
      }
      
      // Check for cause
      if (err.cause) {
        errorMessage += ` (cause: ${err.cause.message})`;
      }
      
      // Provide more context about the failure
      if (err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND') || err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
        throw new Error(`Network error: Cannot connect to Twitter. Check internet connection and DNS. ${errorMessage}`);
      } else if (err.message.includes('timeout') || err.code === 'ETIMEDOUT') {
        throw new Error(`Request timeout: Request took too long. Try again or check proxy. ${errorMessage}`);
      } else if (err.message.includes('certificate') || err.message.includes('SSL') || err.code === 'CERT_HAS_EXPIRED') {
        throw new Error(`SSL/TLS error: Certificate issue. ${errorMessage}`);
      } else if (err.message.includes('fetch failed') || err.message === 'fetch failed') {
        // Generic fetch failed - try to get more details
        const details = err.cause ? ` (${err.cause.message})` : '';
        throw new Error(`Connection failed: Cannot reach Twitter API. This usually means:
- Network connectivity issue (check internet connection)
- DNS resolution failure (check DNS settings)
- Firewall blocking connection
- Proxy configuration issue (if using proxies)
Original error: ${errorMessage}${details}`);
      } else {
        throw new Error(`Request failed: ${errorMessage}`);
      }
    }
  }

  /**
   * Check if an error is retryable with a different proxy
   */
  private isRetryableError(error: Error & { code?: string; cause?: Error }): boolean {
    // Retry on network errors, timeouts, and connection failures
    return !!(
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('timeout') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('fetch failed') ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNRESET'
    );
  }

  /**
   * Check if response indicates bot detection
   */
  isBotDetected(response: ResponseData): BotDetectionResult {
    if (response.status === 226) {
      return { detected: true, error: 'Error 226: Bot detection triggered' };
    }
    if (response.status === 403 && response.data && typeof response.data === 'object') {
      const data = response.data as { errors?: Array<{ code?: number }> | { code?: number } };
      if (data.errors) {
        const errors = Array.isArray(data.errors) ? data.errors : [data.errors];
        if (errors.some(e => e.code === 226)) {
          return { detected: true, error: 'Error 226: Bot detection triggered' };
        }
      }
    }
    return { detected: false };
  }

  /**
   * Check if response indicates duplicate error
   */
  isDuplicateError(response: ResponseData): DuplicateErrorResult {
    // Check for error 187 in response body (can occur with status 200 or 403)
    if (response.data && typeof response.data === 'object') {
      const data = response.data as { errors?: Array<{ code?: number; message?: string }> | { code?: number; message?: string } };
      if (data.errors) {
        const errors = Array.isArray(data.errors) ? data.errors : [data.errors];
        const duplicateError = errors.find(e => e.code === 187 || (e.message && e.message.includes('duplicate')));
        if (duplicateError) {
          return { duplicate: true, error: `Error 187: Duplicate tweet - ${duplicateError.message || 'Status is a duplicate'}` };
        }
      }
    }
    return { duplicate: false };
  }
}
