/**
 * Warmup Mode - Simulate human behavior before campaigns
 */

import { TwitterActions } from './actions.js';
import { TwitterClient } from '../utils/httpClient.js';
import { parseAuthToken } from '../utils/auth.js';

interface WarmupOptions {
  likesCount?: number;
  browseTimeline?: boolean;
}

interface TimelineResponse {
  globalObjects?: {
    tweets?: Record<string, { id_str?: string }>;
  };
}

export class WarmupMode {
  private actions: TwitterActions;
  private client: TwitterClient;

  constructor() {
    this.actions = new TwitterActions();
    this.client = new TwitterClient();
  }

  async initialize(): Promise<void> {
    await this.actions.initialize();
    await this.client.initialize();
  }

  /**
   * Run warmup for a token
   */
  async warmupToken(authToken: string, options: WarmupOptions = {}): Promise<void> {
    const {
      likesCount = 3,
      browseTimeline = true
    } = options;

    const tokenParsed = parseAuthToken(authToken);
    
    console.log('🔥 Starting warmup mode...\n');

    try {
      // Browse timeline (simulate scrolling)
      if (browseTimeline) {
        console.log('📜 Browsing timeline...');
        await this.browseTimeline(tokenParsed);
        await this.delay(this.randomDelay(2000, 5000));
      }

      // Like random tweets
      console.log(`❤️  Liking ${likesCount} random tweets...`);
      const tweets = await this.getTimelineTweets(tokenParsed, likesCount * 2);
      
      const tweetsToLike = tweets.slice(0, likesCount);
      for (let i = 0; i < tweetsToLike.length; i++) {
        const tweetId = tweetsToLike[i];
        console.log(`  [${i + 1}/${tweetsToLike.length}] Liking tweet ${tweetId}...`);
        
        const result = await this.actions.likeTweet(tokenParsed, tweetId);
        if (result.success) {
          console.log(`    ✓ Liked`);
        } else {
          console.log(`    ✗ Failed: ${result.error}`);
        }

        // Human-like delay between likes
        if (i < tweetsToLike.length - 1) {
          await this.delay(this.randomDelay(3000, 8000));
        }
      }
    } catch (error) {
      console.error(`Warmup error: ${(error as Error).message}`);
    }

    console.log('\n✓ Warmup complete!\n');
  }

  /**
   * Browse timeline (simulate scrolling)
   */
  private async browseTimeline(authToken: string): Promise<void> {
    try {
      // Fetch timeline
      const response = await this.client.makeRequest(
        'https://twitter.com/i/api/2/timeline/home.json?count=20',
        {
          authToken,
          method: 'GET'
        }
      );

      if (response.ok) {
        // Simulate reading time
        const readTime = this.randomDelay(5000, 15000);
        await this.delay(readTime);
        console.log('  ✓ Timeline browsed');
      }
    } catch (error) {
      console.log(`  ⚠ Could not browse timeline: ${(error as Error).message}`);
    }
  }

  /**
   * Get tweets from timeline
   */
  private async getTimelineTweets(authToken: string, count: number = 10): Promise<string[]> {
    try {
      const response = await this.client.makeRequest(
        'https://twitter.com/i/api/2/timeline/home.json?count=20',
        {
          authToken,
          method: 'GET'
        }
      );

      if (response.ok && response.data) {
        const data = response.data as TimelineResponse;
        if (data.globalObjects?.tweets) {
          const tweets = Object.values(data.globalObjects.tweets)
            .map(tweet => tweet.id_str)
            .filter((id): id is string => id !== undefined)
            .slice(0, count);
          return tweets;
        }
      }
    } catch (error) {
      console.error(`Error getting timeline: ${(error as Error).message}`);
    }

    // Fallback: return empty array or use mock tweet IDs
    return [];
  }

  /**
   * Warmup multiple tokens
   */
  async warmupTokens(tokens: string[], options: WarmupOptions = {}): Promise<void> {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      console.log(`\n[${i + 1}/${tokens.length}] Warming up token...`);
      await this.warmupToken(token, options);
      
      if (i < tokens.length - 1) {
        const delay = this.randomDelay(10000, 20000);
        console.log(`Waiting ${Math.round(delay / 1000)}s before next token...\n`);
        await this.delay(delay);
      }
    }
  }

  private randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
