# Danmu for YouTube Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome extension that shows and sends time-synced danmaku on YouTube videos, seeded from timestamped comments, stored in Firestore.

**Architecture:** One WXT content script on youtube.com. Pure logic (timestamp parsing, timeline cursor, lane choice) lives in small tested modules under `lib/`; DOM pieces (overlay, input bar) and I/O (Firestore, YouTube API) wrap them; `session.ts` wires one video's session and `entrypoints/content.ts` handles YouTube's SPA navigation.

**Tech Stack:** WXT 0.21, TypeScript, Firebase JS SDK 13 (`firebase/firestore`), Vitest 5, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-26-danmu-design.md`

## Global Constraints

- Manifest V3; content script matches `*://www.youtube.com/*`; permissions `["storage"]` only.
- Never assign `innerHTML` (YouTube enforces Trusted Types). Text goes in with `textContent`.
- All CSS classes prefixed `dm-`.
- Firestore doc shape is exactly `{ videoId, t, text, source, createdAt }` (`createdAt = serverTimestamp()`); `videos/{id}` is exactly `{ seededAt, seedCount }`. Rules in `firestore.rules` are deployed and reject anything else.
- User text 1–100 chars; seeded text ≤ 60 chars with `…`; ≤ 300 seeded danmaku per video.
- Danmaku cross the player in 8 s of media time at 1×; lanes only in the top half of the player.
- API key from `import.meta.env.WXT_YOUTUBE_API_KEY`; missing key → seeding skipped, nothing else breaks.
- Seeded danmaku look identical to user danmaku. No "fix" type, no tags.
- Video length for seeding comes from the YouTube API, never from `<video>.duration`.

## Review Focus

1. **Moving to another video without a reload** (YouTube is a SPA): no danmaku from the old video, old listener gone, bar shows the new count. Covered by the Task 5 live check "navigate A → B".
2. **Typing in the input**: `k`, `f`, `j`, `l`, `m`, space, `/`, arrow keys must type, not control YouTube. Task 5 live check.
3. **Ads**: during a pre-roll or mid-roll no danmaku fly, nothing clears falsely, and when the ad ends danmaku resume at the video's time. Task 3 test `tick ignores the jump back after an ad` + Task 5 live check.
4. **Seeking far forward / dragging the scrubber / 2× speed**: no burst of hundreds of danmaku. Task 3 tests `a forward jump over 1.5 s is a seek` and Task 5 live check at 2×.
5. **Odd text**: Chinese, emoji, `<b>html</b>`, a 100-char line: shown literally, never parsed as HTML, never overflowing the player. Task 4 live check.

---

### Task 1: Scaffold + spike (Firestore and YouTube API from the content script)

**Files:**
- Create: `package.json`, `tsconfig.json`, `wxt.config.ts`, `vitest.config.ts`, `lib/firebase.ts`, `entrypoints/content.ts` (spike version)

**Interfaces:**
- Produces: `db: Firestore` exported from `lib/firebase.ts`.

- [ ] **Step 1:** `pnpm add -D wxt typescript vitest` and `pnpm add firebase`. Scripts: `dev: wxt`, `build: wxt build`, `test: vitest run`, `postinstall: wxt prepare`. `tsconfig.json` extends `./.wxt/tsconfig.json`.
- [ ] **Step 2:** `wxt.config.ts`: `manifest: { name: "Danmu for YouTube", description: "Time-synced bullet comments on YouTube videos.", permissions: ["storage"] }`, `webExt: { disabled: true }` (Kia loads the build into his own Chrome; branded Chrome ignores `--load-extension`).
- [ ] **Step 3:** `lib/firebase.ts`: `initializeApp` with the web config of app `1:955312431317:web:9deafab79c8a28106c025c` (`firebase apps:sdkconfig WEB …`), export `db = getFirestore(app)`.
- [ ] **Step 4:** Spike `entrypoints/content.ts`: on load, `onSnapshot(query(collection(db,"danmu"), where("videoId","==","PkZNo7MFNFg")))` logs `[danmu] firestore ok <n>`; `fetch` the `videos?part=contentDetails&id=PkZNo7MFNFg` endpoint and log `[danmu] api ok <duration>`.
- [ ] **Step 5:** `pnpm dev`. Kia loads `.output/chrome-mv3-dev` once via chrome://extensions → Developer mode → Load unpacked. Open the demo video.
  Expected console: `[danmu] firestore ok 0` and `[danmu] api ok PT3H26M43S`. If Firestore fails here, switch `lib/firebase.ts` to `initializeFirestore(app, { experimentalForceLongPolling: true })` and retry before going on.
- [ ] **Step 6:** Commit `chore: scaffold WXT extension and spike Firestore + YouTube API`.

### Task 2: Timestamp parsing (pure)

**Files:**
- Create: `lib/timestamps.ts`, `tests/timestamps.test.ts`

**Interfaces:**
- Produces: `parseTimestamps(text: string): number[]` (seconds, in order) · `parseIsoDuration(iso: string): number` · `commentToDanmu(text: string, durationSec: number): SeedDanmu[]` · `type SeedDanmu = { t: number; text: string }` · `MAX_SEED_TEXT = 60`.

- [ ] **Step 1: Write failing tests**

```ts
expect(parseTimestamps("data types and variables 5:58")).toEqual([358]);
expect(parseTimestamps("0:01:24 Running JavaScript")).toEqual([84]);
expect(parseTimestamps("near the 2:45:00 mark")).toEqual([9900]);
expect(parseTimestamps("at 75:30 we")).toEqual([4530]);
expect(parseTimestamps("ratio 16:9, 3:2, v1.2:30, 12:345")).toEqual([]);
expect(parseIsoDuration("PT3H26M43S")).toBe(12403);
expect(parseIsoDuration("PT45S")).toBe(45);
// one timestamp → whole comment, whitespace collapsed
expect(commentToDanmu("Until that arrow\nfunction near the 2:45:00 mark", 12403))
  .toEqual([{ t: 9900, text: "Until that arrow function near the 2:45:00 mark" }]);
// several → one per line, timestamp and edge punctuation stripped, empty lines skipped
expect(commentToDanmu("Contents\n0:00:00 Introduction\n0:01:24 - Running JavaScript\n2:00", 12403))
  .toEqual([{ t: 0, text: "Introduction" }, { t: 84, text: "Running JavaScript" }]);
expect(commentToDanmu("comment your code 4:22\ndata types 5:58", 12403))
  .toEqual([{ t: 262, text: "comment your code" }, { t: 358, text: "data types" }]);
// beyond the video's length → dropped
expect(commentToDanmu("at 5:00 it breaks", 200)).toEqual([]);
// truncation
expect(commentToDanmu("1:00 " + "x".repeat(80), 600)[0].text).toHaveLength(60);
expect(commentToDanmu("1:00 " + "x".repeat(80), 600)[0].text.endsWith("…")).toBe(true);
```

- [ ] **Step 2:** `pnpm test` → FAIL (module missing).
- [ ] **Step 3:** Implement. Timestamp regex: `(?<![\d:.])(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?![\d:])`, seconds group must be < 60, and when hours are present minutes must be < 60. Edge punctuation to strip: `-–—|:()[]•·` and spaces.
- [ ] **Step 4:** `pnpm test` → PASS.
- [ ] **Step 5:** Commit `feat: parse timestamped comments into seed danmaku`.

### Task 3: Timeline and lanes (pure)

**Files:**
- Create: `lib/timeline.ts`, `lib/lanes.ts`, `tests/timeline.test.ts`, `tests/lanes.test.ts`

**Interfaces:**
- Produces:
  - `class Timeline<T extends { id: string; t: number }>`: `add(items: T[]): T[]` (returns the ones not already present, keeps sort by `t`), `has(id: string): boolean`, `get size(): number`, `tick(now: number): T[]`, `reset(now: number): void`. `SEEK_JUMP = 1.5`.
  - `type LaneItem = { start: number; width: number; speed: number }` (media seconds, px, px per media second) · `pickLane(last: (LaneItem | undefined)[], now: number, playerWidth: number, width: number, duration: number, gap: number): number` (−1 if none).

- [ ] **Step 1: Write failing tests**

```ts
// timeline
const tl = new Timeline(); tl.add([{id:"a",t:1},{id:"b",t:2},{id:"c",t:3}]);
tl.reset(0);  expect(tl.tick(0.5)).toEqual([]);
expect(tl.tick(1.2).map(x=>x.id)).toEqual(["a"]);
expect(tl.tick(2.1).map(x=>x.id)).toEqual(["b"]);
// "a forward jump over 1.5 s is a seek": nothing emitted, cursor moves
expect(tl.tick(10)).toEqual([]);  expect(tl.tick(10.2)).toEqual([]);
// backwards is a seek too
expect(tl.tick(0.9)).toEqual([]); expect(tl.tick(1.1).map(x=>x.id)).toEqual(["a"]);
// after reset, an item exactly at `now` shows on the next tick
tl.reset(2); expect(tl.tick(2.05).map(x=>x.id)).toEqual(["b"]);
// add returns only new ids
expect(tl.add([{id:"a",t:1},{id:"d",t:4}]).map(x=>x.id)).toEqual(["d"]);
// "tick ignores the jump back after an ad": an ad ends at 0.3 s of ad time, video resumes at 60
tl.reset(60); expect(tl.tick(60.1)).toEqual([]);

// lanes: W=1000, duration 8
expect(pickLane([undefined, undefined], 0, 1000, 100, 8, 20)).toBe(0);
const justStarted = { start: 0, width: 100, speed: 1100 / 8 };
expect(pickLane([justStarted, undefined], 0.1, 1000, 100, 8, 20)).toBe(1);
expect(pickLane([justStarted, justStarted], 0.1, 1000, 100, 8, 20)).toBe(-1);
// entered fully, same width → lane reusable
expect(pickLane([justStarted], 2, 1000, 100, 8, 20)).toBe(0);
// a much longer (faster) item would catch it before it exits → not reusable
expect(pickLane([justStarted], 2, 1000, 900, 8, 20)).toBe(-1);
```

- [ ] **Step 2:** `pnpm test` → FAIL.
- [ ] **Step 3:** Implement. `tick(now)`: if `now < prev` or `now - prev > SEEK_JUMP` → `prev = now`, return `[]`; else return items with `prev < t ≤ now` (binary search both bounds), then `prev = now`. `reset(now)` sets `prev = now - 0.25`. `pickLane` uses the two conditions from the spec: the previous item has moved `width + gap` px in, and the new item's left edge does not reach 0 before `prev.start + duration`.
- [ ] **Step 4:** `pnpm test` → PASS.
- [ ] **Step 5:** Commit `feat: timeline cursor and lane allocation`.

### Task 4: Overlay (render)

**Files:**
- Create: `lib/overlay.ts`, `entrypoints/content/style.css` (move `content.ts` to `entrypoints/content/index.ts`)

**Interfaces:**
- Consumes: `pickLane`, `LaneItem` (Task 3).
- Produces: `class Overlay`: `constructor(player: HTMLElement)`, `show(text: string, now: number, rate: number, own?: boolean): boolean`, `pause()`, `resume()`, `setRate(rate: number)`, `clear()`, `setVisible(on: boolean)`, `destroy()`. `DURATION = 8`.

- [ ] **Step 1:** Overlay root `div.dm-layer` appended inside the player element, `position:absolute; inset:0 0 auto 0; height:50%; pointer-events:none; overflow:hidden; z-index` just above `.html5-video-container`. Font size `clamp(16px, playerHeight × 0.03, 30px)`, lane height `font × 1.4`; recompute on `ResizeObserver`.
- [ ] **Step 2:** `show`: create `span.dm-item` (`.dm-own` if own), `textContent = text`, measure width, `pickLane`; if −1 remove and return false. Animate `translateX(playerWidth px) → translateX(-width px)` with `duration = DURATION × 1000`, `easing: "linear"`, then set `animation.playbackRate = rate`; remove on `finished`.
- [ ] **Step 3:** Style: white, `font-weight:600`, `text-shadow` 1 px outline in black on four sides, `opacity:.9`, `white-space:nowrap`, font `"YouTube Sans", Roboto, "PingFang SC", "Noto Sans SC", sans-serif`; `.dm-own` adds `1px solid` border, `padding:0 4px`.
- [ ] **Step 4: Live check** (temporary hook in `index.ts`: on `#movie_player`, call `show` for `["hello", "你好 弹幕", "😀 emoji", "<b>html</b>", "x".repeat(100)]` once a second). Expected: five lines fly right-to-left in the top half, literal text, no overlap. Remove the hook.
- [ ] **Step 5:** Commit `feat: danmaku overlay with lanes`.

### Task 5: Store, input bar, session — Feature 1 end to end

**Files:**
- Create: `lib/store.ts`, `lib/bar.ts`, `lib/session.ts`, `lib/settings.ts`
- Modify: `entrypoints/content/index.ts`, `entrypoints/content/style.css`

**Interfaces:**
- Consumes: `db`, `Timeline`, `Overlay`.
- Produces:
  - `type Danmu = { id: string; videoId: string; t: number; text: string; source: "user" | "comment" }`
  - `subscribeDanmu(videoId: string, onAdded: (items: Danmu[], initial: boolean) => void): () => void`
  - `newDanmuId(): string` · `sendDanmu(d: Omit<Danmu,"source">): Promise<void>` (source `"user"`, `t` rounded to 0.1)
  - `class Bar`: `constructor(h: { onSend(text: string): Promise<void>; onToggle(on: boolean): void })`, `mount(): boolean`, `setTime(sec: number)`, `setCount(total: number, fromComments: number)`, `setEnabled(on: boolean)`, `destroy()`
  - `enabledSetting` = `storage.defineItem<boolean>("local:danmuEnabled", { fallback: true })`
  - `startSession(videoId: string): () => void` (returns teardown)

- [ ] **Step 1:** `store.ts` with the signatures above (`onSnapshot`, `docChanges()` filtered to `added`; `initial` is true for the first snapshot).
- [ ] **Step 2:** `bar.ts`: `div.dm-bar` inserted as first child of `#below` (retry until present). Toggle button `弹`, `input` (`maxLength = 100`, placeholder `Send a danmu at m:ss…`), Send button, count text `N danmu · M from comments`. Enter or Send → trim, ignore empty, ignore if < 2 s since last send. `keydown`/`keypress`/`keyup` on the input call `stopPropagation()`. Colours from `--yt-spec-text-primary`, `--yt-spec-badge-chip-background`, `--yt-spec-10-percent-layer`.
- [ ] **Step 3:** `session.ts`: wait for `#movie_player` and its `video`; create Overlay + Timeline + Bar; subscribe; `requestAnimationFrame` loop: if `player.classList.contains("ad-showing")` → hide overlay, `timeline.reset` on the first frame after the ad, skip; else `for (d of timeline.tick(video.currentTime)) overlay.show(d.text, video.currentTime, video.playbackRate, ownIds.has(d.id))`; `bar.setTime` 4× a second. Video events: `pause` → `overlay.pause()`, `play` → `resume()`, `ratechange` → `setRate`, `seeking` → `overlay.clear(); timeline.reset(video.currentTime)`. On send: id = `newDanmuId()`, add to `ownIds` and timeline, `overlay.show` at once, then `sendDanmu`. Toggle → `enabledSetting.setValue`, `overlay.setVisible`.
- [ ] **Step 4:** `index.ts`: `defineContentScript({ matches: ["*://www.youtube.com/*"], main })`; on start and on `yt-navigate-finish`, read `v` from `location`; if it changed, call the previous teardown and `startSession(v)`; non-watch pages just tear down.
- [ ] **Step 5: Live check on `PkZNo7MFNFg`.** Send `hello from Kia` at any time: it flies at once with a border; reload, seek 3 s before that time: it flies again without a border. Pause → frozen; play → continues; 2× → twice as fast, no burst after dragging the scrubber far. Type `kfjlm /` + space + arrows in the input: all typed, video unaffected. Navigate to another video from the sidebar: no old danmaku, count resets. Toggle off/on: layer hides/shows, state survives reload.
- [ ] **Step 6:** Commit `feat: send and replay danmaku (feature 1)`.

### Task 6: Live danmaku between two windows

**Files:**
- Modify: `lib/session.ts`

- [ ] **Step 1:** In the `onAdded` callback (not initial, not own): add to timeline; if `|d.t − video.currentTime| ≤ 3` and playing, `overlay.show` at once.
- [ ] **Step 2: Live check:** two Chrome windows on the same video at about the same time; send from window A → appears in window B within ~2 s.
- [ ] **Step 3:** Commit `feat: show live danmaku from other viewers`.

### Task 7: Seeding from comments (Feature 2) + reset script

**Files:**
- Create: `lib/youtube-api.ts`, `lib/seed.ts`, `scripts/reset-video.sh`
- Modify: `lib/session.ts`, `lib/bar.ts` (count of `source === "comment"`)

**Interfaces:**
- Consumes: `parseIsoDuration`, `commentToDanmu`, `db`.
- Produces: `fetchDurationSec(videoId: string, key: string): Promise<number>` · `fetchComments(videoId: string, key: string, maxPages = 5): Promise<{ id: string; text: string }[]>` (`textOriginal ?? textDisplay`; `commentsDisabled` → `[]`; other errors throw) · `seedIfNeeded(videoId: string, key?: string): Promise<number | null>` (null = skipped).

- [ ] **Step 1:** `seedIfNeeded`: no key → null. `getDoc(videos/{id})` exists → null. Fetch duration + comments; any error → log once, return null (no claim). Build seeds: for each comment `commentToDanmu(text, duration)` → ids `c_<commentId>_<n>`, cap 300. Claim with `setDoc(videos/{id}, { seededAt: serverTimestamp(), seedCount })`; permission-denied → someone else seeded → null. Write seeds with `writeBatch`, ≤ 500 per batch, `source: "comment"`.
- [ ] **Step 2:** Call it from `startSession` after the subscription is live (fire and forget).
- [ ] **Step 3:** `scripts/reset-video.sh <videoId>`: `firebase firestore:delete videos/<id> --project kia-danmu -f`, then delete that video's `danmu` docs (list with a one-off `node` script using the REST API, or the Firebase MCP) — dev use only.
- [ ] **Step 4: Live check:** reset `PkZNo7MFNFg`, reload: bar shows `… from comments` > 30; at 5:58 "data types and variables" flies; second load does not call the API again (Network tab: no `commentThreads` request).
- [ ] **Step 5:** Commit `feat: seed danmaku from timestamped comments (feature 2)`.

### Task 8: Polish, README, demo prep

**Files:**
- Modify: `entrypoints/content/style.css`, `lib/overlay.ts` as needed
- Create: `README.md`

- [ ] **Step 1: Live checks:** dark and light YouTube theme (bar readable), theater mode, fullscreen (danmaku visible, lanes recomputed), ads hide the layer.
- [ ] **Step 2:** README: what it is (two features, one paragraph), install (`pnpm i && pnpm build`, load `.output/chrome-mv3`), AI-use note (built with Claude Code; chat log kept per the course's AI policy).
- [ ] **Step 3:** `pnpm build`; Kia swaps the dev build for `.output/chrome-mv3` (works without the dev server). Pre-seed the demo videos; pick a p5.js tutorial with timestamp comments as the second.
- [ ] **Step 4:** Commit `docs: README and demo prep`.

### Task 9: Backup recording

- [ ] 30–60 s screen recording on the demo video: seeded danmaku flying, typing and sending one, a second window receiving it. Saved outside the repo. (How it is recorded is decided with Kia at this step.)
