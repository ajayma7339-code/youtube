import fs from 'fs/promises';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { Niche } from './config.js';

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function audioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, data) => {
      if (err) return reject(err);
      resolve(data.format.duration || 0);
    });
  });
}

/**
 * Builds a simple evenly-timed SRT from the script text, spread across the
 * actual narration audio duration. Good enough for burned-in captions;
 * swap in Whisper word-level timestamps later if tighter sync is wanted.
 */
export async function generateCaptions(script: string, audioPath: string, outDir: string): Promise<string> {
  const duration = await audioDuration(audioPath);
  const sentences = script.split(/(?<=[.!?])\s+/).filter(Boolean);
  const perLine = duration / sentences.length;

  let srt = '';
  sentences.forEach((line, i) => {
    const start = i * perLine;
    const end = (i + 1) * perLine;
    srt += `${i + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${line.trim()}\n\n`;
  });

  const outPath = path.join(outDir, 'captions.srt');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outPath, srt);
  return outPath;
}

// Local pool of royalty-free tracks (CC0 / YouTube Audio Library sourced,
// downloaded once and kept in assets/music/ so no network call is needed daily).
const MUSIC_POOL: Record<Niche, string[]> = {
  science: ['assets/music/ambient-1.mp3', 'assets/music/ambient-2.mp3'],
  history: ['assets/music/cinematic-1.mp3', 'assets/music/cinematic-2.mp3'],
  trivia: ['assets/music/upbeat-1.mp3', 'assets/music/upbeat-2.mp3'],
  motivational: ['assets/music/inspiring-1.mp3', 'assets/music/inspiring-2.mp3'],
  finance: ['assets/music/corporate-1.mp3', 'assets/music/corporate-2.mp3']
};

export function pickMusic(niche: Niche): string {
  const pool = MUSIC_POOL[niche];
  return pool[Math.floor(Math.random() * pool.length)];
}
