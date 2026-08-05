import { google } from 'googleapis';
import fs from 'fs';
import { CONFIG, ScriptResult } from './config.js';

function getAuthedClient() {
  const oauth2Client = new google.auth.OAuth2(
    CONFIG.youtube.clientId,
    CONFIG.youtube.clientSecret
  );
  oauth2Client.setCredentials({ refresh_token: CONFIG.youtube.refreshToken });
  return oauth2Client;
}

export async function uploadVideo(videoPath: string, meta: ScriptResult): Promise<string> {
  const auth = getAuthedClient();
  const youtube = google.youtube({ version: 'v3', auth });

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: meta.title.slice(0, 100),
        description: meta.description,
        tags: meta.tags,
        categoryId: '27' // Education; adjust per niche if desired
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false
      }
    },
    media: {
      body: fs.createReadStream(videoPath)
    }
  });

  const videoId = res.data.id;
  if (!videoId) throw new Error('upload succeeded but no video id returned');
  return videoId;
}
