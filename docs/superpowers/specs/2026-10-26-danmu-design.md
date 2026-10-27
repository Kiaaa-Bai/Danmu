# Danmu for YouTube — Design

Date: 2026-10-26 · Owner: Kia Bai · Course: Web Tools for Creative Work (Aidan Nelson), midterm
Deadline: presented 2026-10-27 09:30, round-robin, classmates try it on Kia's laptop.

## Intent

Kia learns from YouTube coding tutorials. On Bilibili the same kind of video is full of danmaku
(bullet comments that fly across the video at a specific second): people keep each other company,
and, more importantly, they point out mistakes and add missing information right where it matters
("p5.js 2.0 removed preload()"). YouTube has none of this. Measured on 2026-10-12: a Bilibili JS
course has 29.1 danmaku per 1,000 views; freeCodeCamp's JS course on YouTube has 0.42 comments
per 1,000 views.

The tool is a Chrome extension that adds time-synced danmaku to YouTube videos.

- **Feature 1 — send danmaku.** Type a line; it is pinned to the current second of the video and
  flies across the player for everyone who watches that second later.
- **Feature 2 — seed from comments.** A danmaku platform starts empty (Aidan's feedback: "it needs a
  user base before it is useful"). YouTube comments that contain timestamps ("5:58 data types") are
  turned into danmaku at those seconds and saved, so a video has danmaku from the first viewer on.

Who: Kia himself (deck slide 1, "Me and Everyone Learn from YouTube").

## Goals

1. Works on any `youtube.com/watch` video, in the default, theater and fullscreen views.
2. Danmaku stay in sync with playback: pause stops them, seek clears and restarts from the new
   position, playback speed changes their speed.
3. Shared: danmaku sent on one machine reach every other machine (live, if both are open).
4. Seeding runs once per video; later viewers read the stored danmaku.
5. Stable enough for a live, hands-on demo tomorrow.

## Danmaku settings (added 2026-10-26 evening, Kia's request)

Kia: 「加和b站一样的弹幕字号，飞行速度，弹幕密度，弹幕位置和弹幕颜色调节功能」. His picks: colour chosen
when sending and stored with the danmu; position = both Bilibili's display area and top/bottom fixed
danmaku; the panel opens from a button on the input bar.

- Viewer settings (gear button, `chrome.storage.local`, apply live): opacity 10–100 %, area
  1/4 · 1/2 · 3/4 · Full, speed 5 steps (12/10/8/6/4 s across), font size 50–200 %, density
  Fewer (≤ 15 on screen) · Normal (≤ 40) · More (no limit, overlap instead of dropping).
- Send style ("A" button, stored on each danmu): mode Scroll · Top · Bottom, colour from Bilibili's
  12-colour palette. Fixed danmaku stay 4 s, centred; bottom ones sit above the captions.
- Firestore: `danmu` gains optional `color` (`#RRGGBB`) and `mode` (`scroll|top|bottom`); rules
  updated and deployed. Old docs without them render white and scrolling.
- Labels are English for the class audience. The on/off toggle is a chat-bubble icon, slashed when off — Kia: 「这个不能用中文字，因为是面向海外的」 (*no Chinese characters here; it's for an overseas audience*).

## Change: comment danmaku are fetched live, not stored (2026-10-26 ~21:00, Kia)

YouTube's API policy limits how long API data may be stored, so Kia decided: 「改成每次播放时现拉评论、不存。
只存用户通过我们扩展发送的弹幕」 (*fetch comments live on each play and don't store them; store only danmaku
users send through the extension*). This replaces the seeding design above:

- Each viewer's content script fetches the duration + up to 500 comments when a video opens
  (6 quota units), runs the same `buildSeeds` rules, and adds the result to the in-memory timeline
  as `source: "comment"`. Kept in a per-tab memory cache; never written anywhere.
- Firestore rules now accept only `source == 'user'`; `videos/{id}` claims are read-only and unused.
- Not published to the Chrome Web Store for now (Kia, same message).

## Non-goals

Login/accounts · likes, reports, moderation · Chrome Web
Store release · mobile · YouTube Shorts and live streams · replies to comments as danmaku.

## Anti-goals (a failure even if it "works")

- Breaks YouTube: keyboard shortcuts fire while typing, controls become unclickable, playback stutters.
- Danmaku bury the code on screen so the tutorial can't be read.
- A dedicated "fix/tip" danmaku type or coloured tags on seeded danmaku. Kia removed both from the
  deck on 2026-10-12; seeded danmaku look exactly like user danmaku.
- The demo dies on a network hiccup with no fallback (hence the backup recording).

## Decided by Kia

- Both features, for tomorrow.
- Storage: Firebase (Firestore). Comments: YouTube Data API v3.
- Own repo: `~/Documents/Danmu`.
- Vibe coding is allowed: use the industry-mainstream approach and whatever fits the project best,
  not only class-taught constructs. AI use must still be documented for Aidan (chat logs).
- Kia switches the Firebase CLI account; the AI creates the Firebase project with the CLI
  (free Spark plan). Kia creates the YouTube API key himself.
- Deliverables: a working extension, plus a 30–60 s backup screen recording.

## Technical calls (made by the AI, Kia approved the summary)

- **WXT** (Vite-based extension framework) + **TypeScript**, Manifest V3, pnpm.
- **No UI framework.** Vanilla DOM: the danmaku layer animates every frame, and the input bar is
  a single row. YouTube enforces Trusted Types, so never use `innerHTML`; build nodes with
  `createElement` / `textContent`.
- **Everything runs in one content script** on `*://www.youtube.com/*` (Firestore SDK and the
  YouTube API `fetch`). Firestore's full SDK needs XHR, which MV3 service workers lack; content
  scripts have it. No background script.
- **Firebase JS SDK v13, modular `firebase/firestore`.** Bundled (MV3 forbids remote code).
- **Firebase web config is committed** (public by design; protection comes from security rules).
  **YouTube API key lives in `.env.local`** (gitignored) as `WXT_YOUTUBE_API_KEY`. It is still
  bundled into the built extension; acceptable for a class demo. Kia restricts the key to
  YouTube Data API v3.
- **Toggle state** (danmaku on/off) in `chrome.storage.local` via WXT storage.

## How it works

### Page lifecycle

YouTube is a single-page app. Listen to `yt-navigate-finish` (plus an initial run). On each
navigation read `v` from the URL. If it is a watch page with a new video id: tear down the old
session (unsubscribe, clear overlay, reset state) and start a new one. Wait for `#movie_player`
and its `<video>` before mounting.

### Data model (Firestore)

`danmu/{id}`
```
videoId: string      // YouTube id
t: number            // seconds, one decimal, 0 ≤ t < 86400
text: string         // 1–100 chars
source: "user" | "comment"
createdAt: timestamp // serverTimestamp()
```
Seeded docs use deterministic ids `c_<commentId>_<n>` so seeding is idempotent.

`videos/{videoId}`: `{ seededAt: timestamp, seedCount: number }`, written once as a claim.

Security rules: `read` allowed. `danmu` create only, with exactly these keys, types and bounds;
no update/delete. `videos` create only (the claim); no update/delete.

Query: `where("videoId", "==", id)` with `onSnapshot` (single-field index, automatic). Sort by
`t` on the client.

### Feature 2 — seeding

On session start, `getDoc(videos/{id})`. If it exists, do nothing. Otherwise:
1. Fetch the video length from `videos?part=contentDetails&id=…` (ISO 8601 duration, 1 quota unit).
   **Never use `<video>.duration`**: a pre-roll ad plays in the same element, so its length would
   reject every timestamp and permanently claim the video with zero danmaku.
2. Fetch `commentThreads?part=snippet&videoId=…&order=relevance&maxResults=100&textFormat=plainText`
   up to 5 pages (5 quota units; daily quota is 10,000). `commentsDisabled` → zero comments.
   Any other API error → stop without claiming, so the next viewer retries.
3. Parse each top-level comment's `textOriginal`, falling back to `textDisplay` (already plain
   text with `textFormat=plainText`):
   - timestamps `h:mm:ss` or `m:ss` (minutes may exceed 59 for `m:ss`), not part of a longer
     number/word, and `t ≤ duration from step 1`.
   - Exactly one timestamp in the comment → one danmaku with the whole comment (whitespace
     collapsed) at that time.
   - Several timestamps (chapter lists) → one danmaku per line that has a timestamp: the line with
     its timestamp(s) and surrounding punctuation removed; skip if nothing is left.
   - Truncate to 60 chars with `…`. Cap 300 danmaku per video.
4. Claim: `setDoc(videos/{id})` — rules allow create only, so a second viewer seeding at the same
   time fails here and stops.
5. Write danmaku in batches of ≤ 500. They arrive through the live listener like any other danmaku.

No API key, or an API error → log once, skip seeding, Feature 1 still works.
Rules forbid deletes from the client, so a dev script (`scripts/reset-video.sh <videoId>`, Firebase
CLI) deletes a video's claim and its danmaku for re-seeding.

### Rendering

- Overlay `div` absolutely positioned over the video inside `#movie_player` (so it shows in
  fullscreen), `pointer-events: none`, below YouTube's control bar.
- Hidden while an ad plays (`#movie_player.ad-showing`) and when toggled off. The emission loop
  also pauses during ads and resyncs its cursor when the ad ends (the ad's `currentTime` is not
  the video's).
- **Area: top half of the player** (anti-goal: don't bury the code). Lanes = floor(area / lane
  height); font size scales with player height (about 22 px at 720 p, never below 16 px).
- Each danmaku crosses the full width in a fixed 8 s at 1× (longer text moves a little faster,
  as on Bilibili). Animated with the Web Animations API (`element.animate`, `translateX`), so pause,
  resume and `playbackRate` map directly onto the animations.
- **Lane choice:** the first lane whose last danmaku has fully entered (plus a gap) and will not be
  caught by the new one before it leaves. No lane free → drop it.
- **Emission loop** (`requestAnimationFrame`): keep a cursor into the sorted list; emit every item
  with `prevTime < t ≤ currentTime`. A jump > 1.5 s or backwards is a seek: clear the screen and
  move the cursor (binary search). Also clear on `seeking`.
- Style: white, semi-bold, dark outline/shadow, 90 % opacity; YouTube's font stack with Noto Sans
  SC / PingFang fallback for Chinese. Your own danmaku get a thin border (Bilibili convention).
- Resize (`ResizeObserver`, fullscreen, theater): recompute lanes; flying danmaku finish as they are.

### Live danmaku

New docs from the listener (after the initial load) are inserted into the sorted list. If a new
doc's `t` is within 3 s of the current time it is shown at once, so two people watching the same
moment see each other immediately. Own danmaku are shown at once on send (doc id generated
client-side, so the listener echo is skipped).

### Input bar

Injected just below the player (top of `#below`). One row:
toggle (弹 on/off) · input `Send a danmu at 3:21…` (shows the live time) · Send · count
(`128 danmu · 40 from comments`).
- Enter sends; empty or > 100 chars blocked; one send per 2 s.
- `keydown` / `keypress` / `keyup` stop propagation in the input, so YouTube shortcuts don't fire.
- Uses YouTube's own CSS variables (`--yt-spec-*`) so it follows light and dark mode.
- Classes are prefixed `dm-`; CSS injected through the content script's manifest CSS.

## Build order (cut line if the night runs short)

1. Spike: Firestore `onSnapshot` + a `fetch` to googleapis from the content script on youtube.com
   (the riskiest assumption) — first, before anything else.
2. Feature 1: overlay, emission loop, input bar, send.
3. Live sync between two windows.
4. Feature 2: seeding.
5. Polish (dark mode, theater/fullscreen, count label).

## Setup facts

- Firebase project `kia-danmu` (Spark, account kiaaabai@gmail.com), web app "Danmu Extension",
  rules deployed 2026-10-26. `firebase` npm package resolves to 13.1.0.
- YouTube API key: created by Kia in the `kia-danmu` Google Cloud project. **API restriction:
  YouTube Data API v3 only. Application restriction: None** — content-script requests carry the
  `https://www.youtube.com` origin, so a referrer restriction would silently break seeding.

## Testing

- Unit (Vitest): timestamp parser + comment-to-danmaku rules, lane allocator, cursor/seek logic.
- Live: Kia loads the unpacked build in his Chrome once (branded Chrome ignores `--load-extension`,
  so no automated harness); WXT dev mode then reloads it on every change. The AI drives the checks
  in that Chrome through Claude in Chrome. Check on the freeCodeCamp JS course
  (`PkZNo7MFNFg`) and one p5.js tutorial: seed, send, pause, seek, speed, fullscreen, theater,
  dark mode, typing `k`/`f`/space in the input, second window receives live.

## Demo prep

- Pre-seed the demo videos before class.
- README: what it is, install (load unpacked from `.output/chrome-mv3`), AI-use note.
- Backup recording, 30–60 s.

## Left to the builder

Exact visual values, lane gap, file layout, how to wait for YouTube's DOM, test tooling details.
