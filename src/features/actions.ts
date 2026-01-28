/**
 * Basic Twitter Actions
 */

import { TwitterClient } from '../utils/httpClient.js';
import { parseAuthToken } from '../utils/auth.js';
import { addInvisibleChars } from '../utils/headers.js';

interface ActionResult {
  success: boolean;
  error?: string;
  tweetId?: string;
  quoteId?: string;
  replyId?: string;
}

interface CreateTweetResponse {
  data?: {
    create_tweet?: {
      tweet_results?: {
        result?: {
          rest_id?: string;
        };
      };
    };
  };
}

export class TwitterActions {
  private client: TwitterClient;

  constructor() {
    this.client = new TwitterClient();
  }

  async initialize(): Promise<void> {
    await this.client.initialize();
  }

  /**
   * Get required features object for CreateTweet requests
   */
  private getRequiredFeatures(): Record<string, boolean> {
    return {
      rweb_tipjar_consumption_enabled: false,
      verified_phone_label_enabled: false,
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
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_profile_redirect_enabled: false,
      view_counts_everywhere_api_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: false,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: false,
      responsive_web_grok_show_grok_translated_post: false,
      longform_notetweets_inline_media_enabled: false,
      responsive_web_grok_analyze_button_fetch_trends_enabled: false,
      profile_label_improvements_pcf_label_in_post_enabled: false,
      communities_web_enable_tweet_community_results_fetch: false,
      responsive_web_grok_imagine_annotation_enabled: false
    };
  }

  /**
   * Post a tweet
   */
  async postTweet(authToken: string, text: string): Promise<ActionResult> {
    try {
      const features = this.getRequiredFeatures();
      const requestBody = {
        variables: {
          tweet_text: text,
          dark_request: false,
          media: {
            media_entities: [],
            possibly_sensitive: false
          },
          semantic_annotation_ids: []
        },
        features: features
      };
      
      const response = await this.client.makeRequest(
        'https://x.com/i/api/graphql/f4NGXqNlXoGYCWploMNtlQ/CreateTweet',
        {
          authToken,
          method: 'POST',
          body: requestBody
        }
      );

      const botCheck = this.client.isBotDetected(response);
      if (botCheck.detected) {
        throw new Error(botCheck.error);
      }

      // Check for duplicate error (can occur even with status 200)
      const duplicateCheck = this.client.isDuplicateError(response);
      if (duplicateCheck.duplicate) {
        console.log(`⚠ Duplicate tweet detected. Retrying with modified text...`);
        // Retry with invisible chars
        const modifiedText = addInvisibleChars(text);
        return this.postTweet(authToken, modifiedText);
      }

      // Check for errors in response body even if status is 200
      if (response.data && typeof response.data === 'object') {
        const data = response.data as { errors?: Array<{ code?: number; message?: string }> };
        if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
          const errorMessages = data.errors.map(e => e.message || `Code ${e.code}`).join(', ');
          throw new Error(`Twitter API error: ${errorMessages}`);
        }
      }

      if (response.ok) {
        const data = response.data as CreateTweetResponse;
        const tweetId = data?.data?.create_tweet?.tweet_results?.result?.rest_id;
        
        // Verify tweet was actually created
        if (!tweetId) {
          // Log the response to see what Twitter returned
          const responseData = response.data && typeof response.data === 'object'
            ? JSON.stringify(response.data, null, 2)
            : 'No response data';
          throw new Error(`Tweet creation returned OK but no tweet ID. Response: ${responseData}`);
        }
        
        console.log(`✓ Tweet posted successfully! Tweet ID: ${tweetId}`);
        console.log(`  View tweet: https://x.com/i/web/status/${tweetId}`);
        return { success: true, tweetId };
      }

      // Log full error details for debugging
      const errorDetails = response.data && typeof response.data === 'object'
        ? JSON.stringify(response.data, null, 2)
        : `Status: ${response.status}`;
      throw new Error(`Failed to post tweet: ${response.status}\nDetails: ${errorDetails}`);
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Like a tweet
   */
  async likeTweet(authToken: string, tweetId: string): Promise<ActionResult> {
    try {
      const response = await this.client.makeRequest(
        `https://twitter.com/i/api/graphql/-/FavoriteTweet`,
        {
          authToken,
          method: 'POST',
          body: {
            variables: {
              tweet_id: tweetId
            }
          }
        }
      );

      const botCheck = this.client.isBotDetected(response);
      if (botCheck.detected) {
        throw new Error(botCheck.error);
      }

      return { success: response.ok };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Retweet
   */
  async retweet(authToken: string, tweetId: string): Promise<ActionResult> {
    try {
      const response = await this.client.makeRequest(
        `https://twitter.com/i/api/graphql/-/CreateRetweet`,
        {
          authToken,
          method: 'POST',
          body: {
            variables: {
              tweet_id: tweetId,
              dark_request: false
            }
          }
        }
      );

      const botCheck = this.client.isBotDetected(response);
      if (botCheck.detected) {
        throw new Error(botCheck.error);
      }

      return { success: response.ok };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Quote tweet
   */
  async quoteTweet(authToken: string, tweetId: string, text: string): Promise<ActionResult> {
    try {
      const response = await this.client.makeRequest(
        'https://x.com/i/api/graphql/f4NGXqNlXoGYCWploMNtlQ/CreateTweet',
        {
          authToken,
          method: 'POST',
          body: {
            variables: {
              tweet_text: text,
              attachment_url: `https://twitter.com/i/web/status/${tweetId}`,
              dark_request: false,
              media: {
                media_entities: [],
                possibly_sensitive: false
              },
              semantic_annotation_ids: []
            },
            features: this.getRequiredFeatures()
          }
        }
      );

      const botCheck = this.client.isBotDetected(response);
      if (botCheck.detected) {
        throw new Error(botCheck.error);
      }

      const duplicateCheck = this.client.isDuplicateError(response);
      if (duplicateCheck.duplicate) {
        const modifiedText = addInvisibleChars(text);
        return this.quoteTweet(authToken, tweetId, modifiedText);
      }

      if (response.ok) {
        const data = response.data as CreateTweetResponse;
        const quoteId = data?.data?.create_tweet?.tweet_results?.result?.rest_id;
        return { success: true, quoteId };
      }

      throw new Error(`Failed to quote tweet: ${response.status}`);
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Reply to a tweet
   */
  async reply(authToken: string, tweetId: string, text: string): Promise<ActionResult> {
    try {
      const response = await this.client.makeRequest(
        'https://x.com/i/api/graphql/f4NGXqNlXoGYCWploMNtlQ/CreateTweet',
        {
          authToken,
          method: 'POST',
          body: {
            variables: {
              tweet_text: text,
              reply: {
                in_reply_to_tweet_id: tweetId,
                exclude_reply_user_ids: []
              },
              dark_request: false,
              media: {
                media_entities: [],
                possibly_sensitive: false
              },
              semantic_annotation_ids: []
            },
            features: this.getRequiredFeatures()
          }
        }
      );

      const botCheck = this.client.isBotDetected(response);
      if (botCheck.detected) {
        throw new Error(botCheck.error);
      }

      if (response.ok) {
        const data = response.data as CreateTweetResponse;
        const replyId = data?.data?.create_tweet?.tweet_results?.result?.rest_id;
        return { success: true, replyId };
      }

      throw new Error(`Failed to reply: ${response.status}`);
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Follow a user
   */
  async follow(authToken: string, userId: string): Promise<ActionResult> {
    try {
      const response = await this.client.makeRequest(
        `https://twitter.com/i/api/1.1/friendships/create.json?user_id=${userId}`,
        {
          authToken,
          method: 'POST'
        }
      );

      const botCheck = this.client.isBotDetected(response);
      if (botCheck.detected) {
        throw new Error(botCheck.error);
      }

      return { success: response.ok };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Send DM
   */
  async sendDM(authToken: string, userId: string, text: string): Promise<ActionResult> {
    try {
      const response = await this.client.makeRequest(
        'https://twitter.com/i/api/1.1/direct_messages/events/new.json',
        {
          authToken,
          method: 'POST',
          body: {
            event: {
              type: 'message_create',
              message_create: {
                target: {
                  recipient_id: userId
                },
                message_data: {
                  text: text
                }
              }
            }
          }
        }
      );

      const botCheck = this.client.isBotDetected(response);
      if (botCheck.detected) {
        throw new Error(botCheck.error);
      }

      return { success: response.ok };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
