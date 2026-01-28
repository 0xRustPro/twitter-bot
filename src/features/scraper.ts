/**
 * Scraper System - Followers, Following, Likers, Retweeters
 */

import { TwitterClient } from '../utils/httpClient.js';
import { parseAuthToken } from '../utils/auth.js';
import fs from 'fs/promises';

interface TwitterUser {
  legacy?: {
    screen_name?: string;
  };
}

interface TimelineEntry {
  content?: {
    entryType?: string;
    cursorType?: string;
    value?: string;
    itemContent?: {
      user_results?: {
        result?: TwitterUser;
      };
    };
  };
  entries?: TimelineEntry[];
}

interface TwitterResponse {
  data?: {
    user?: {
      result?: {
        timeline?: {
          timeline?: {
            instructions?: TimelineEntry[];
          };
        };
      };
    };
    tweetDetail?: {
      liked_by?: {
        users?: TwitterUser[];
        next_cursor?: string | null;
      };
      retweeted_by?: {
        users?: TwitterUser[];
        next_cursor?: string | null;
      };
    };
  };
}

export class Scraper {
  private client: TwitterClient;

  constructor() {
    this.client = new TwitterClient();
  }

  async initialize(): Promise<void> {
    await this.client.initialize();
  }

  /**
   * Get required features object for GraphQL requests
   * Twitter requires these features to be included in GraphQL requests
   */
  private getRequiredFeatures(): Record<string, boolean> {
    return {
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      highlights_tweets_tab_ui_enabled: false,
      subscriptions_verification_info_verified_since_enabled: false,
      profile_label_improvements_pcf_label_in_post_enabled: false,
      rweb_tipjar_consumption_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: false,
      subscriptions_feature_can_gift_premium: false,
      responsive_web_profile_redirect_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: false,
      subscriptions_verification_info_is_identity_verified_enabled: false,
      verified_phone_label_enabled: false,
      hidden_profile_subscriptions_enabled: false,
      responsive_web_twitter_article_notes_tab_enabled: false,
      // Additional features from actions.ts for compatibility
      creator_subscriptions_quote_tweet_preview_enabled: false,
      responsive_web_enhance_cards_enabled: false,
      responsive_web_grok_image_annotation_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: false,
      c9s_tweet_anatomy_moderator_badge_enabled: false,
      responsive_web_grok_annotations_enabled: false,
      premium_content_api_read_enabled: false,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: false,
      tweet_awards_web_tipping_enabled: false,
      post_ctas_fetch_enabled: false,
      longform_notetweets_rich_text_read_enabled: false,
      articles_preview_enabled: false,
      longform_notetweets_consumption_enabled: false,
      responsive_web_grok_analyze_post_followups_enabled: false,
      responsive_web_edit_tweet_api_enabled: false,
      responsive_web_grok_community_note_auto_translation_is_enabled: false,
      responsive_web_twitter_article_tweet_consumption_enabled: false,
      responsive_web_jetfuel_frame: false,
      standardized_nudges_misinfo: false,
      responsive_web_grok_analysis_button_from_backend: false,
      responsive_web_grok_share_attachment_enabled: false,
      view_counts_everywhere_api_enabled: false,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: false,
      responsive_web_grok_show_grok_translated_post: false,
      longform_notetweets_inline_media_enabled: false,
      responsive_web_grok_analyze_button_fetch_trends_enabled: false,
      communities_web_enable_tweet_community_results_fetch: false,
      responsive_web_grok_imagine_annotation_enabled: false
    };
  }

  /**
   * Get user info by username (to verify user exists and get user_id)
   */
  private async getUserByScreenName(username: string, authToken: string): Promise<{ screen_name?: string; id_str?: string; followers_count?: number; friends_count?: number } | null> {
    try {
      const cleanUsername = username.replace('@', '');
      // Try multiple GraphQL hashes - Twitter changes these frequently
      // If the first hash fails, we try alternative hashes (previous versions that might still work)
      // To find current hashes: Open Twitter in browser → DevTools → Network → Filter "graphql" → View a profile
      const graphqlHashes = [
        '-oaLodhGbbnzJBACb1kk2Q', // Current hash (update this when it stops working)
        '1VOOyvKkiI3FMmkeDNxM9A', // Previous hash (alternative/fallback)
        'G3KGOASz96M-Qu0nwmGXNg', // Older hash (alternative/fallback)
        // Add more alternative hashes here if you find them
      ];
      
      for (const graphqlHash of graphqlHashes) {
        try {
          const variables = {
            screen_name: cleanUsername,
            withHighlightedLabel: true
          };
          
          const features = this.getRequiredFeatures();
          
          // Include both variables and features in the URL query string
          const url = `https://x.com/i/api/graphql/${graphqlHash}/UserByScreenName?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(features))}`;
          
          const response = await this.client.makeRequest(url, {
            authToken,
            method: 'GET'
          });

          if (!response.ok) {
            // Log the error for debugging (only for first hash to avoid spam)
            if (graphqlHash === graphqlHashes[0]) {
              console.error(`  GraphQL request failed: Status ${response.status}`);
              if (response.data && typeof response.data === 'object') {
                const errorData = response.data as { errors?: Array<{ message?: string; code?: number }> };
                if (errorData.errors && errorData.errors.length > 0) {
                  console.error(`  Error: ${errorData.errors[0].message || 'Unknown error'}`);
                }
              }
            }
            // Try next hash if this one fails
            continue;
          }

          const data = response.data as {
            data?: {
              user?: {
                result?: {
                  legacy?: {
                    screen_name?: string;
                    followers_count?: number;
                    friends_count?: number;
                  };
                  id?: string;
                };
              };
            };
            errors?: Array<{ message?: string; code?: number }>;
          };

          // Check for errors in response
          if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
            // Log the error for debugging (only for first hash to avoid spam)
            if (graphqlHash === graphqlHashes[0]) {
              const error = data.errors[0];
              console.error(`  GraphQL API error: ${error.message || 'Unknown error'} (code: ${error.code || 'N/A'})`);
            }
            // Try next hash if this one has errors
            continue;
          }

          const user = data?.data?.user?.result;
          if (user) {
            return {
              screen_name: user.legacy?.screen_name,
              id_str: user.id,
              followers_count: user.legacy?.followers_count,
              friends_count: user.legacy?.friends_count
            };
          }
        } catch (hashError) {
          // Try next hash if this one throws an error
          continue;
        }
      }

      // If all hashes failed, try the old endpoint format as fallback
      try {
        const fallbackUrl = `https://twitter.com/i/api/graphql/G3KGOASz96M-Qu0nwmGXNg/UserByScreenName?variables=${encodeURIComponent(JSON.stringify({ screen_name: cleanUsername, withSafetyModeUserFields: true }))}`;
        const fallbackResponse = await this.client.makeRequest(fallbackUrl, {
          authToken,
          method: 'GET'
        });

        if (fallbackResponse.ok) {
          const fallbackData = fallbackResponse.data as {
            data?: {
              user?: {
                result?: {
                  legacy?: {
                    screen_name?: string;
                    followers_count?: number;
                    friends_count?: number;
                  };
                  id?: string;
                };
              };
            };
          };

          const user = fallbackData?.data?.user?.result;
          if (user) {
            return {
              screen_name: user.legacy?.screen_name,
              id_str: user.id,
              followers_count: user.legacy?.followers_count,
              friends_count: user.legacy?.friends_count
            };
          }
        }
      } catch (fallbackError) {
        // Fallback also failed
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get follower count for a username (returns only the number)
   * Uses getUserByScreenName internally to get the count
   */
  async getFollowerCount(username: string, authToken: string): Promise<number | null> {
    try {
      const userInfo = await this.getUserByScreenName(username, authToken);
      if (!userInfo) {
        console.error(`Error: Could not fetch user info for @${username}`);
        console.error(`  Possible reasons:`);
        console.error(`  - Username doesn't exist`);
        console.error(`  - Account is private/suspended`);
        console.error(`  - GraphQL hash is outdated (check GRAPHQL_GUIDE.md)`);
        console.error(`  - Authentication failed`);
        return null;
      }
      return userInfo.followers_count || null;
    } catch (error) {
      console.error(`Error getting follower count: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Get following count for a username (returns only the number)
   * Uses getUserByScreenName internally to get the count
   */
  async getFollowingCount(username: string, authToken: string): Promise<number | null> {
    try {
      const userInfo = await this.getUserByScreenName(username, authToken);
      if (!userInfo) {
        console.error(`Error: Could not fetch user info for @${username}`);
        console.error(`  Possible reasons:`);
        console.error(`  - Username doesn't exist`);
        console.error(`  - Account is private/suspended`);
        console.error(`  - GraphQL hash is outdated (check GRAPHQL_GUIDE.md)`);
        console.error(`  - Authentication failed`);
        return null;
      }
      return userInfo.friends_count || null;
    } catch (error) {
      console.error(`Error getting following count: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Scrape followers of a username (or authenticated user if username not provided)
   */
  async scrapeFollowers(username: string | null, authToken: string, maxResults: number = 1000, originalToken?: string): Promise<string[]> {
    const users: string[] = [];
    let cursor: string | null = null;
    let count = 0;
    let targetUsername: string;

    // If no username provided, get followers of the authenticated user
    let userInfo: { screen_name?: string; id_str?: string } | null = null;
    if (!username || username.trim() === '') {
      // Get username from token
      if (!originalToken) {
        console.error(`Error: Original token string required to get username`);
        return [];
      }
      try {
        const tokenValidator = new (await import('./tokenValidator.js')).TokenValidator();
        await tokenValidator.initialize();
        const tokenUsername = await tokenValidator.getUsernameFromToken(originalToken);
        if (!tokenUsername) {
          console.error(`Error: Could not get username from auth token`);
          return [];
        }
        targetUsername = tokenUsername;
        console.log(`Getting followers for authenticated user @${targetUsername}...`);
      } catch (error) {
        console.error(`Error: Could not get username from token: ${(error as Error).message}`);
        return [];
      }
    } else {
      targetUsername = username.replace('@', '');
      console.log(`Scraping followers of @${targetUsername}...`);

      // First, verify the user exists
      userInfo = await this.getUserByScreenName(targetUsername, authToken);
      if (!userInfo) {
        console.error(`Error: User @${targetUsername} not found or cannot be accessed`);
        console.error(`  This could mean:`);
        console.error(`  - The username doesn't exist`);
        console.error(`  - The account is private/suspended`);
        console.error(`  - The GraphQL endpoint hash needs to be updated`);
        console.error(`  - Authentication failed`);
        return [];
      }

      console.log(`  Found user: @${userInfo.screen_name || targetUsername}`);
    }

    while (count < maxResults) {
      try {
        const variables = {
          screen_name: targetUsername,
          count: 100,
          cursor: cursor || null
        };

        // Try GraphQL endpoint (try multiple query ID formats)
        // First try with a known query ID format
        let url = `https://twitter.com/i/api/graphql/-/Followers?variables=${encodeURIComponent(JSON.stringify(variables))}`;
        let response = await this.client.makeRequest(url, {
          authToken,
          method: 'GET'
        });

        // If 404, the endpoint might not exist or query ID is wrong
        // Try alternative: use user_id instead of screen_name if we have it
        if (!response.ok && response.status === 404 && userInfo && userInfo.id_str) {
          const variablesWithId = {
            userId: userInfo.id_str,
            count: 100,
            cursor: cursor || null
          };
          url = `https://twitter.com/i/api/graphql/-/Followers?variables=${encodeURIComponent(JSON.stringify(variablesWithId))}`;
          response = await this.client.makeRequest(url, {
            authToken,
            method: 'GET'
          });
        }

        if (!response.ok) {
          // Try REST API as last resort
          if (response.status === 404) {
            try {
              const restUrl = `https://api.twitter.com/1.1/followers/list.json?screen_name=${encodeURIComponent(targetUsername)}&count=200&cursor=${cursor || -1}`;
              const restResponse = await this.client.makeRequest(restUrl, {
                authToken,
                method: 'GET'
              });

              if (restResponse.ok && restResponse.data) {
                const restData = restResponse.data as {
                  users?: Array<{ screen_name?: string }>;
                  next_cursor?: number;
                  next_cursor_str?: string;
                };

                if (restData.users) {
                  for (const user of restData.users) {
                    if (user.screen_name) {
                      users.push(`@${user.screen_name}`);
                      count++;
                    }
                  }

                  cursor = restData.next_cursor_str || (restData.next_cursor ? String(restData.next_cursor) : null);
                  if (!cursor || cursor === '0' || restData.users.length === 0) {
                    break;
                  }

                  console.log(`  Collected ${count} users...`);
                  await this.delay(2000);
                  continue;
                }
              }
            } catch (restError) {
              // REST API also failed, fall through to error
            }
          }
          
          console.error(`Error: ${response.status} - ${JSON.stringify(response.data)}`);
          break;
        }

        const data = response.data as TwitterResponse;
        const entries = data?.data?.user?.result?.timeline?.timeline?.instructions || [];
        const userEntries = entries
          .flatMap(entry => entry.entries || [])
          .filter(entry => entry.content?.entryType === 'TimelineTimelineItem')
          .map(entry => entry.content?.itemContent?.user_results?.result)
          .filter(Boolean) as TwitterUser[];

        for (const user of userEntries) {
          if (user.legacy?.screen_name) {
            users.push(`@${user.legacy.screen_name}`);
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

        console.log(`  Collected ${count} users...`);
        await this.delay(2000); // Rate limit protection
      } catch (error) {
        console.error(`Error scraping followers: ${(error as Error).message}`);
        break;
      }
    }

    return users;
  }

  /**
   * Scrape following of a username (or authenticated user if username not provided)
   */
  async scrapeFollowing(username: string | null, authToken: string, maxResults: number = 1000, originalToken?: string): Promise<string[]> {
    const users: string[] = [];
    let cursor: string | null = null;
    let count = 0;
    let targetUsername: string;

    // If no username provided, get following of the authenticated user
    if (!username || username.trim() === '') {
      // Get username from token
      if (!originalToken) {
        console.error(`Error: Original token string required to get username`);
        return [];
      }
      try {
        const tokenValidator = new (await import('./tokenValidator.js')).TokenValidator();
        await tokenValidator.initialize();
        const tokenUsername = await tokenValidator.getUsernameFromToken(originalToken);
        if (!tokenUsername) {
          console.error(`Error: Could not get username from auth token`);
          return [];
        }
        targetUsername = tokenUsername;
        console.log(`Getting following for authenticated user @${targetUsername}...`);
      } catch (error) {
        console.error(`Error: Could not get username from token: ${(error as Error).message}`);
        return [];
      }
    } else {
      targetUsername = username.replace('@', '');
      console.log(`Scraping following of @${targetUsername}...`);
    }

    while (count < maxResults) {
      try {
        const variables = {
          screen_name: targetUsername,
          count: 100,
          cursor: cursor || null
        };

        const url = `https://twitter.com/i/api/graphql/-/Following?variables=${encodeURIComponent(JSON.stringify(variables))}`;
        
        const response = await this.client.makeRequest(url, {
          authToken,
          method: 'GET'
        });

        if (!response.ok) {
          console.error(`Error: ${response.status} - ${JSON.stringify(response.data)}`);
          break;
        }

        const data = response.data as TwitterResponse;
        const entries = data?.data?.user?.result?.timeline?.timeline?.instructions || [];
        const userEntries = entries
          .flatMap(entry => entry.entries || [])
          .filter(entry => entry.content?.entryType === 'TimelineTimelineItem')
          .map(entry => entry.content?.itemContent?.user_results?.result)
          .filter(Boolean) as TwitterUser[];

        for (const user of userEntries) {
          if (user.legacy?.screen_name) {
            users.push(`@${user.legacy.screen_name}`);
            count++;
          }
        }

        const cursorEntry = entries
          .flatMap(entry => entry.entries || [])
          .find(entry => entry.content?.entryType === 'TimelineTimelineCursor' && entry.content?.cursorType === 'Bottom');
        
        cursor = cursorEntry?.content?.value || null;

        if (!cursor || userEntries.length === 0) {
          break;
        }

        console.log(`  Collected ${count} users...`);
        await this.delay(2000);
      } catch (error) {
        console.error(`Error scraping following: ${(error as Error).message}`);
        break;
      }
    }

    return users;
  }

  /**
   * Scrape likers of a tweet
   */
  async scrapeLikers(tweetId: string, authToken: string, maxResults: number = 1000): Promise<string[]> {
    const users: string[] = [];
    let cursor: string | null = null;
    let count = 0;

    console.log(`Scraping likers of tweet ${tweetId}...`);

    while (count < maxResults) {
      try {
        const variables = {
          tweetId,
          count: 100,
          cursor: cursor || null
        };

        const url = `https://twitter.com/i/api/graphql/-/Likers?variables=${encodeURIComponent(JSON.stringify(variables))}`;
        
        const response = await this.client.makeRequest(url, {
          authToken,
          method: 'GET'
        });

        if (!response.ok) {
          console.error(`Error: ${response.status}`);
          break;
        }

        const data = response.data as TwitterResponse;
        const entries = data?.data?.tweetDetail?.liked_by?.users || [];
        
        for (const user of entries) {
          if (user.legacy?.screen_name) {
            users.push(`@${user.legacy.screen_name}`);
            count++;
          }
        }

        cursor = data?.data?.tweetDetail?.liked_by?.next_cursor || null;

        if (!cursor || entries.length === 0) {
          break;
        }

        console.log(`  Collected ${count} users...`);
        await this.delay(2000);
      } catch (error) {
        console.error(`Error scraping likers: ${(error as Error).message}`);
        break;
      }
    }

    return users;
  }

  /**
   * Scrape retweeters of a tweet
   */
  async scrapeRetweeters(tweetId: string, authToken: string, maxResults: number = 1000): Promise<string[]> {
    const users: string[] = [];
    let cursor: string | null = null;
    let count = 0;

    console.log(`Scraping retweeters of tweet ${tweetId}...`);

    while (count < maxResults) {
      try {
        const variables = {
          tweetId,
          count: 100,
          cursor: cursor || null
        };

        const url = `https://twitter.com/i/api/graphql/-/Retweeters?variables=${encodeURIComponent(JSON.stringify(variables))}`;
        
        const response = await this.client.makeRequest(url, {
          authToken,
          method: 'GET'
        });

        if (!response.ok) {
          console.error(`Error: ${response.status}`);
          break;
        }

        const data = response.data as TwitterResponse;
        const entries = data?.data?.tweetDetail?.retweeted_by?.users || [];
        
        for (const user of entries) {
          if (user.legacy?.screen_name) {
            users.push(`@${user.legacy.screen_name}`);
            count++;
          }
        }

        cursor = data?.data?.tweetDetail?.retweeted_by?.next_cursor || null;

        if (!cursor || entries.length === 0) {
          break;
        }

        console.log(`  Collected ${count} users...`);
        await this.delay(2000);
      } catch (error) {
        console.error(`Error scraping retweeters: ${(error as Error).message}`);
        break;
      }
    }

    return users;
  }

  /**
   * Export users to file
   */
  async exportUsers(users: string[], filename: string): Promise<void> {
    const outputDir = 'output';
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch {}

    const content = users.join('\n');
    await fs.writeFile(`${outputDir}/${filename}`, content);
    console.log(`\nExported ${users.length} users to ${outputDir}/${filename}`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
