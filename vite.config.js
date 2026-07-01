import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built site works under
  // https://<user>.github.io/trailer-trainer/ without hardcoding the repo name.
  base: './',
  server: {
    // dev: the leaderboard server runs separately on :3210
    proxy: { '/api': 'http://localhost:3210' },
  },
});
