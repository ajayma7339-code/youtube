import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import path from 'path';
import { SceneAsset } from './config.js';

function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, data) => {
      if (err) return reject(err);
      resolve(data.format.duration || 0);
    });
  });
}

/**
 * Builds a single Ken-Burns (slow zoom/pan) clip per scene image, sized to
 * an even share of total audio duration, then concatenates + muxes narration
 * + background music, and burns in captions.
 */
export async function assembleVideo(opts: {
  scenes: SceneAsset[];
  audioPath: string;
  musicPath: string; // royalty-free track from local pool, picked by caller
  captionsSrtPath: string;
  outputPath: string;
  isLongForm: boolean;
}): Promise<string> {
  const { scenes, audioPath, musicPath, captionsSrtPath, outputPath, isLongForm } = opts;
  const totalDuration = await getAudioDuration(audioPath);
  const perScene = totalDuration / scenes.length;
  const [w, h] = isLongForm ? [1920, 1080] : [1080, 1920];

  const tempDir = path.dirname(outputPath) + '/scenes-render';
  await fs.mkdir(tempDir, { recursive: true });

  const clipPaths: string[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const clipPath = path.join(tempDir, `clip-${i}.mp4`);
    await renderKenBurnsClip(scenes[i].imagePath, perScene, w, h, clipPath);
    clipPaths.push(clipPath);
  }

  const concatListPath = path.join(tempDir, 'concat.txt');
  await fs.writeFile(concatListPath, clipPaths.map((p) => `file '${path.resolve(p)}'`).join('\n'));

  const silentConcatPath = path.join(tempDir, 'concat-silent.mp4');
  await runFfmpeg((f) =>
    f.input(concatListPath).inputOptions(['-f concat', '-safe 0']).outputOptions(['-c copy']).output(silentConcatPath)
  );

  // mux narration + background music (music ducked under narration) + burn captions
  await runFfmpeg((f) =>
    f
      .input(silentConcatPath)
      .input(audioPath)
      .input(musicPath)
      .complexFilter([
        '[2:a]volume=0.15[music]',
        '[1:a][music]amix=inputs=2:duration=first[aout]'
      ])
      .outputOptions([
        '-map 0:v',
        '-map [aout]',
        `-vf subtitles=${captionsSrtPath.replace(/:/g, '\\:')}`,
        '-shortest',
        '-c:v libx264',
        '-c:a aac'
      ])
      .output(outputPath)
  );

  return outputPath;
}

function renderKenBurnsClip(
  imagePath: string,
  duration: number,
  w: number,
  h: number,
  outPath: string
): Promise<void> {
  const frames = Math.round(duration * 25);
  return runFfmpeg((f) =>
    f
      .input(imagePath)
      .loop(duration)
      .outputOptions([
        `-vf scale=${w * 1.15}:${h * 1.15},zoompan=z='min(zoom+0.0015,1.15)':d=${frames}:s=${w}x${h}:fps=25`,
        '-t ' + duration,
        '-c:v libx264',
        '-pix_fmt yuv420p'
      ])
      .output(outPath)
  );
}

function runFfmpeg(build: (f: ffmpeg.FfmpegCommand) => ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = build(ffmpeg());
    cmd.on('end', () => resolve()).on('error', (err) => reject(err)).run();
  });
}
