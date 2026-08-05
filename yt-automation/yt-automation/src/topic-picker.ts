import fetch from 'node-fetch';
import fs from 'fs/promises';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CONFIG, Niche } from './config.js';

interface UsedTopicsFile {
  used: string[]; // lowercase topic strings, last 90 days kept
}

const NICHE_SUBREDDITS: Record<Niche, string[]> = {
  science: ['todayilearned', 'science'],
  history: ['todayilearned', 'history'],
  trivia: ['todayilearned', 'Damnthatsinteresting'],
  motivational: ['GetMotivated'],
  finance: ['personalfinance', 'IndiaInvestments']
};

async function loadUsedTopics(): Promise<UsedTopicsFile> {
  try {
    const raw = await fs.readFile(CONFIG.paths.usedTopics, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { used: [] };
  }
}

async function saveUsedTopic(topic: string) {
  const file = await loadUsedTopics();
  file.used.push(topic.toLowerCase());
  // keep last 500 to bound file size
  file.used = file.used.slice(-500);
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile(CONFIG.paths.usedTopics, JSON.stringify(file, null, 2));
}

function pickNicheForToday(slotIndex: number): Niche {
  // rotate deterministically by day-of-year + slot so 2 shorts/day get different niches
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const idx = (dayOfYear + slotIndex) % CONFIG.niches.length;
  return CONFIG.niches[idx];
}

async function fetchTrendingTopic(niche: Niche): Promise<string | null> {
  const subs = NICHE_SUBREDDITS[niche];
  const sub = subs[Math.floor(Math.random() * subs.length)];
  try {
    const res = await fetch(`https://www.reddit.com/r/${sub}/top.json?t=day&limit=15`, {
      headers: { 'User-Agent': 'yt-automation-bot/1.0' }
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const posts = json?.data?.children || [];
    const used = (await loadUsedTopics()).used;
    for (const p of posts) {
      const title: string = p?.data?.title || '';
      const clean = title.replace(/^TIL\s*/i, '').trim();
      if (clean && !used.includes(clean.toLowerCase()) && clean.length < 200) {
        return clean;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function generateFreshTopic(niche: Niche): Promise<string> {
  const genAI = new GoogleGenerativeAI(CONFIG.gemini.apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const used = (await loadUsedTopics()).used.slice(-40).join('; ');
  const prompt = `Give ONE surprising, specific ${niche} topic suitable for a 30-60 second YouTube Short.
Avoid these already-used topics: ${used || 'none'}.
Reply with ONLY the topic sentence, nothing else, no quotes, no numbering.`;
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

/**
 * Picks today's topic. ~30% chance tries trending source first (per spec),
 * falls back to Gemini fresh-generate if trending fails or on the 70% roll.
 */
export async function pickTopic(slotIndex: number): Promise<{ niche: Niche; topic: string }> {
  const niche = pickNicheForToday(slotIndex);
  const tryTrending = Math.random() < 0.3;

  let topic: string | null = null;
  if (tryTrending) {
    topic = await fetchTrendingTopic(niche);
  }
  if (!topic) {
    topic = await generateFreshTopic(niche);
  }

  await saveUsedTopic(topic);
  return { niche, topic };
}

/** Deep-topic heuristic: decides if today's topic warrants the occasional long-form video. */
export function isDeepTopic(topic: string): boolean {
  // simple heuristic: longer/complex topics (multi-clause) suit long-form better
  const clauses = topic.split(/[,:;-]/).length;
  return clauses >= 3 || topic.length > 140;
}
