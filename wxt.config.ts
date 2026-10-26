import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Danmu for YouTube',
    description: 'Time-synced bullet comments on YouTube videos.',
    permissions: ['storage'],
  },
  // Kia loads the build into his own Chrome; branded Chrome ignores --load-extension.
  webExt: { disabled: true },
});
