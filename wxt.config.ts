import { defineConfig } from 'wxt';

/**
 * Public key of the Chrome Web Store item gacaaegfhljciojlicadennhmfkeklld (Package → View public key, 2026-11-23).
 * With it, the unpacked build Kia loads has the store's extension ID, so Google sign-in's redirect
 * (https://gacaaegfhljciojlicadennhmfkeklld.chromiumapp.org/) matches the OAuth client. It is public by design.
 * The store rejects packages that carry `key`, so `pnpm zip:store` (DANMU_STORE=1) leaves it out.
 */
const STORE_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnzn7V4WRDObNzlja2b0Bnp0q/4rfGI8pQLOZXrhICA+uTHfs2UVs52b/DTQPD/UpmL+fFantEbKWAaNQrBIlehKvY5a8fs0A5uo52Hn9sC8K3dz3EzliPERKqPX60kSMcoeFjPUThvIBSKj00AEL8beXx6VsibE/wmpQPAwrrmzIjMvJCh5iMvnjxeif4mk5EApGaMz+qCQTZVp0OTzlKWatN+ShZ0X/JCtTgEn941E/gGhoKFtQA++15Mh2Rr3HZv3uMIR41R3ovBoG/wXKjjWlL+57791RkNQoQu10Tpjg0r8NtJkttevOonlKjQ4eq0c9T4OB4T51nIIhcCLWyQIDAQAB';

export default defineConfig({
  manifest: {
    // Kia, 2026-11-23: simple and says what it is. YouTube's branding rules keep "YouTube" out of the name.
    name: 'Bullet Comments',
    description: 'Comments that fly across YouTube videos at the second they were written.',
    // identity: Google sign-in for posting bullet comments as YouTube comments.
    permissions: ['storage', 'identity'],
    ...(process.env.DANMU_STORE ? {} : { key: STORE_KEY }),
  },
  // Kia loads the build into his own Chrome; branded Chrome ignores --load-extension.
  webExt: { disabled: true },
});
