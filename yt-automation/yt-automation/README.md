# YT Automation — Faceless Shorts Pipeline

Daily automated: topic pick → script+SEO metadata (Gemini) → visuals (Pexels/Pixabay/AI) →
voice (Edge-TTS/ElevenLabs/Google TTS) → FFmpeg assembly → YouTube upload → analytics tracking.

## Local Setup

```bash
npm install
cp .env.example .env   # fill in your API keys
npm run get-token      # one-time: opens browser, generates YT_REFRESH_TOKEN
```

Add music files (royalty-free, e.g. from YouTube Audio Library) into `assets/music/`
matching the filenames listed in `src/captions-music.ts` (`MUSIC_POOL`).

## Test one run locally before automating

```bash
npm run test-pipeline
```

Check `temp/<run-id>/final.mp4` and `logs/<run-id>.json` before trusting it to upload live.
First few runs: watch the actual YouTube upload manually too.

## Check performance

```bash
npm run analyze
```

## Go live (daily automation)

1. Push this repo to GitHub
2. Repo Settings → Secrets and variables → Actions → add all keys from `.env.example`
3. Actions tab → confirm `Daily YouTube Upload` workflow appears
4. Trigger once manually ("Run workflow") to confirm it works end-to-end in CI
5. From then on it runs itself twice daily (see cron schedule in `.github/workflows/daily-upload.yml`)

## Notes

- 2 shorts/day scheduled; pipeline auto-detects "deep" topics and can produce long-form (see `isDeepTopic` in `topic-picker.ts`) — you may want to route long-form to a separate, less frequent schedule once you see how often it triggers.
- Zero paid APIs required. All fallbacks (TTS providers, visual sources) are ordered free-tier-first.
- Read `logs/` regularly for the first couple of weeks — automation doesn't mean unattended forever.
