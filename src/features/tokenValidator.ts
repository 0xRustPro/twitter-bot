/**
 * Token Validation System
 */

import { TwitterClient } from '../utils/httpClient.js';
import { parseAuthToken } from '../utils/auth.js';
import fs from 'fs/promises';

interface ValidationResult {
  status: 'valid' | 'invalid' | 'suspended' | 'rate-limited' | 'bot-detected' | 'error';
  error?: string;
  token?: string;
  username?: string; // Username (screen_name) extracted from token
}

interface ValidationResults {
  valid: ValidationResult[];
  invalid: ValidationResult[];
  suspended: ValidationResult[];
  rateLimited: ValidationResult[];
  botDetected: ValidationResult[];
  errors: ValidationResult[];
}

export class TokenValidator {
  private client: TwitterClient;

  constructor() {
    this.client = new TwitterClient();
  }

  async initialize(): Promise<void> {
    await this.client.initialize();
  }

  /**
   * Get username from auth token
   * Returns the username (screen_name) associated with the token
   * Tries multiple endpoints to get the username
   */
  async getUsernameFromToken(tokenString: string, ct0Token?: string): Promise<string | null> {
    const authToken = parseAuthToken(tokenString);

    try {
      // Get ct0 token if not provided
      let ct0 = ct0Token;
      if (!ct0) {
        ct0 = await this.client.getCSRFToken(authToken, true); // Silent mode
      }

      // Try api.twitter.com endpoint first
      try {
        const response = await this.client.makeRequest(
          'https://api.twitter.com/1.1/account/verify_credentials.json',
          {
            authToken,
            method: 'GET',
            headers: {
              'Authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
              'x-csrf-token': ct0,
              'Cookie': `auth_token=${authToken}; ct0=${ct0}`
            }
          }
        );

        // Check for errors first (including error code 34)
        if (response.data && typeof response.data === 'object') {
          const data = response.data as { 
            screen_name?: string;
            errors?: Array<{ code?: number; message?: string }>;
          };
          
          // Check for errors in response
          if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
            const error = data.errors[0];
            // Error code 34 means endpoint doesn't exist, try x.com instead
            if (error.code === 34) {
              // Fall through to try x.com endpoint
            } else {
              // Other errors, can't get username
              return null;
            }
          } else if (data.screen_name) {
            // Successfully got username
            return data.screen_name;
          }
        }

        // Process successful response (200 OK)
        if (response.ok && response.status === 200) {
          if (response.data && typeof response.data === 'object') {
            const data = response.data as { 
              screen_name?: string;
            };
            if (data.screen_name) {
              return data.screen_name;
            }
          }
        }
      } catch (error) {
        // If api.twitter.com fails, try x.com
      }

      // Try x.com endpoint as fallback
      try {
        const response = await this.client.makeRequest(
          'https://x.com/i/api/1.1/account/verify_credentials.json',
          {
            authToken,
            method: 'GET'
          }
        );

        if (response.ok && response.status === 200) {
          if (response.data && typeof response.data === 'object') {
            const data = response.data as { 
              screen_name?: string;
            };
            if (data.screen_name) {
              return data.screen_name;
            }
          }
        }
      } catch (error) {
        // Both endpoints failed
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get followers for the authenticated user (from auth token)
   * Returns array of follower usernames
   */
  async getFollowersFromToken(tokenString: string, maxResults: number = 1000): Promise<string[]> {
    const authToken = parseAuthToken(tokenString);
    const followers: string[] = [];
    let cursor: string | null = null;
    let count = 0;

    try {
      // First, get the username from the token
      const username = await this.getUsernameFromToken(tokenString);
      if (!username) {
        throw new Error('Could not get username from token');
      }

      console.log(`Getting followers for @${username}...`);

      while (count < maxResults) {
        try {
          const variables = {
            screen_name: username,
            count: 100,
            cursor: cursor || null
          };

          const url = `https://twitter.com/i/api/graphql/-/Followers?variables=${encodeURIComponent(JSON.stringify(variables))}`;
          
          const response = await this.client.makeRequest(url, {
            authToken,
            method: 'GET'
          });

          if (!response.ok) {
            console.error(`Error: ${response.status} - ${JSON.stringify(response.data)}`);
            break;
          }

          // Parse response data (using same structure as scraper)
          const data = response.data as {
            data?: {
              user?: {
                result?: {
                  timeline?: {
                    timeline?: {
                      instructions?: Array<{
                        entries?: Array<{
                          content?: {
                            entryType?: string;
                            cursorType?: string;
                            value?: string;
                            itemContent?: {
                              user_results?: {
                                result?: {
                                  legacy?: {
                                    screen_name?: string;
                                  };
                                };
                              };
                            };
                          };
                        }>;
                      }>;
                    };
                  };
                };
              };
            };
          };

          const entries = data?.data?.user?.result?.timeline?.timeline?.instructions || [];
          const userEntries = entries
            .flatMap(entry => entry.entries || [])
            .filter(entry => entry.content?.entryType === 'TimelineTimelineItem')
            .map(entry => entry.content?.itemContent?.user_results?.result)
            .filter(Boolean) as Array<{ legacy?: { screen_name?: string } }>;

          for (const user of userEntries) {
            if (user.legacy?.screen_name) {
              followers.push(`@${user.legacy.screen_name}`);
              count++;
            }
          }

          // Get next cursor
          const cursorEntry = entries
            .flatMap(entry => entry.entries || [])
            .find(entry => entry.content?.entryType === 'TimelineTimelineCursor' && entry.content?.cursorType === 'Bottom');
          
          cursor = cursorEntry?.content?.value || null;

            if (!cursor || userEntries.length === 0) {
              break;
            }

          console.log(`  Collected ${count} followers...`);
          await this.delay(2000); // Rate limit protection
        } catch (error) {
          console.error(`Error getting followers: ${(error as Error).message}`);
          break;
        }
      }

      // Display summary
      console.log(`  ✓ Found ${followers.length} followers`);
      if (followers.length > 0) {
        console.log(`  First 10 followers: ${followers.slice(0, 10).join(', ')}${followers.length > 10 ? ` ... and ${followers.length - 10} more` : ''}`);
      }

      return followers;
    } catch (error) {
      console.error(`Error getting followers from token: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Export followers to file
   */
  async exportFollowers(followers: string[], filename: string = 'followers.txt'): Promise<void> {
    try {
      const outputDir = 'output';
      await fs.mkdir(outputDir, { recursive: true });
      
      const content = followers.join('\n');
      const filePath = `${outputDir}/${filename}`;
      await fs.writeFile(filePath, content, 'utf-8');
      
      console.log(`\n✓ Followers exported to ${filePath}`);
    } catch (error) {
      console.error(`Error exporting followers: ${(error as Error).message}`);
    }
  }

  /**
   * Validate a single token
   * Uses the official Twitter API endpoint: account/verify_credentials.json
   * This is the standard method to verify if auth_token + ct0 credentials are valid
   * 
   * HTTP Status Codes:
   * - 200 OK = Token is valid
   * - 401 Unauthorized = Token is invalid/expired
   * - 403 Forbidden = Account suspended or restricted
   * - 429 Too Many Requests = Rate limited
   */
  async validateToken(tokenString: string): Promise<ValidationResult> {
    const authToken = parseAuthToken(tokenString);

    try {
      // Use the official Twitter API endpoint for verifying credentials
      // This is the standard method recommended by Twitter/X
      const response = await this.client.makeRequest(
        'https://x.com/i/api/1.1/account/verify_credentials.json',
        {
          authToken,
          method: 'GET'
        }
      );

      // Check response data for errors first (before status codes)
      // Error code 34 = "Sorry, that page does not exist" - means auth worked, endpoint issue
      if (response.data && typeof response.data === 'object') {
        const data = response.data as { 
          id_str?: string;
          screen_name?: string;
          errors?: Array<{ code?: number; message?: string }>;
        };

        // Check for errors in response
        if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
          const error = data.errors[0];
          
          // Error code 34 = "Sorry, that page does not exist"
          // This means authentication worked, but endpoint doesn't exist → token is VALID
          // Username will be fetched separately using getUsernameFromToken
          if (error.code === 34) {
            return { status: 'valid' }; // Username will be fetched in validation loop
          }
          
          // Check for suspension
          if (error.code === 64 || error.code === 326) {
            return { status: 'suspended', error: error.message || 'Account suspended' };
      }

          // Check for bot detection
          if (error.code === 226) {
            return { status: 'bot-detected', error: 'Bot detection triggered' };
      }
        }
      }
      
      // Check HTTP status codes - these are definitive for verify_credentials endpoint

      // 200 OK = Token is valid (response contains user profile data)
      if (response.ok && response.status === 200) {
        // Verify we got user data (not just an error in the body)
        if (response.data && typeof response.data === 'object') {
          const data = response.data as { 
            id_str?: string;
            screen_name?: string;
            name?: string;
            errors?: Array<{ code?: number; message?: string }>;
          };
          
          // If we have user data (id_str or screen_name), token is valid
          if (data.id_str || data.screen_name) {
            return { 
              status: 'valid',
              username: data.screen_name || undefined // Extract username
            };
          }
          
          // If there are errors in the response body even with 200 status
          if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
            const error = data.errors[0];
            
            // Check for suspension
            if (error.code === 64 || error.code === 326) {
              return { status: 'suspended', error: error.message || 'Account suspended' };
            }
            
            // Check for bot detection
            if (error.code === 226) {
              return { status: 'bot-detected', error: 'Bot detection triggered' };
            }
            
            // Other errors with 200 status are unusual - assume invalid
            return { status: 'invalid', error: error.message || `Error code: ${error.code}` };
          }
        }
        
        // 200 OK with no user data = suspicious, but assume valid
        // Try to extract username from response even if structure is different
        if (response.data && typeof response.data === 'object') {
          const data = response.data as { 
            screen_name?: string;
            name?: string;
            [key: string]: unknown;
          };
          if (data.screen_name) {
            return { status: 'valid', username: data.screen_name };
          }
        }
        return { status: 'valid' };
      }

      // 401 Unauthorized = Token is invalid/expired
      if (response.status === 401) {
        return { status: 'invalid', error: 'Token expired or invalid (401)' };
      }

      // 403 Forbidden = Account suspended or restricted
      if (response.status === 403) {
        // Check for bot detection
        const botCheck = this.client.isBotDetected(response);
        if (botCheck.detected) {
          return { status: 'bot-detected', error: botCheck.error };
        }
        
        // Check error details
        if (response.data && typeof response.data === 'object') {
          const data = response.data as { errors?: Array<{ code?: number; message?: string }> };
          if (data.errors && Array.isArray(data.errors)) {
            const error = data.errors[0];
            if (error.code === 64 || error.code === 326) {
              return { status: 'suspended', error: 'Account suspended' };
            }
            if (error.code === 226) {
              return { status: 'bot-detected', error: 'Bot detection triggered' };
            }
            return { status: 'suspended', error: error.message || 'Account suspended or restricted (403)' };
          }
        }
        return { status: 'suspended', error: 'Account suspended or restricted (403)' };
      }

      // 429 Too Many Requests = Rate limited
      if (response.status === 429) {
        return { status: 'rate-limited', error: 'Rate limit exceeded' };
      }

      // Check for bot detection in other statuses
      const botCheck = this.client.isBotDetected(response);
      if (botCheck.detected) {
        return { status: 'bot-detected', error: botCheck.error };
      }

      // For any other status (404, 500, etc.), assume invalid
      const errorDetails = response.data && typeof response.data === 'object' 
        ? JSON.stringify(response.data).substring(0, 100)
        : `Status: ${response.status}`;
      
      return { status: 'invalid', error: errorDetails };
    } catch (error) {
      return { status: 'error', error: (error as Error).message };
    }
  }

  /**
   * Validate tokens from file
   */
  async validateFromFile(filePath: string = 'tokens.txt'): Promise<ValidationResults> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const tokens = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      console.log(`Validating ${tokens.length} tokens...\n`);

      const results: ValidationResults = {
        valid: [],
        invalid: [],
        suspended: [],
        rateLimited: [],
        botDetected: [],
        errors: []
      };

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        console.log(`[${i + 1}/${tokens.length}] Validating token...`);
        
        const result = await this.validateToken(token);
        result.token = token.substring(0, 20) + '...'; // Partial token for display

        // Always try to get username and followers if token is valid
        if (result.status === 'valid') {
          try {
            // Get ct0 token for username fetch (silent mode to avoid duplicate logs)
            const authToken = parseAuthToken(token);
            const ct0 = await this.client.getCSRFToken(authToken, true); // Silent mode
            const username = await this.getUsernameFromToken(token, ct0);
            if (username) {
              result.username = username;
              
              // Get followers for this token
              console.log(`  Getting followers for @${username}...`);
              await this.getFollowersFromToken(token, 100); // Get first 100 followers (method will display them)
            }
          } catch (error) {
            // Silently fail if username/followers fetch fails
          }
        }

        switch (result.status) {
          case 'valid':
            results.valid.push(result);
            const usernameDisplay = result.username ? ` (@${result.username})` : '';
            console.log(`  ✓ Valid${usernameDisplay}`);
            break;
          case 'invalid':
            results.invalid.push(result);
            console.log(`  ✗ Invalid: ${result.error || 'Unknown error'}`);
            break;
          case 'suspended':
            results.suspended.push(result);
            console.log(`  ✗ Suspended: ${result.error || 'Account suspended'}`);
            break;
          case 'rate-limited':
            results.rateLimited.push(result);
            console.log(`  ⚠ Rate Limited: ${result.error || 'Rate limit exceeded'}`);
            break;
          case 'bot-detected':
            results.botDetected.push(result);
            console.log(`  ⚠ Bot Detected: ${result.error || 'Error 226 detected'}`);
            break;
          default:
            results.errors.push(result);
            console.log(`  ✗ Error: ${result.error || 'Unknown error'}`);
        }

        // Delay between validations
        await this.delay(1000);
      }

      // Export results
      await this.exportResults(results);

      return results;
    } catch (error) {
      console.error('Error reading tokens file:', (error as Error).message);
      throw error;
    }
  }

  /**
   * Export validation results
   */
  async exportResults(results: ValidationResults): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = 'output';
    
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch {}

    const summary = {
      total: Object.values(results).reduce((sum, arr) => sum + arr.length, 0),
      valid: results.valid.length,
      invalid: results.invalid.length,
      suspended: results.suspended.length,
      rateLimited: results.rateLimited.length,
      botDetected: results.botDetected.length,
      errors: results.errors.length
    };

    // Write summary
    await fs.writeFile(
      `${outputDir}/validation-summary-${timestamp}.json`,
      JSON.stringify(summary, null, 2)
    );

    // Write detailed results
    await fs.writeFile(
      `${outputDir}/validation-results-${timestamp}.json`,
      JSON.stringify(results, null, 2)
    );

    // Write valid tokens only
    const validTokens = results.valid.map(r => r.token).join('\n');
    await fs.writeFile(
      `${outputDir}/valid-tokens-${timestamp}.txt`,
      validTokens
    );

    console.log(`\nResults exported to ${outputDir}/`);
    console.log(`Summary: ${summary.valid} valid, ${summary.invalid} invalid, ${summary.suspended} suspended`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
