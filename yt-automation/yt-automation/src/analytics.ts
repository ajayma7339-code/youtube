// Fetches performance stats for recently uploaded videos so the topic-picker
// can learn what's working (higher views/CTR niches get picked more often).
// Run via: npm run analyze  (also runs automatically at end of each pipeline call)

import { google } from 'googleapis';
import fs from 'fs';
import { CONFIG } from './config.js';

interface VideoStat {
  videoId: string;
  title: string;
  niche: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  checkedAt: string;
}

function getAuthedClient() {
  const oauth2Client = new google.auth.OAuth2(CONFIG.youtube.clientId, CONFIG.youtube.clientSecret);
  oauth2Client.setCredentials({ refresh_token: CONFIG.youtube.refreshToken });
  return oauth2Client;
}

function loadLog(): VideoStat[] {
  if (!fs.existsSync(CONFIG.paths.analyticsLog)) return [];
  return JSON.parse(fs.readFileSync(CONFIG.paths.analyticsLog, 'utf-8'));
}

function saveLog(log: VideoStat[]) {
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(CONFIG.paths.analyticsLog, JSON.stringify(log, null, 2));
}

/** Register a freshly uploaded video so it gets tracked going forward. */
export function trackNewUpload(videoId: string, title: string, niche: string) {
  const log = loadLog();
  log.push({ videoId, title, niche, publishedAt: new Date().toISOString(), views: 0, likes: 0, comments: 0, checkedAt: new Date().toISOString() });
  saveLog(log);
}

/** Refresh stats for all tracked videos from the last 30 days. */
export async function refreshStats() {
  const auth = getAuthedClient();
  const youtube = google.youtube({ version: 'v3', auth });
  const log = loadLog();
  const recent = log.filter(v => Date.now() - new Date(v.publishedAt).getTime() < 30 * 24 * 3600 * 1000);
  if (recent.length === 0) return log;

  const ids = recent.map(v => v.videoId);
  const res = await youtube.videos.list({ part: ['statistics'], id: ids });

  for (const item of res.data.items || []) {
    const entry = log.find(v => v.videoId === item.id);
    if (entry && item.statistics) {
      entry.views = Number(item.statistics.viewCount || 0);
      entry.likes = Number(item.statistics.likeCount || 0);
      entry.comments = Number(item.statistics.commentCount || 0);
      entry.checkedAt = new Date().toISOString();
    }
  }
  saveLog(log);
  return log;
}

/** Which niche is performing best (avg views), to bias tomorrow's topic pick. */
export function bestPerformingNiche(log: VideoStat[]): string | null {
  const byNiche: Record<string, { total: number; count: number }> = {};
  for (const v of log) {
    if (!byNiche[v.niche]) byNiche[v.niche] = { total: 0, count: 0 };
    byNiche[v.niche].total += v.views;
    byNiche[v.niche].count += 1;
  }
  let best: string | null = null;
  let bestAvg = -1;
  for (const [niche, data] of Object.entries(byNiche)) {
    const avg = data.total / data.count;
    if (avg > bestAvg) { bestAvg = avg; best = niche; }
  }
  return best;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  refreshStats().then(log => {
    console.log(`Tracked videos: ${log.length}`);
    console.log('Best performing niche so far:', bestPerformingNiche(log));
    console.table(log.map(v => ({ title: v.title.slice(0, 40), niche: v.niche, views: v.views, likes: v.likes })));
  });
}
