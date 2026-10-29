# Reels E2E fixtures

Before running the `upload-flow.spec.ts` suite, place these files in this directory:

- `portrait-30s.mp4` — 9:16 portrait MP4, 30 seconds, < 50 MB
- `landscape-10s.mp4` — 16:9 landscape MP4, 10 seconds (used to verify rejection)

These files are intentionally NOT committed to the repo — they'd bloat the git history. CI runners should pull them from a fixture bucket.
