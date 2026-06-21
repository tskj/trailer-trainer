import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built site works under
  // https://<user>.github.io/trailer-trainer/ without hardcoding the repo name.
  base: './',
});
