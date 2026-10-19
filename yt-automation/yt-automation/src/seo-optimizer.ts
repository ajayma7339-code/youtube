import fetch from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CONFIG } from './config.js';

/**
 * Free trick: YouTube's public autosuggest endpoint returns what people actually
 * search for around a seed keyword — no API key needed, no quota cost.
 */
async function fetchAutosuggest(seed: string): Promise<string[]> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(
      seed
    )}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const text = await res.text();
    // response is JSONP-ish: window.google.ac.h(["seed",[["suggestion",0],...]])
    const match = text.match(/\[.*\]/s);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    const suggestions: string[] = (parsed[1] || []).map((s: any) => s[0]).filter(Boolean);
    return suggestions.slice(0, 10);
  } catch {
    return [];
  }
}

export interface SeoResult {
  primaryKeyword: string;
  relatedKeywords: string[];
  optimizedTags: string[];
  optimizedHashtags: string[];
}

/**
 * Takes the raw topic + Gemini-drafted title/tags and sharpens them using
 * real search-suggest data, then re-ranks with Gemini for relevance/search-intent fit.
 */
export async function optimizeSeo(
  topic: string,
  draftTitle: string,
  draftTags: string[]
): Promise<SeoResult> {
  const suggestions = await fetchAutosuggest(topic);

  const genAI = new GoogleGenerativeAI(CONFIG.gemini.apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.8-flash' });

  const prompt = `You are optimizing YouTube SEO for a Short.
Topic: ${topic}
Draft title: ${draftTitle}
Draft tags: ${draftTags.join(', ')}
Real YouTube search-suggest phrases people type for this topic: ${
    suggestions.join(', ') || 'none found'
  }

Return ONLY valid JSON, no markdown fences, in this exact shape:
{
  "primaryKeyword": "single best search phrase to target",
  "relatedKeywords": ["3 to 5 supporting phrases"],
  "optimizedTags": ["10 to 15 tags, mix of broad and specific, no # symbol"],
  "optimizedHashtags": ["3 to 5 hashtags with # symbol, include #shorts"]
}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(raw);
  if (!parsed.optimizedHashtags.includes('#shorts')) {
    parsed.optimizedHashtags.push('#shorts');
  }
  return parsed as SeoResult;
}
