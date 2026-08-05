// Run ONCE locally: npm run get-token
// Opens a browser, you log in with your YouTube channel's Google account,
// grant permission, and this prints a refresh_token to save in .env / GitHub Secrets.

import 'dotenv/config';
import { google } from 'googleapis';
import http from 'http';
import { URL } from 'url';

const CLIENT_ID = process.env.YT_CLIENT_ID || '';
const CLIENT_SECRET = process.env.YT_CLIENT_SECRET || '';
const REDIRECT_URI = 'http://localhost:53682/oauth2callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set YT_CLIENT_ID and YT_CLIENT_SECRET in .env first (from Google Cloud Console OAuth client).');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly']
});

console.log('\nOpen this URL in your browser, log in with the Google account that owns your YouTube channel:\n');
console.log(authUrl + '\n');

const server = http.createServer(async (req, res) => {
  if (!req.url) return;
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get('code');
  if (!code) return;

  res.end('Auth successful. You can close this tab and go back to the terminal.');
  server.close();

  const { tokens } = await oauth2Client.getToken(code);
  console.log('\n=== SAVE THIS ===');
  console.log('YT_REFRESH_TOKEN=' + tokens.refresh_token);
  console.log('==================\n');
  console.log('Put this in your .env file and in GitHub repo Secrets, then delete this terminal output.');
  process.exit(0);
});

server.listen(53682, () => console.log('Waiting for you to complete login in the browser...'));
