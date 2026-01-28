# Request Failures - Complete Explanation

## Request Flow Overview

When you make a request, here's what happens:

```
1. Parse auth_token from tokens.txt
2. Fetch CSRF token (ct0) from Twitter
3. Build headers with auth_token + ct0
4. Make HTTP request to Twitter API
5. Parse response
```

## Common Failure Points

### 1. **CSRF Token (ct0) Fetching Failures**

**Location:** `src/utils/auth.ts` - `fetchCSRFToken()`

**What can go wrong:**
- ❌ **Network error**: Can't reach Twitter.com
- ❌ **Invalid auth_token**: Token is expired or malformed
- ❌ **Cloudflare blocking**: IP is blocked by Cloudflare
- ❌ **Rate limiting**: Too many requests from same IP

**Error message:** `Error fetching CSRF token: [error message]`

**Solution:**
- Check your internet connection
- Verify auth_token is correct (40+ characters)
- Use proxies if Cloudflare is blocking
- Wait if rate limited

---

### 2. **Network/Connection Failures**

**Location:** `src/utils/httpClient.ts` - `makeRequest()`

**What can go wrong:**
- ❌ **DNS resolution failure**: Can't resolve twitter.com
- ❌ **Connection timeout**: Request takes too long
- ❌ **SSL/TLS errors**: Certificate issues
- ❌ **Proxy failure**: If using proxies, proxy might be down

**Error message:** `Request failed: [network error]`

**Solution:**
- Check internet connection
- Verify DNS settings
- Test proxy connectivity
- Check firewall settings

---

### 3. **Authentication Failures**

**Location:** `src/utils/httpClient.ts` - `makeRequest()`

**What can go wrong:**
- ❌ **Invalid auth_token**: Token expired or wrong format
- ❌ **Missing ct0**: CSRF token not fetched correctly
- ❌ **Token mismatch**: auth_token and ct0 don't match
- ❌ **Session expired**: Token is too old

**HTTP Status Codes:**
- `401 Unauthorized` = Token expired/invalid
- `403 Forbidden` = Suspended account or bot detection

**Solution:**
- Extract fresh tokens from browser
- Ensure token format is correct
- Check if account is suspended

---

### 4. **Bot Detection (Error 226)**

**Location:** `src/utils/httpClient.ts` - `isBotDetected()`

**What can go wrong:**
- ❌ **Missing headers**: Required headers not present
- ❌ **Invalid x-client-transaction-id**: Header format wrong
- ❌ **Suspicious activity pattern**: Too many requests too fast
- ❌ **IP reputation**: IP flagged as bot

**Error message:** `Error 226: Bot detection triggered`

**Solution:**
- Use residential proxies
- Add delays between requests
- Use warmup mode first
- Rotate tokens more frequently

---

### 5. **Twitter API Errors**

**Location:** Various endpoints

**Common Error Codes:**
- `187` = Duplicate tweet (already posted)
- `226` = Bot detection
- `326` = Account locked
- `64` = Account suspended
- `429` = Rate limit exceeded

**Solution:**
- Check error code in response
- Wait for rate limits
- Use invisible characters for duplicates
- Verify account status

---

### 6. **Proxy Issues**

**Location:** `src/utils/proxy.ts`

**What can go wrong:**
- ❌ **Invalid proxy format**: Wrong format in proxies.txt
- ❌ **Proxy authentication failed**: Wrong username/password
- ❌ **Proxy connection timeout**: Proxy server down
- ❌ **Proxy IP blocked**: Proxy IP is blacklisted

**Error message:** `Request failed: [proxy error]`

**Solution:**
- Verify proxy format: `user:pass:host:port`
- Test proxy manually
- Use different proxy
- Check proxy provider status

---

## Request Flow Diagram

```
┌─────────────────┐
│  tokens.txt     │
│  (auth_token)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Parse Token     │ ← Can fail: Invalid format
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Fetch CSRF (ct0)│ ← Can fail: Network, Cloudflare, Invalid token
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Build Headers   │ ← Can fail: Missing ct0, Invalid format
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ HTTP Request    │ ← Can fail: Network, Timeout, SSL
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Twitter API     │ ← Can fail: 401, 403, 226, 429, etc.
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Parse Response  │ ← Can fail: Invalid JSON, Unexpected format
└─────────────────┘
```

## Debugging Steps

### Step 1: Check Token Format
```bash
# Token should be 40+ characters
# Format: auth_token=abc123... or just abc123...
```

### Step 2: Test Network
```bash
curl https://twitter.com
# Should return HTML, not error
```

### Step 3: Test CSRF Fetch
The code tries to fetch ct0 from:
1. Twitter homepage (first attempt)
2. update_profile.json endpoint (fallback)
3. Generates random token (last resort - won't work)

### Step 4: Check Response
Look at the actual error message:
- `Request failed: ...` = Network/connection issue
- `Error 226` = Bot detection
- `Status: 401` = Token expired
- `Status: 403` = Suspended or forbidden
- `Status: 429` = Rate limited

### Step 5: Enable Verbose Logging
Check the console output for:
- CSRF token fetch errors
- Response status codes
- Error messages from Twitter API

## Common Solutions

### Problem: "Request failed: Network error"
**Solution:**
- Check internet connection
- Test with: `curl https://twitter.com`
- Check firewall/proxy settings

### Problem: "Error 226: Bot detection"
**Solution:**
- Use residential proxies
- Add delays between requests
- Run warmup mode first
- Rotate user agents

### Problem: "Status: 401" or "Token expired"
**Solution:**
- Extract fresh token from browser
- Token expires after ~30 days
- Re-login to Twitter and extract new token

### Problem: "Status: 403" or "Suspended"
**Solution:**
- Check if account is suspended
- Verify token is for correct account
- Account might be locked

### Problem: "Status: 429" or "Rate limited"
**Solution:**
- Wait 15 minutes
- Use more tokens (distribute load)
- Add longer delays between requests

## Best Practices

1. **Always validate tokens first**: Run `npm run validate` before campaigns
2. **Use proxies**: Especially for multiple accounts
3. **Add delays**: Don't make requests too fast
4. **Warmup accounts**: Run warmup mode before campaigns
5. **Monitor errors**: Check output files in `output/` folder
6. **Rotate tokens**: Use different tokens for different actions

## Error Messages Reference

| Error Message | Meaning | Solution |
|--------------|---------|----------|
| `Request failed: ...` | Network/connection issue | Check internet, proxies |
| `Error 226` | Bot detection | Use proxies, add delays |
| `Status: 401` | Token expired | Get fresh token |
| `Status: 403` | Suspended/forbidden | Check account status |
| `Status: 429` | Rate limited | Wait, use more tokens |
| `Error fetching CSRF token` | Can't get ct0 | Check network, token validity |
