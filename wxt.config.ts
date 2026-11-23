import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    // Kia, 2026-11-23: simple and says what it is. YouTube's branding rules keep "YouTube" out of the name.
    name: 'Bullet Comments',
    description: 'Comments that fly across YouTube videos at the second they were written.',
    // identity: Google sign-in for posting bullet comments as YouTube comments.
    permissions: ['storage', 'identity'],
  },
  // Kia loads the build into his own Chrome; branded Chrome ignores --load-extension.
  webExt: { disabled: true },
});
