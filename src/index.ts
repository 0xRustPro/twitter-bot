#!/usr/bin/env node

/**
 * Twitter Marketing Automation Tool - CLI Interface
 */

import { TokenValidator } from './features/tokenValidator.js';
import { Scraper } from './features/scraper.js';
import { CampaignSystem } from './features/campaign.js';
import { WarmupMode } from './features/warmup.js';
import { TwitterActions } from './features/actions.js';
import { parseAuthToken } from './utils/auth.js';
import inquirer from 'inquirer';
import fs from 'fs/promises';
import chalk from 'chalk';

const command = process.argv[2];

async function main(): Promise<void> {
  console.log(chalk.blue.bold('\n🐦 Twitter Marketing Automation Tool\n'));

  switch (command) {
    case 'validate':
      await handleValidate();
      break;
    
    case 'scrape':
      await handleScrape();
      break;
    
    case 'campaign':
      await handleCampaign();
      break;
    
    case 'warmup':
      await handleWarmup();
      break;
    
    case 'action':
      await handleAction();
      break;
    
    default:
      showHelp();
  }
}

async function handleValidate(): Promise<void> {
  const validator = new TokenValidator();
  await validator.initialize();
  await validator.validateFromFile();
}

async function handleScrape(): Promise<void> {
  const scraper = new Scraper();
  await scraper.initialize();

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'type',
      message: 'What do you want to scrape?',
      choices: ['followers', 'following', 'likers', 'retweeters', 'follower-count', 'following-count']
    },
    {
      type: 'input',
      name: 'target',
      message: (answers: any) => {
        if (answers.type === 'follower-count' || answers.type === 'following-count') {
          return 'Enter username (without @) (leave empty to use authenticated user):';
        }
        return 'Enter username (without @) or tweet ID (leave empty to use authenticated user):';
      },
      default: '',
      validate: (input: string, answers: any) => {
        return true;
      }
    },
    {
      type: 'input',
      name: 'token',
      message: 'Enter auth token:',
      validate: (input: string) => input.length > 0
    },
    {
      type: 'input',
      name: 'maxResults',
      message: 'Max results (default: 1000):',
      default: '1000',
      when: (answers: any) => answers.type !== 'follower-count' && answers.type !== 'following-count' // Don't ask for max results when just getting count
    }
  ]);

  const authToken = parseAuthToken(answers.token);
  const originalToken = answers.token; // Keep original token string for username lookup
  let users: string[] = [];

  const resolveUsernameForCounts = async (): Promise<string | null> => {
    const candidate = String(answers.target || '').trim();
    if (candidate) return candidate.replace(/^@/, '');
    try {
      const validator = new TokenValidator();
      await validator.initialize();
      return await validator.getUsernameFromToken(originalToken);
    } catch {
      return null;
    }
  };

  switch (answers.type) {
    case 'followers':
      users = await scraper.scrapeFollowers(answers.target || null, authToken, parseInt(answers.maxResults), originalToken);
      await scraper.exportUsers(users, `followers-${answers.target || 'authenticated-user'}.txt`);
      break;
    
    case 'following':
      users = await scraper.scrapeFollowing(answers.target || null, authToken, parseInt(answers.maxResults), originalToken);
      await scraper.exportUsers(users, `following-${answers.target || 'authenticated-user'}.txt`);
      break;
    
    case 'likers':
      users = await scraper.scrapeLikers(answers.target, authToken, parseInt(answers.maxResults));
      await scraper.exportUsers(users, `likers-${answers.target}.txt`);
      break;
    
    case 'retweeters':
      users = await scraper.scrapeRetweeters(answers.target, authToken, parseInt(answers.maxResults));
      await scraper.exportUsers(users, `retweeters-${answers.target}.txt`);
      break;
    
    case 'follower-count':
      const followerUsername = await resolveUsernameForCounts();
      if (!followerUsername) {
        console.error('Error: Could not get username from auth token');
        break;
      }
      const followerCount = await scraper.getFollowerCount(followerUsername, authToken);
      if (followerCount !== null) {
        console.log(followerCount);
      } else {
        console.error('Error: Could not get follower count');
      }
      break;
    
    case 'following-count':
      const followingUsername = await resolveUsernameForCounts();
      if (!followingUsername) {
        console.error('Error: Could not get username from auth token');
        break;
      }
      const followingCount = await scraper.getFollowingCount(followingUsername, authToken);
      if (followingCount !== null) {
        console.log(followingCount);
      } else {
        console.error('Error: Could not get following count');
      }
      break;
  }
}

async function handleCampaign(): Promise<void> {
  const campaign = new CampaignSystem();
  await campaign.initialize();

  // Check if files exist
  try {
    await fs.access('tokens.txt');
    await fs.access('users.txt');
    await fs.access('post_templates.txt');
  } catch {
    console.log(chalk.red('Error: Missing required files!'));
    console.log('Required files: tokens.txt, users.txt, post_templates.txt\n');
    return;
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'mainToken',
      message: 'Enter main account auth token (or press Enter to use first token from tokens.txt):',
      default: ''
    },
    {
      type: 'input',
      name: 'mentionsPerQuote',
      message: 'Users to mention per quote (default: 3):',
      default: '3'
    }
  ]);

  await campaign.runCampaign({
    mainToken: answers.mainToken || null,
    mentionsPerQuote: parseInt(answers.mentionsPerQuote) || 3
  });
}

async function handleWarmup(): Promise<void> {
  const warmup = new WarmupMode();
  await warmup.initialize();

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'token',
      message: 'Enter auth token (or "all" to warmup all tokens from tokens.txt):',
      validate: (input: string) => input.length > 0
    },
    {
      type: 'input',
      name: 'likesCount',
      message: 'Number of tweets to like (default: 3):',
      default: '3'
    }
  ]);

  if (answers.token.toLowerCase() === 'all') {
    try {
      const content = await fs.readFile('tokens.txt', 'utf-8');
      const tokens = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      await warmup.warmupTokens(tokens, {
        likesCount: parseInt(answers.likesCount) || 3
      });
    } catch (error) {
      console.log(chalk.red(`Error: ${(error as Error).message}`));
    }
  } else {
    await warmup.warmupToken(answers.token, {
      likesCount: parseInt(answers.likesCount) || 3
    });
  }
}

async function handleAction(): Promise<void> {
  const actions = new TwitterActions();
  await actions.initialize();

  interface ActionAnswers {
    action: string;
    token: string;
    text?: string;
    tweetId?: string;
    userId?: string;
  }

  const answers = await inquirer.prompt<ActionAnswers>([
    {
      type: 'list',
      name: 'action',
      message: 'What action do you want to perform?',
      choices: ['post', 'like', 'retweet', 'quote', 'reply', 'follow', 'dm']
    },
    {
      type: 'input',
      name: 'token',
      message: 'Enter auth token:',
      validate: (input: string) => input.length > 0
    },
    {
      type: 'input',
      name: 'text',
      message: 'Enter text (for post/quote/reply/dm):',
      when: (answers: ActionAnswers) => ['post', 'quote', 'reply', 'dm'].includes(answers.action),
      default: ''
    },
    {
      type: 'input',
      name: 'tweetId',
      message: 'Enter tweet ID:',
      when: (answers: ActionAnswers) => ['like', 'retweet', 'quote', 'reply'].includes(answers.action),
      default: ''
    },
    {
      type: 'input',
      name: 'userId',
      message: 'Enter user ID:',
      when: (answers: ActionAnswers) => ['follow', 'dm'].includes(answers.action),
      default: ''
    }
  ]);

  const authToken = parseAuthToken(answers.token);
  let result: { success: boolean; error?: string; tweetId?: string; quoteId?: string; replyId?: string } | undefined;

  switch (answers.action) {
    case 'post':
      result = await actions.postTweet(authToken, answers.text || '');
      break;
    case 'like':
      result = await actions.likeTweet(authToken, answers.tweetId || '');
      break;
    case 'retweet':
      result = await actions.retweet(authToken, answers.tweetId || '');
      break;
    case 'quote':
      result = await actions.quoteTweet(authToken, answers.tweetId || '', answers.text || '');
      break;
    case 'reply':
      result = await actions.reply(authToken, answers.tweetId || '', answers.text || '');
      break;
    case 'follow':
      result = await actions.follow(authToken, answers.userId || '');
      break;
    case 'dm':
      result = await actions.sendDM(authToken, answers.userId || '', answers.text || '');
      break;
  }

  if (result && result.success) {
    console.log(chalk.green('✓ Success!'));
    if (result.tweetId) console.log(`Tweet ID: ${result.tweetId}`);
    if (result.quoteId) console.log(`Quote ID: ${result.quoteId}`);
    if (result.replyId) console.log(`Reply ID: ${result.replyId}`);
  } else if (result) {
    console.log(chalk.red(`✗ Failed: ${result.error || 'Unknown error'}`));
  }
}

function showHelp(): void {
  console.log(`
Usage: node dist/index.js <command>

Commands:
  validate    Validate auth tokens from tokens.txt
  scrape      Scrape followers/following/likers/retweeters
  campaign    Run quote tweet campaign (main feature)
  warmup      Warmup tokens before campaigns
  action      Perform basic actions (post, like, retweet, etc.)

Examples:
  npm run validate
  npm run scrape
  npm run campaign
  npm run warmup
  npm run action

Required Files:
  - tokens.txt          (auth tokens, one per line)
  - users.txt           (usernames to mention, one per line)
  - post_templates.txt  (tweet templates, one per line)
  - proxies.txt         (optional, format: user:pass:host:port)
  `);
}

main().catch(error => {
  console.error(chalk.red(`\nError: ${(error as Error).message}`));
  process.exit(1);
});
