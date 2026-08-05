import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { CONFIG, SceneAsset } from './config.js';

async function downloadTo(url: string, filePath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(filePath, buf);
}

async function tryPexels(query: string, destPath: string): Promise<boolean> {
  if (!CONFIG.pexels.apiKey) return false;
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=portrait`,
      { headers: { Authorization: CONFIG.pexels.apiKey } }
    );
    if (!res.ok) return false;
    const json: any = await res.json();
    const photo = json?.photos?.[0];
    if (!photo) return false;
    await downloadTo(photo.src.portrait || photo.src.large, destPath);
    return true;
  } catch {
    return false;
  }
}

async function tryPixabay(query: string, destPath: string): Promise<boolean> {
  if (!CONFIG.pixabay.apiKey) return false;
  try {
    const res = await fetch(
      `https://pixabay.com/api/?key=${CONFIG.pixabay.apiKey}&q=${encodeURIComponent(
        query
      )}&image_type=photo&orientation=vertical&per_page=5`
    );
    if (!res.ok) return false;
    const json: any = await res.json();
    const hit = json?.hits?.[0];
    if (!hit) return false;
    await downloadTo(hit.largeImageURL, destPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Free AI image fallback via Pollinations (no key required, free public endpoint).
 * Used only when both stock sources miss — keeps everything zero-cost.
 */
async function tryAiImage(query: string, destPath: string): Promise<boolean> {
  try {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      query + ', cinematic, vertical composition, high detail'
    )}?width=1080&height=1920&nologo=true`;
    await downloadTo(url, destPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * For each scene line, tries Pexels -> Pixabay -> AI image, first success wins.
 * This is the "mix, topic-based" behavior: stock is tried first (real footage feel),
 * AI fills gaps stock can't cover (abstract/conceptual topics).
 */
export async function sourceVisualsForScript(script: string, workDir: string): Promise<SceneAsset[]> {
  await fs.mkdir(workDir, { recursive: true });
  const scenes = splitIntoScenes(script);
  const assets: SceneAsset[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const sceneText = scenes[i];
    const destPath = path.join(workDir, `scene-${i}.jpg`);
    const ok =
      (await tryPexels(sceneText, destPath)) ||
      (await tryPixabay(sceneText, destPath)) ||
      (await tryAiImage(sceneText, destPath));
    if (!ok) throw new Error(`no visual source succeeded for scene ${i}`);
    assets.push({ sceneText, imagePath: destPath });
  }
  return assets;
}

function splitIntoScenes(script: string): string[] {
  // naive split: by sentence, group every ~2 sentences into one visual scene
  const sentences = script.split(/(?<=[.!?])\s+/).filter(Boolean);
  const scenes: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    scenes.push(sentences.slice(i, i + 2).join(' '));
  }
  return scenes.length ? scenes : [script];
}
