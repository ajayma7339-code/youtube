import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { pickTopic, isDeepTopic } from './topic-picker.js';
import { generateScriptAndMetadata } from './script-gen.js';
import { sourceVisualsForScript } from './visuals.js';
import { synthesizeVoice } from './tts.js';
import { generateCaptions, pickMusic } from './captions-music.js';
import { assembleVideo } from './assemble.js';
import { uploadVideo } from './upload.js';
import { trackNewUpload, refreshStats } from './analytics.js';
import { CONFIG } from './config.js';

async function runOne(slotIndex: number) {
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-slot${slotIndex}`;
  const workDir = path.join('temp', runId);
  const log: Record<string, unknown> = { runId, startedAt: new Date().toISOString() };

  try {
    // 1. Topic
    const { niche, topic } = await pickTopic(slotIndex);
    const longForm = isDeepTopic(topic);
    log.niche = niche; log.topic = topic; log.longForm = longForm;

    // 2. Script + metadata (title/desc/tags/hashtags/hook, SEO-optimized)
    const meta = await generateScriptAndMetadata(niche, topic, longForm);
    log.title = meta.title;

    // 3. Visuals (stock + AI mix, per scene)
    const scenes = await sourceVisualsForScript(meta.script, path.join(workDir, 'assets'));

    // 4. Voice (Edge-TTS -> ElevenLabs -> Google TTS fallback chain, inside tts.ts)
    const audioPath = path.join(workDir, 'narration.mp3');
    await synthesizeVoice(meta.script, audioPath);

    // 5. Captions + music
    const captionsSrtPath = await generateCaptions(meta.script, audioPath, workDir);
    const musicPath = pickMusic(niche);

    // 6. Assemble final video
    const outputPath = path.join(workDir, 'final.mp4');
    await assembleVideo({ scenes, audioPath, musicPath, captionsSrtPath, outputPath, isLongForm: longForm });

    // 7. Upload
    const videoId = await uploadVideo(outputPath, meta);
    log.videoId = videoId;
    log.status = 'success';

    // 8. Track for analytics feedback loop
    trackNewUpload(videoId, meta.title, niche);

    console.log(`✅ Uploaded: https://youtube.com/watch?v=${videoId} (${niche}, ${longForm ? 'long-form' : 'short'})`);
  } catch (err: any) {
    log.status = 'failed';
    log.error = err?.message || String(err);
    console.error(`❌ Slot ${slotIndex} failed:`, err);
  } finally {
    log.endedAt = new Date().toISOString();
    await fs.mkdir(CONFIG.paths.logs, { recursive: true });
    await fs.writeFile(path.join(CONFIG.paths.logs, `${runId}.json`), JSON.stringify(log, null, 2));
    // cleanup temp assets to save disk/CI space, keep only logs
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  // 2 shorts per day: this script is invoked twice by the cron schedule (see workflow yml),
  // each invocation is one "slot". slotIndex alternates niche selection deterministically.
  const slotIndex = Number(process.env.SLOT_INDEX || 0);
  await runOne(slotIndex);

  // Refresh analytics after every run so the log stays current for next topic-pick decisions
  try {
    await refreshStats();
  } catch (e) {
    console.warn('analytics refresh skipped:', (e as Error).message);
  }
}

main();
