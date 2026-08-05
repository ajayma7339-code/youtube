import 'dotenv/config';

export const CONFIG = {
  gemini: { apiKey: process.env.GEMINI_API_KEY || '' },
  pexels: { apiKey: process.env.PEXELS_API_KEY || '' },
  pixabay: { apiKey: process.env.PIXABAY_API_KEY || '' },
  elevenlabs: { apiKey: process.env.ELEVENLABS_API_KEY || '' },
  youtube: {
    clientId: process.env.YT_CLIENT_ID || '',
    clientSecret: process.env.YT_CLIENT_SECRET || '',
    refreshToken: process.env.YT_REFRESH_TOKEN || ''
  },
  niches: ['science', 'history', 'trivia', 'motivational', 'finance'] as const,
  paths: {
    usedTopics: 'data/used-topics.json',
    keywordCache: 'data/keyword-cache.json',
    analyticsLog: 'data/analytics-log.json',
    tempAssets: 'temp/assets',
    logs: 'logs'
  }
};

export type Niche = typeof CONFIG.niches[number];

export interface ScriptResult {
  script: string;
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  hook_line: string;
  niche: Niche;
  topic: string;
  is_long_form: boolean;
}

export interface SceneAsset {
  sceneText: string;
  imagePath: string;
}
