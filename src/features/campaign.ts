/**
 * Campaign System - Main Feature
 * Phase 1: Post main tweet
 * Phase 2: Quote tweet loop with user mentions
 */

import { TwitterActions } from './actions.js';
import { parseAuthToken } from '../utils/auth.js';
import fs from 'fs/promises';

interface CampaignOptions {
  mainToken?: string | null;
  tokensFile?: string;
  usersFile?: string;
  templatesFile?: string;
  mentionsPerQuote?: number;
}

interface CampaignResult {
  totalQuotes: number;
  successful: number;
  failed: number;
  usersMentioned: number;
}

export class CampaignSystem {
  private actions: TwitterActions;

  constructor() {
    this.actions = new TwitterActions();
  }

  async initialize(): Promise<void> {
    await this.actions.initialize();
  }

  /**
   * Run campaign
   */
  async runCampaign(options: CampaignOptions = {}): Promise<CampaignResult> {
    const {
      mainToken,
      tokensFile = 'tokens.txt',
      usersFile = 'users.txt',
      templatesFile = 'post_templates.txt',
      mentionsPerQuote = 3
    } = options;

    console.log('🚀 Starting Campaign System\n');

    // Load files
    const [tokens, users, templates] = await Promise.all([
      this.loadFile(tokensFile),
      this.loadFile(usersFile),
      this.loadFile(templatesFile)
    ]);

    if (tokens.length === 0) {
      throw new Error('No tokens found in tokens.txt');
    }
    if (users.length === 0) {
      throw new Error('No users found in users.txt');
    }
    if (templates.length === 0) {
      throw new Error('No templates found in post_templates.txt');
    }

    console.log(`Loaded: ${tokens.length} tokens, ${users.length} users, ${templates.length} templates\n`);

    // Phase 1: Post main tweet
    console.log('📝 Phase 1: Posting main tweet...');
    const mainTokenParsed = parseAuthToken(mainToken || tokens[0]);
    const mainTemplate = templates[0];
    
    const mainTweet = await this.actions.postTweet(mainTokenParsed, mainTemplate);
    
    if (!mainTweet.success) {
      throw new Error(`Failed to post main tweet: ${mainTweet.error}`);
    }

    const mainTweetId = mainTweet.tweetId!;
    console.log(`✓ Main tweet posted: ${mainTweetId}`);
    console.log(`  Waiting 30s for tweet propagation...\n`);
    
    await this.delay(30000); // 30 second wait

    // Phase 2: Quote tweet loop
    console.log('🔄 Phase 2: Starting quote tweet loop...\n');
    
    const quotesNeeded = Math.ceil(users.length / mentionsPerQuote);
    console.log(`  Total quotes needed: ${quotesNeeded} (${users.length} users ÷ ${mentionsPerQuote} mentions)`);
    console.log(`  Available tokens: ${tokens.length}\n`);

    let tokenIndex = 0;
    let userIndex = 0;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < quotesNeeded && userIndex < users.length; i++) {
      // Get next token (rotate)
      const token = parseAuthToken(tokens[tokenIndex % tokens.length]);
      tokenIndex++;

      // Get next batch of users to mention
      const mentions: string[] = [];
      for (let j = 0; j < mentionsPerQuote && userIndex < users.length; j++) {
        mentions.push(users[userIndex]);
        userIndex++;
      }

      // Build quote text
      const mentionText = mentions.join(' ');
      const quoteText = `${mentionText} ${this.getRandomTemplate(templates)}`;

      console.log(`[${i + 1}/${quotesNeeded}] Quote tweeting with ${mentions.length} mentions...`);
      console.log(`  Mentions: ${mentions.join(', ')}`);

      const result = await this.actions.quoteTweet(token, mainTweetId, quoteText);

      if (result.success) {
        successCount++;
        console.log(`  ✓ Success! Quote ID: ${result.quoteId}`);
      } else {
        errorCount++;
        console.log(`  ✗ Failed: ${result.error}`);
        
        // Check if it's bot detection
        if (result.error?.includes('226')) {
          console.log(`  ⚠ Bot detection triggered - stopping campaign`);
          break;
        }
      }

      // Random delay between 45-90 seconds
      if (i < quotesNeeded - 1) {
        const delay = this.randomDelay(45000, 90000);
        console.log(`  Waiting ${Math.round(delay / 1000)}s before next quote...\n`);
        await this.delay(delay);
      }
    }

    // Summary
    const result: CampaignResult = {
      totalQuotes: successCount + errorCount,
      successful: successCount,
      failed: errorCount,
      usersMentioned: userIndex
    };

    console.log('\n' + '='.repeat(50));
    console.log('Campaign Complete!');
    console.log(`  Total quotes: ${result.totalQuotes}`);
    console.log(`  Successful: ${result.successful}`);
    console.log(`  Failed: ${result.failed}`);
    console.log(`  Users mentioned: ${result.usersMentioned}`);
    console.log('='.repeat(50));

    return result;
  }

  /**
   * Load file and return lines
   */
  private async loadFile(filePath: string): Promise<string[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    } catch (error) {
      throw new Error(`Failed to load ${filePath}: ${(error as Error).message}`);
    }
  }

  /**
   * Get random template
   */
  private getRandomTemplate(templates: string[]): string {
    return templates[Math.floor(Math.random() * templates.length)];
  }

  /**
   * Random delay between min and max milliseconds
   */
  private randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
