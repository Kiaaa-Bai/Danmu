# Danmu for YouTube

A Chrome extension that brings danmaku (弹幕, bullet comments) to YouTube: comments that fly across the
video at the exact second they were written. Made for learning from coding tutorials, where Bilibili's
danmaku keep you company and point out mistakes right where they happen ("p5.js 2.0 removed
`preload()`"). Midterm for Web Tools for Creative Work (NYU ITP, Fall 2026).

## What it does

1. **Send a danmu at this moment.** Type under the player and press Enter. It is pinned to the current
   second and flies across for everyone who watches that second, live for anyone watching right now.
2. **Comments become danmaku.** An empty danmaku platform is useless, so YouTube comments that
   contain timestamps ("5:58 data types and variables") fly at those seconds too. They are fetched
   live for each viewer and never stored (YouTube's API policy); only danmaku sent through the
   extension are saved. Chapter lists are split into one danmu per line.

Bilibili-style controls: on/off (chat-bubble button), sender colour and Scroll / Top / Bottom ("A"), and viewer settings
(⚙) for opacity, display area, speed, font size and density. Danmaku pause, seek, change speed and go
fullscreen with the video, and hide during ads.

## Install (unpacked)

```bash
pnpm install
echo "WXT_YOUTUBE_API_KEY=<your YouTube Data API v3 key>" > .env.local
pnpm build
```

Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → choose `.output/chrome-mv3`
(press `Cmd+Shift+G` and paste the path; `.output` is hidden). Open any `youtube.com/watch` page.

Without a key everything works except danmaku from comments.

## How it works

- WXT + TypeScript, Manifest V3, one content script on youtube.com, no UI framework.
- Firestore (project `kia-danmu`) stores sent danmaku `{ videoId, t, text, source, color, mode, createdAt }`;
  security rules only allow well-formed creates of user danmaku, no edits or deletes.
- A `requestAnimationFrame` loop reads `video.currentTime` and hands out danmaku whose time has just
  passed; seeks, resizes and the end of an ad re-lay the ones that should be mid-flight.
- Each danmu is a `<span>` animated with the Web Animations API, so pause and playback speed map
  straight onto the animation. Lanes are chosen so a longer (faster) danmu never catches the one ahead.

Logic is unit-tested (`pnpm test`): timestamp parsing, seeding rules, timeline, lanes.

## References

- [weizhenye/Danmaku](https://github.com/weizhenye/Danmaku) — fixed-duration speed model, re-emitting mid-flight after a seek
- [CommentCoreLibrary](https://github.com/jabbany/CommentCoreLibrary) — comment space allocation
- [Danmaku Anywhere](https://github.com/Mr-Quin/danmaku-anywhere) — seek and visibility handling on video sites
- [DanMage](https://github.com/teststaybaka/danmage) — mounting on YouTube's player, ad detection
- Dmooji (Chrome Web Store) — closest existing product: user-posted, time-synced danmaku on YouTube

## AI use

Built with Claude Code (Anthropic) under the course's AI policy: design, plan, code and tests were
written in conversation with the AI, and the chat log is kept as the record of how it was made.
