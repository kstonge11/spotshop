#!/usr/bin/env node

/**
 * Spotify Refresh Token Generator
 * 
 * Run this once to get a refresh token for your Spotshop app.
 * The token lets your app access the Spotify API without user login.
 * 
 * Usage:
 *   1. Make sure your .env has SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET
 *   2. Run: node generate-spotify-token.js
 *   3. Open the URL it prints in your browser
 *   4. Authorize with Spotify
 *   5. Copy the refresh token into your .env
 */

require('dotenv').config();

const http = require('http');
const { URL } = require('url');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = 'http://127.0.0.1:3001/auth/callback';
const PORT = 3001;

// Scopes needed for track/playlist lookups
const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read'
].join(' ');

// Validate credentials
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Missing credentials!\n');
  console.error('Make sure your .env file has:');
  console.error('  SPOTIFY_CLIENT_ID=your_client_id');
  console.error('  SPOTIFY_CLIENT_SECRET=your_client_secret');
  process.exit(1);
}

// Build authorization URL
const authParams = new URLSearchParams({
  response_type: 'code',
  client_id: CLIENT_ID,
  scope: SCOPES,
  redirect_uri: REDIRECT_URI,
});

const authUrl = `https://accounts.spotify.com/authorize?${authParams.toString()}`;

console.log('🎵 Spotify Refresh Token Generator');
console.log('===================================\n');
console.log('Step 1: Open this URL in your browser:\n');
console.log(authUrl);
console.log('\nStep 2: Log in and authorize the app');
console.log('Step 3: You\'ll be redirected back here automatically\n');
console.log('Waiting for callback...\n');

// Start server to catch the callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/auth/callback') {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      console.error('❌ Authorization denied:', error);
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<h1>❌ Authorization Failed</h1><p>${error}</p>`);
      server.close();
      process.exit(1);
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>❌ No authorization code received</h1>');
      return;
    }

    try {
      // Exchange code for tokens
      const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
      
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: REDIRECT_URI,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        throw new Error(`${tokenData.error}: ${tokenData.error_description}`);
      }

      // Success!
      console.log('✅ Success! Here\'s your refresh token:\n');
      console.log('─'.repeat(60));
      console.log(tokenData.refresh_token);
      console.log('─'.repeat(60));
      console.log('\nAdd this to your .env file:');
      console.log(`SPOTIFY_REFRESH_TOKEN=${tokenData.refresh_token}`);
      console.log('\nYou can now close this terminal and use Spotshop! 🎉');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Spotify Token Generated</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            h1 { color: #1DB954; }
            code { background: #f4f4f4; padding: 10px; display: block; word-break: break-all; border-radius: 4px; }
            .env { background: #1a1a1a; color: #1DB954; padding: 15px; border-radius: 4px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1>✅ Success!</h1>
          <p>Your refresh token has been generated. Add this to your <code>.env</code> file:</p>
          <div class="env">
            <code>SPOTIFY_REFRESH_TOKEN=${tokenData.refresh_token}</code>
          </div>
          <p style="margin-top: 20px; color: #666;">You can close this tab now.</p>
        </body>
        </html>
      `);

      server.close();
      setTimeout(() => process.exit(0), 1000);

    } catch (err) {
      console.error('❌ Token exchange failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h1>❌ Error</h1><p>${err.message}</p>`);
      server.close();
      process.exit(1);
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server listening on http://127.0.0.1:${PORT}`);
});

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\nCancelled.');
  server.close();
  process.exit(0);
});
