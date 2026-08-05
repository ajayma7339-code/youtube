import fs from 'fs/promises';
import fetch from 'node-fetch';
import { CONFIG } from './config.js';

// Tracks ElevenLabs monthly free-quota usage locally so we stop calling it
// once we're near the free-tier cap (10k chars/month) and fall through cleanly.
async function elevenLabsQuotaOk(charsNeeded: number): Promise<boolean> {
  try {
    const usagePath = 'data/elevenlabs-usage.json';
    const raw = await fs.readFile(usagePath, 'utf-8').catch(() => '{"month":"","chars":0}');
    const usage = JSON.parse(raw);
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (usage.month !== currentMonth) {
      usage.month = currentMonth;
      usage.chars = 0;
    }
    if (usage.chars + charsNeeded > 9500) return false; // buffer under 10k cap
    usage.chars += charsNeeded;
    await fs.mkdir('data', { recursive: true });
    await fs.writeFile(usagePath, JSON.stringify(usage, null, 2));
    return true;
  } catch {
    return false;
  }
}

async function tryEdgeTts(text: string, destPath: string): Promise<boolean> {
  try {
    const { EdgeTTS } = await import('edge-tts-node');
    const tts = new EdgeTTS();
    await tts.ttsPromise(text, destPath, { voice: 'en-US-GuyNeural', rate: '+0%' });
    return true;
  } catch {
    return false;
  }
}

async function tryElevenLabs(text: string, destPath: string): Promise<boolean> {
  if (!CONFIG.elevenlabs.apiKey) return false;
  if (!(await elevenLabsQuotaOk(text.length))) return false;
  try {
    const voiceId = '21m00Tcm4TlvDq8ikWAM'; // "Rachel" default free voice
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': CONFIG.elevenlabs.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' })
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(destPath, buf);
    return true;
  } catch {
    return false;
  }
}

async function tryGoogleTts(text: string, destPath: string): Promise<boolean> {
  // Requires a Google Cloud API key with Text-to-Speech enabled (free tier: 4M chars/month WaveNet).
  const key = process.env.GOOGLE_TTS_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'en-US', ssmlGender: 'MALE' },
        audioConfig: { audioEncoding: 'MP3' }
      })
    });
    if (!res.ok) return false;
    const json: any = await res.json();
    if (!json.audioContent) return false;
    await fs.writeFile(destPath, Buffer.from(json.audioContent, 'base64'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Fallback chain per spec: Edge-TTS (unlimited, default) -> ElevenLabs free quota
 * -> Google TTS free quota. Throws only if all three fail.
 */
export async function synthesizeVoice(text: string, destPath: string): Promise<void> {
  if (await tryEdgeTts(text, destPath)) return;
  if (await tryElevenLabs(text, destPath)) return;
  if (await tryGoogleTts(text, destPath)) return;
  throw new Error('all TTS providers failed');
}
