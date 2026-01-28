/**
 * Enhanced Proxy Manager with rotation, health tracking, and retry logic
 * Supports residential proxies with multiple rotation strategies
 */

import { ProxyAgent } from 'undici';

interface ProxyConfig {
  user: string;
  pass: string;
  host: string;
  port: string;
}

interface ProxyHealth {
  agent: ProxyAgent;
  failures: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  isHealthy: boolean;
}

export type RotationMode = 'sticky' | 'random' | 'round-robin';

export class ProxyManager {
  private proxyMap: Map<string, ProxyAgent>; // token -> proxy agent (for sticky mode)
  private proxies: ProxyConfig[];
  private proxyHealth: Map<string, ProxyHealth>; // proxy URL -> health info
  private currentIndex: number;
  private rotationMode: RotationMode;
  private maxFailures: number;
  private healthCheckInterval: number; // seconds before retrying a failed proxy

  constructor(rotationMode: RotationMode = 'sticky', maxFailures: number = 3, healthCheckInterval: number = 300) {
    this.proxyMap = new Map(); // token -> proxy agent
    this.proxies = [];
    this.proxyHealth = new Map(); // proxy URL -> health info
    this.currentIndex = 0;
    this.rotationMode = rotationMode;
    this.maxFailures = maxFailures;
    this.healthCheckInterval = healthCheckInterval; // 5 minutes default
  }

  /**
   * Load proxies from file
   */
  async loadProxies(filePath: string = 'proxies.txt'): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      const allProxies = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
          const [user, pass, host, port] = line.split(':');
          return { user, pass, host, port };
        });
      
      // Filter out example/placeholder proxies
      this.proxies = allProxies.filter(proxy => {
        // Skip example.com, localhost, or placeholder proxies
        if (proxy.host.includes('example.com') || 
            proxy.host.includes('example') ||
            proxy.host === 'localhost' ||
            proxy.host === '127.0.0.1' ||
            !proxy.host ||
            !proxy.port) {
          console.log(`⚠ Skipping invalid/example proxy: ${proxy.host}:${proxy.port}`);
          return false;
        }
        return true;
      });
      
      if (this.proxies.length > 0) {
        console.log(`Loaded ${this.proxies.length} valid proxies`);
      } else if (allProxies.length > 0) {
        console.log(`⚠ Found ${allProxies.length} proxies but all are invalid/example. Running without proxies.`);
      } else {
        console.log('No valid proxies found, running without proxies');
      }
    } catch (error) {
      console.log('No proxy file found, running without proxies');
      this.proxies = [];
    }
  }

  /**
   * Get proxy URL string from config
   */
  private getProxyUrl(proxy: ProxyConfig): string {
    return `http://${proxy.user}:${proxy.pass}@${proxy.host}:${proxy.port}`;
  }

  /**
   * Get healthy proxies only
   */
  private getHealthyProxies(): ProxyConfig[] {
    const now = new Date();
    return this.proxies.filter(proxy => {
      const proxyUrl = this.getProxyUrl(proxy);
      const health = this.proxyHealth.get(proxyUrl);
      
      if (!health) {
        return true; // New proxy, assume healthy
      }
      
      // Check if proxy is marked as unhealthy
      if (!health.isHealthy) {
        // Check if enough time has passed to retry
        if (health.lastFailure) {
          const secondsSinceFailure = (now.getTime() - health.lastFailure.getTime()) / 1000;
          if (secondsSinceFailure < this.healthCheckInterval) {
            return false; // Still in cooldown period
          }
        }
        // Reset health if cooldown period passed
        health.isHealthy = true;
        health.failures = 0;
      }
      
      return health.isHealthy;
    });
  }

  /**
   * Create or get cached proxy agent
   */
  private getOrCreateAgent(proxy: ProxyConfig): ProxyAgent {
    const proxyUrl = this.getProxyUrl(proxy);
    
    // Check if we already have a healthy agent for this proxy
    const health = this.proxyHealth.get(proxyUrl);
    if (health && health.isHealthy && health.agent) {
      return health.agent;
    }
    
    // Create new agent
    const agent = new ProxyAgent(proxyUrl);
    
    // Store health info
    this.proxyHealth.set(proxyUrl, {
      agent,
      failures: 0,
      isHealthy: true,
      lastSuccess: new Date()
    });
    
    return agent;
  }

  /**
   * Mark proxy as failed
   */
  markProxyFailed(proxyUrl: string): void {
    const health = this.proxyHealth.get(proxyUrl);
    if (health) {
      health.failures++;
      health.lastFailure = new Date();
      
      if (health.failures >= this.maxFailures) {
        health.isHealthy = false;
        console.log(`⚠ Proxy marked as unhealthy: ${proxyUrl.substring(0, 30)}... (${health.failures} failures)`);
      }
    }
  }

  /**
   * Mark proxy as successful
   */
  markProxySuccess(proxyUrl: string): void {
    const health = this.proxyHealth.get(proxyUrl);
    if (health) {
      health.failures = 0; // Reset failure count on success
      health.lastSuccess = new Date();
      health.isHealthy = true;
    }
  }

  /**
   * Get proxy based on rotation mode
   */
  private selectProxy(token?: string): ProxyConfig | null {
    const healthyProxies = this.getHealthyProxies();
    
    if (healthyProxies.length === 0) {
      // Fallback to all proxies if no healthy ones available
      if (this.proxies.length === 0) {
        return null;
      }
      console.log('⚠ No healthy proxies available, using all proxies');
      return this.selectProxyFromList(this.proxies, token);
    }
    
    return this.selectProxyFromList(healthyProxies, token);
  }

  /**
   * Select proxy from list based on rotation mode
   */
  private selectProxyFromList(proxyList: ProxyConfig[], token?: string): ProxyConfig | null {
    if (proxyList.length === 0) {
      return null;
    }

    switch (this.rotationMode) {
      case 'sticky':
        // For sticky mode, use token to consistently assign same proxy
        if (token && this.proxyMap.has(token)) {
          // Find which proxy this token is using
          const existingAgent = this.proxyMap.get(token)!;
          for (const proxy of proxyList) {
            const proxyUrl = this.getProxyUrl(proxy);
            const health = this.proxyHealth.get(proxyUrl);
            if (health && health.agent === existingAgent) {
              return proxy;
            }
          }
        }
        // Fall through to round-robin for new tokens
      case 'round-robin':
        const proxy = proxyList[this.currentIndex % proxyList.length];
        this.currentIndex++;
        return proxy;
      
      case 'random':
        return proxyList[Math.floor(Math.random() * proxyList.length)];
      
      default:
        return proxyList[0];
    }
  }

  /**
   * Get or assign proxy for a token (supports multiple rotation modes)
   */
  getProxyForToken(token: string): ProxyAgent | null {
    // Sticky mode: return cached agent if exists
    if (this.rotationMode === 'sticky' && this.proxyMap.has(token)) {
      const cachedAgent = this.proxyMap.get(token)!;
      // Verify the cached agent is still valid
      const proxyUrl = Array.from(this.proxyHealth.entries()).find(
        ([_, health]) => health.agent === cachedAgent
      )?.[0];
      
      if (proxyUrl) {
        const health = this.proxyHealth.get(proxyUrl);
        if (health && health.isHealthy) {
          return cachedAgent;
        }
      }
    }

    if (this.proxies.length === 0) {
      return null;
    }

    const selectedProxy = this.selectProxy(token);
    if (!selectedProxy) {
      return null;
    }

    const agent = this.getOrCreateAgent(selectedProxy);
    
    // Cache agent for sticky mode
    if (this.rotationMode === 'sticky') {
    this.proxyMap.set(token, agent);
    }
    
    return agent;
  }

  /**
   * Get proxy agent for a token (with retry support)
   */
  getAgent(token: string): ProxyAgent | null {
    return this.getProxyForToken(token);
  }

  /**
   * Get a random proxy agent (for retry scenarios)
   */
  getRandomAgent(): ProxyAgent | null {
    const healthyProxies = this.getHealthyProxies();
    if (healthyProxies.length === 0) {
      if (this.proxies.length === 0) {
        return null;
      }
      // Fallback to all proxies
      const proxy = this.proxies[Math.floor(Math.random() * this.proxies.length)];
      return this.getOrCreateAgent(proxy);
    }
    
    const proxy = healthyProxies[Math.floor(Math.random() * healthyProxies.length)];
    return this.getOrCreateAgent(proxy);
  }

  /**
   * Get proxy URL for a given agent (for error tracking)
   */
  getProxyUrlForAgent(agent: ProxyAgent): string | null {
    for (const [proxyUrl, health] of this.proxyHealth.entries()) {
      if (health.agent === agent) {
        return proxyUrl;
      }
    }
    return null;
  }

  /**
   * Get rotation mode
   */
  getRotationMode(): RotationMode {
    return this.rotationMode;
  }

  /**
   * Set rotation mode
   */
  setRotationMode(mode: RotationMode): void {
    this.rotationMode = mode;
    if (mode !== 'sticky') {
      // Clear sticky cache when switching modes
      this.proxyMap.clear();
    }
  }

  /**
   * Get proxy statistics
   */
  getStats(): { total: number; healthy: number; unhealthy: number } {
    const healthy = this.getHealthyProxies().length;
    return {
      total: this.proxies.length,
      healthy,
      unhealthy: this.proxies.length - healthy
    };
  }
}
