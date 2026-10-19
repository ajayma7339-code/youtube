import { GoogleGenerativeAI } from '@google/generative-ai';
import { CONFIG, Niche, ScriptResult } from './config.js';
import { optimizeSeo } from './seo-optimizer.js';

export async function generateScriptAndMetadata(
  niche: Niche,
  topic: string,
  isLongForm: boolean
): Promise<ScriptResult> {
  const genAI = new GoogleGenerativeAI(CONFIG.gemini.apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.8-flash' });

  const wordTarget = isLongForm ? '600-800 words, 3-5 minutes spoken' : '120-150 words, 30-60 seconds spoken';

  const prompt = `Write a YouTube ${isLongForm ? 'video' : 'Short'} about this ${niche} topic: "${topic}"

Requirements:
- Script length: ${wordTarget}
- First line MUST be a strong hook that stops scrolling in the first 2 seconds
- Simple spoken language, no stage directions, no emojis in the script itself
- End with a soft call-to-action (follow/subscribe) in one short sentence

Also write YouTube metadata optimized for discovery.

Return ONLY valid JSON, no markdown fences, in this exact shape:
{
  "script": "full narration text",
  "title": "under 100 characters, curiosity-driven, includes main keyword",
  "description": "2-3 sentences plus a line of hashtags at the end",
  "tags": ["8 to 12 draft tags"],
  "hashtags": ["3 to 5 hashtags with # symbol"],
  "hook_line": "the exact first line of the script, repeated here for reference"
}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().replace(/```json|```/g, '').trim();
  const draft = JSON.parse(raw);

  const seo = await optimizeSeo(topic, draft.title, draft.tags);

  return {
    script: draft.script,
    title: draft.title,
    description: `${draft.description}\n\n${seo.optimizedHashtags.join(' ')}`,
    tags: seo.optimizedTags,
    hashtags: seo.optimizedHashtags,
    hook_line: draft.hook_line,
    niche,
    topic,
    is_long_form: isLongForm
  };
}
