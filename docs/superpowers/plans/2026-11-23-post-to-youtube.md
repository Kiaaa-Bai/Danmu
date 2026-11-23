# Post Bullet Comments to YouTube Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With a switch on, every bullet comment the person sends is also posted from their own YouTube channel as a top-level comment `m:ss text`, and that comment is not shown twice as a bullet comment.

**Architecture:** A new MV3 background script signs in with `chrome.identity.launchWebAuthFlow` (implicit flow, account picker) and calls `commentThreads.insert`. The content script asks it by message after the Firestore write succeeds, then stores the returned YouTube comment id on the danmu (`ytCommentId`). Comment danmaku whose comment id is linked are dropped. Pure logic lives in `lib/` with injected dependencies so vitest covers it; the background script and `session.ts` stay thin glue.

**Tech Stack:** WXT 0.21 (MV3, `browser`, `wxt/utils/storage`), TypeScript, Firebase JS SDK 13 (Firestore), YouTube Data API v3, vitest 5 + happy-dom.

**Spec:** `docs/superpowers/specs/2026-11-23-post-to-youtube-design.md`

## Global Constraints

- Switch default **off**: `local:postToYouTube`, fallback `false`. Nothing is posted unless the person turned it on.
- Scope `https://www.googleapis.com/auth/youtube.force-ssl`; `response_type=token`; `prompt=select_account` when interactive, `prompt=none` when silent.
- Comment text: `m:ss text`, `h:mm:ss text` from 3600 s on; seconds floored; one space between stamp and text.
- De-duplicate **only** by YouTube comment id. Never by text, never by person.
- `ytCommentId` matches `^[A-Za-z0-9_-]{10,64}$`; settable once, by update; no other update; no delete.
- Access token only in `session:` storage (background). Channel title in `local:youtubeAccount`. Nothing about the person goes to Firestore.
- A YouTube failure never delays, blocks or takes back the danmu. `onSend` does not await the YouTube post.
- UI copy is English and says "bullet comment"; the new row lives in the **gear** panel (Kia, 2026-11-23).
- Credentials are Kia's to enter. Client id comes from `.env.local` as `WXT_GOOGLE_OAUTH_CLIENT_ID`.
- Git: work on branch `feat/post-to-youtube`. Commit steps run only once Kia has OK'd committing; never push.
- Real YouTube posts only on a video Kia picks. Firestore rules deploy only on Kia's OK.
- Checks after every task: `pnpm test` all green; `pnpm exec tsc --noEmit` clean.

## Review Focus

1. **Token expires after an hour mid-session** and silent renew fails → the danmu still sends, the switch turns Off with "Signed out. Turn on to sign in again" (Task 3 `validToken` test, Task 5 `afterFailure` test).
2. **Google account with no YouTube channel** → sign-in ends Off with "This Google account has no YouTube channel", nothing posted (Task 3 `fetchChannelTitle` test, Task 5 `switchYouTube` test).
3. **Comments load before the Firestore snapshot, or after** → the linked comment ends up hidden either way, identical text from others stays (Task 2 tests for both paths).
4. **Navigating to another video while a post is in flight** → the old danmu still gets its `ytCommentId`; the new video's timeline is untouched (Task 5 `isStopped` test).
5. **Firestore link write rejected** (rules not deployed yet) → the YouTube post still counts as success, no error shown, console warning only (Task 5 test).

---

### Task 0 (Kia, can run in parallel with Tasks 1–6)

- [ ] **Step 1:** Agent runs `pnpm wxt zip` → `.output/danmu-for-youtube-0.1.0-chrome.zip`.
- [ ] **Step 2 (Kia):** Register a Chrome Web Store developer account (one-time US$5). Upload the zip as a new item, **save as draft, do not submit**. Copy the item id and, from Package → "View public key", the public key.
- [ ] **Step 3 (Kia):** Google Cloud, the project that holds the YouTube API key: OAuth consent screen (External; app name "Bullet Comments for YouTube"; support email; scope `.../auth/youtube.force-ssl`; publishing status **In production**). Credentials → OAuth client ID → **Web application**, authorized redirect URI `https://<item id>.chromiumapp.org/`.
- [ ] **Step 4 (Kia):** Add `WXT_GOOGLE_OAUTH_CLIENT_ID=<client id>` to `.env.local`. Tell the agent the item id and public key.

### Task 1: Timestamp formatter

**Files:**
- Modify: `lib/timestamps.ts`
- Test: `tests/timestamps.test.ts`

**Interfaces:**
- Produces: `formatStamp(t: number): string`

- [ ] **Step 1: Write the failing tests**

```ts
describe('formatStamp', () => {
  it.each([
    [5, '0:05'],
    [369.4, '6:09'],
    [3599.9, '59:59'],
    [3729, '1:02:09'],
  ])('%s s → %s', (t, s) => expect(formatStamp(t)).toBe(s));

  it('reads back through comment danmaku at the same second', () => {
    expect(commentToDanmu(`${formatStamp(369.4)} stuck here too`, 600)).toEqual([{ t: 369, text: 'stuck here too' }]);
  });
});
```

- [ ] **Step 2:** Run `pnpm test tests/timestamps.test.ts` → FAIL, `formatStamp` is not exported.
- [ ] **Step 3:** Implement `formatStamp(t: number): string` in `lib/timestamps.ts` (floor; pad seconds to 2; minutes padded to 2 only when hours are shown).
- [ ] **Step 4:** Run `pnpm test tests/timestamps.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat: m:ss formatter for posted comments`

### Task 2: Linked comments (data, Firestore, timeline)

**Files:**
- Create: `lib/linked.ts`
- Modify: `lib/store.ts`, `lib/timeline.ts`, `firestore.rules`
- Test: `tests/linked.test.ts`, `tests/timeline.test.ts`

**Interfaces:**
- Produces: `Danmu.ytCommentId?: string` · `commentIdOf(danmuId: string): string | null` · `isLinkedComment(d: Danmu, linked: ReadonlySet<string>): boolean` · `Timeline.removeWhere(pred: (x: T) => boolean): number` · `setCommentLink(danmuId: string, ytCommentId: string): Promise<void>` · `subscribeDanmu` now also passes on `modified` docs.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/linked.test.ts
const user = (id: string, text: string): Danmu => ({ id, videoId: 'vid12345678', t: 369, text, source: 'user' });
const fromComment = (commentId: string, text: string, n = 0): Danmu =>
  ({ id: `c_${commentId}_${n}`, videoId: 'vid12345678', t: 369, text, source: 'comment' });

it('parses comment ids that contain _ and -', () => expect(commentIdOf('c_Ugx_a-B9_kz12_0')).toBe('Ugx_a-B9_kz12'));
it('returns null for danmu sent through the extension', () => expect(commentIdOf('AbC123xyz0AbC123xyz0')).toBeNull());
it('hides only the comment with the linked id', () => {
  const linked = new Set(['Ugx_linked01']);
  expect(isLinkedComment(fromComment('Ugx_linked01', 'stuck here too'), linked)).toBe(true);
  expect(isLinkedComment(fromComment('Ugx_other002', 'stuck here too'), linked)).toBe(false);
});
it('never hides bullet comments, even with the same text at the same second', () => {
  const linked = new Set(['Ugx_linked01']);
  expect(isLinkedComment(user('d1', 'stuck here too'), linked)).toBe(false);
  expect(isLinkedComment(user('d2', 'stuck here too'), linked)).toBe(false);
});

// tests/timeline.test.ts — the "linked id arrives after the comments" path
it('removeWhere drops matching items and says how many', () => {
  const tl = new Timeline<{ id: string; t: number }>();
  tl.add([{ id: 'a', t: 1 }, { id: 'b', t: 2 }, { id: 'c', t: 3 }]);
  expect(tl.removeWhere((x) => x.id !== 'b')).toBe(2);
  expect(tl.size).toBe(1);
  expect(tl.has('a')).toBe(false);
  expect(tl.between(0, 10).map((x) => x.id)).toEqual(['b']);
});
```

- [ ] **Step 2:** Run `pnpm test tests/linked.test.ts tests/timeline.test.ts` → FAIL (missing exports / method).
- [ ] **Step 3:** Implement in `lib/linked.ts`: `commentIdOf` with `/^c_(.+)_\d+$/`; `isLinkedComment` true only when `d.source === 'comment'` and the parsed id is in `linked`. Add `Timeline.removeWhere` (one pass; keep `ids` in sync).
- [ ] **Step 4:** `lib/store.ts`: add `ytCommentId?: string` to `Danmu` and to the snapshot mapping; change the `docChanges()` filter from `type === 'added'` to `type !== 'removed'`; add `setCommentLink` using `updateDoc(doc(db, 'danmu', danmuId), { ytCommentId })`.
- [ ] **Step 5:** `firestore.rules`: replace `allow update, delete: if false;` with

```
      // The YouTube comment this danmu was also posted as (set once, after posting).
      allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['ytCommentId'])
        && !('ytCommentId' in resource.data)
        && request.resource.data.ytCommentId is string
        && request.resource.data.ytCommentId.matches('^[A-Za-z0-9_-]{10,64}$');
      allow delete: if false;
```

  Create rules stay as they are (no `ytCommentId` at create).
- [ ] **Step 6:** Run `pnpm test` and `pnpm exec tsc --noEmit` → all pass.
- [ ] **Step 7: Commit** `feat: link a danmu to the YouTube comment it was posted as`

### Task 3: YouTube write API and sign-in helpers

**Files:**
- Create: `lib/messages.ts`, `lib/youtube-auth.ts`
- Modify: `lib/youtube-api.ts`
- Test: `tests/youtube-auth.test.ts`, `tests/youtube-api.test.ts`

**Interfaces:**
- Produces (`lib/messages.ts`, types and constants only, no runtime imports):
  - `type PostFailure = 'commentsDisabled' | 'quotaExceeded' | 'signedOut' | 'noChannel' | 'failed'`
  - `type BgRequest = { type: 'signIn' } | { type: 'signOut' } | { type: 'post'; videoId: string; text: string }`
  - `type SignInResult = { ok: true; channelTitle: string } | { ok: false; reason: 'cancelled' | 'noChannel' | 'failed' }`
  - `type PostResult = { ok: true; commentId: string } | { ok: false; reason: PostFailure }`
  - `type YouTubeState = { on: boolean; channelTitle: string | null; error: string | null }`
  - `const FAILURE_TEXT: Record<PostFailure, string>` = commentsDisabled `Comments are off on this video` · quotaExceeded `YouTube posting limit reached for today` · signedOut `Signed out. Turn on to sign in again` · noChannel `This Google account has no YouTube channel` · failed `Couldn't post to YouTube`
- Produces (`lib/youtube-auth.ts`): `YT_SCOPE` · `type StoredToken = { token: string; expiresAt: number }` (ms epoch) · `authUrl(clientId, redirectUri, interactive: boolean): string` · `parseAuthRedirect(url: string, now: number): StoredToken | null` · `type TokenDeps = { load(): Promise<StoredToken | null>; save(t: StoredToken | null): Promise<void>; launch(url: string, interactive: boolean): Promise<string | undefined>; clientId: string; redirectUri: string; now(): number }` · `validToken(deps): Promise<string | null>` · `signInToken(deps): Promise<StoredToken | null>`
- Produces (`lib/youtube-api.ts`): `YouTubeApiError` gains a third constructor param `status = 0` (set it in `get` too) · `postComment(token, videoId, text): Promise<string>` (returns `snippet.topLevelComment.id`) · `fetchChannelTitle(token): Promise<string | null>` (`channels?part=snippet&mine=true`; `null` when `items` is empty) · `failureFor(err: unknown): PostFailure`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/youtube-auth.test.ts
it('asks for the account picker when interactive', () => {
  const u = new URL(authUrl('cid', 'https://x.chromiumapp.org/', true));
  expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
  expect(Object.fromEntries(u.searchParams)).toEqual({
    client_id: 'cid', redirect_uri: 'https://x.chromiumapp.org/', response_type: 'token', scope: YT_SCOPE, prompt: 'select_account',
  });
});
it('uses prompt=none when silent', () =>
  expect(new URL(authUrl('cid', 'https://x.chromiumapp.org/', false)).searchParams.get('prompt')).toBe('none'));
it('reads the token from the redirect fragment', () =>
  expect(parseAuthRedirect('https://x.chromiumapp.org/#access_token=ya29.a&token_type=Bearer&expires_in=3599', 1000))
    .toEqual({ token: 'ya29.a', expiresAt: 1000 + 3_599_000 }));
it('returns null when the person refused', () =>
  expect(parseAuthRedirect('https://x.chromiumapp.org/#error=access_denied', 1000)).toBeNull());

// validToken with a fake TokenDeps (now = 10_000_000)
it('uses a stored token with more than 60 s left, without launching', ...);   // launch not called
it('renews silently when expired and saves the new token', ...);             // launch(url with prompt=none, false); save({token, expiresAt})
it('returns null and clears storage when silent renew fails', ...);          // launch rejects → null; save(null)   [Review Focus 1]
it('signInToken returns null when the sign-in window is closed', ...);       // launch(…, true) rejects → null

// tests/youtube-api.test.ts (vi.stubGlobal('fetch', vi.fn()))
it('postComment posts the comment and returns the top-level comment id', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'thr1', snippet: { topLevelComment: { id: 'Ugx_new0001' } } })));
  await expect(postComment('tok', 'vid12345678', '6:09 hi')).resolves.toBe('Ugx_new0001');
  const [url, init] = fetchMock.mock.calls[0];
  expect(String(url)).toBe('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet');
  expect(init.method).toBe('POST');
  expect(init.headers.Authorization).toBe('Bearer tok');
  expect(JSON.parse(init.body)).toEqual({ snippet: { videoId: 'vid12345678', topLevelComment: { snippet: { textOriginal: '6:09 hi' } } } });
});
it('fetchChannelTitle is null for an account with no channel', ...);  // { items: [] } → null   [Review Focus 2]
it.each([
  [401, 'authError', 'signedOut'],
  [403, 'commentsDisabled', 'commentsDisabled'],
  [403, 'quotaExceeded', 'quotaExceeded'],
  [403, 'ineligibleAccount', 'noChannel'],
  [403, 'youtubeSignupRequired', 'noChannel'],
  [500, 'backendError', 'failed'],
])('failureFor(%s %s) → %s', (status, reason, out) =>
  expect(failureFor(new YouTubeApiError(reason, 'x', status))).toBe(out));
it('failureFor a network error → failed', () => expect(failureFor(new TypeError('Failed to fetch'))).toBe('failed'));
```

- [ ] **Step 2:** Run `pnpm test tests/youtube-auth.test.ts tests/youtube-api.test.ts` → FAIL.
- [ ] **Step 3:** Implement `lib/messages.ts` exactly as in Interfaces.
- [ ] **Step 4:** Implement `lib/youtube-auth.ts`. A token counts as expired 60 s before `expiresAt`. `validToken` → stored if fresh, else silent `launch(authUrl(..., false), false)` → `parseAuthRedirect` → `save`; any throw or `null` → `save(null)`, return `null`. `signInToken` → `launch(authUrl(..., true), true)`; throw or `null` → `null`; else `save` and return it.
- [ ] **Step 5:** Extend `lib/youtube-api.ts`: an authed JSON helper (Bearer header, no `key`), `postComment`, `fetchChannelTitle`, `failureFor` (401 → `signedOut`; reasons `commentsDisabled`; `quotaExceeded`/`dailyLimitExceeded` → `quotaExceeded`; `ineligibleAccount`/`youtubeSignupRequired`/`channelNotFound` → `noChannel`; anything else → `failed`).
- [ ] **Step 6:** Run `pnpm test` and `pnpm exec tsc --noEmit` → all pass.
- [ ] **Step 7: Commit** `feat: YouTube comment posting and Google sign-in helpers`

### Task 4: Background script and manifest

**Files:**
- Create: `entrypoints/background.ts`
- Modify: `wxt.config.ts`

**Interfaces:**
- Consumes: Task 3 (`validToken`, `signInToken`, `postComment`, `fetchChannelTitle`, `failureFor`, `BgRequest`, `PostResult`, `SignInResult`)
- Produces: answers to `browser.runtime.sendMessage(req: BgRequest)`: `signIn` → `SignInResult` · `post` → `PostResult` · `signOut` → `undefined`

- [ ] **Step 1:** `wxt.config.ts`: `permissions: ['storage', 'identity']`.
- [ ] **Step 2:** `entrypoints/background.ts` with `defineBackground`. One `onMessage` listener that calls `handle(req)` and replies via `sendResponse`, returning `true`. `TokenDeps`: `load`/`save` on `storage.defineItem<StoredToken | null>('session:ytToken', { fallback: null })`; `launch` = `browser.identity.launchWebAuthFlow({ url, interactive })`; `redirectUri` = `browser.identity.getRedirectURL()`; `clientId` = `import.meta.env.WXT_GOOGLE_OAUTH_CLIENT_ID` (missing → `signIn` answers `failed` with a console error).
  - `signIn`: `signInToken` null → `cancelled`; `fetchChannelTitle` throws → `failed`; `null` → clear token, `noChannel`; else `ok`.
  - `post`: `validToken` null → `signedOut`; `postComment` → `ok`; catch → `failureFor`, and on `signedOut` clear the token.
  - `signOut`: if a token is stored, POST `https://oauth2.googleapis.com/revoke?token=<token>` (ignore errors); clear it.
- [ ] **Step 3:** Run `pnpm build` → succeeds; `.output/chrome-mv3/manifest.json` has `"identity"` in `permissions` and `background.service_worker`. Run `pnpm test` → all pass.
- [ ] **Step 4: Commit** `feat: background script signs in and posts comments`

### Task 5: Content-side posting and switch logic

**Files:**
- Create: `lib/post-to-youtube.ts`
- Modify: `lib/settings.ts`
- Test: `tests/post-to-youtube.test.ts`

**Interfaces:**
- Consumes: `formatStamp` (Task 1), `BgRequest`/`PostResult`/`SignInResult`/`PostFailure`/`YouTubeState`/`FAILURE_TEXT` (Task 3)
- Produces:
  - `postToYouTubeSetting` (`local:postToYouTube`, fallback `false`) and `youtubeAccountSetting` (`local:youtubeAccount`, `string | null`, fallback `null`) in `lib/settings.ts`
  - `ask<R>(req: BgRequest): Promise<R>` (wraps `browser.runtime.sendMessage`; callers name the result type)
  - `postDanmu(d: Pick<Danmu, 'id' | 'videoId' | 't' | 'text'>, deps: { send(req: BgRequest): Promise<PostResult>; link(danmuId: string, commentId: string): Promise<void>; onLinked(commentId: string): void; isStopped(): boolean }): Promise<PostResult>`
  - `switchYouTube(on: boolean, deps: { channelTitle: string | null; signIn(): Promise<SignInResult> }): Promise<YouTubeState>`
  - `afterFailure(state: YouTubeState, reason: PostFailure): YouTubeState`

- [ ] **Step 1: Write the failing tests**

```ts
const d = { id: 'd1', videoId: 'vid12345678', t: 369.4, text: 'stuck here too' };
const deps = (over = {}) => ({
  send: vi.fn().mockResolvedValue({ ok: true, commentId: 'Ugx_new0001' }),
  link: vi.fn().mockResolvedValue(undefined), onLinked: vi.fn(), isStopped: () => false, ...over,
});

it('posts "m:ss text" once and links the returned id', async () => {
  const x = deps();
  await expect(postDanmu(d, x)).resolves.toEqual({ ok: true, commentId: 'Ugx_new0001' });
  expect(x.send).toHaveBeenCalledOnce();
  expect(x.send).toHaveBeenCalledWith({ type: 'post', videoId: 'vid12345678', text: '6:09 stuck here too' });
  expect(x.onLinked).toHaveBeenCalledWith('Ugx_new0001');
  expect(x.link).toHaveBeenCalledWith('d1', 'Ugx_new0001');
});
it('links nothing when the post fails', ...);                            // send → { ok: false, reason: 'failed' }; link, onLinked not called
it('still succeeds when the Firestore link write is rejected', ...);     // link rejects → resolves ok   [Review Focus 5]
it('leaves the next video alone but still links in Firestore', ...);     // isStopped → true: onLinked not called, link called   [Review Focus 4]

it('signs in when turned on while signed out', async () => {
  const signIn = vi.fn().mockResolvedValue({ ok: true, channelTitle: 'Kia Bai' });
  await expect(switchYouTube(true, { channelTitle: null, signIn })).resolves.toEqual({ on: true, channelTitle: 'Kia Bai', error: null });
});
it('goes back to Off when sign-in is cancelled', ...);                   // { ok:false, reason:'cancelled' } → { on:false, channelTitle:null, error:null }
it('explains an account with no channel', ...);                          // reason 'noChannel' → { on:false, channelTitle:null, error: FAILURE_TEXT.noChannel }   [Review Focus 2]
it('turns on without signing in again when already signed in', ...);    // signIn not called
it('turning off keeps the account', ...);                                // → { on:false, channelTitle:'Kia Bai', error:null }
it('a signed-out failure turns the switch off', () =>                    // [Review Focus 1]
  expect(afterFailure({ on: true, channelTitle: 'Kia Bai', error: null }, 'signedOut'))
    .toEqual({ on: false, channelTitle: null, error: FAILURE_TEXT.signedOut }));
it('other failures keep the switch on and show the reason', ...);        // 'commentsDisabled' → on true, channel kept, error text
```

- [ ] **Step 2:** Run `pnpm test tests/post-to-youtube.test.ts` → FAIL.
- [ ] **Step 3:** Add the two settings; implement `lib/post-to-youtube.ts` per Interfaces. In `postDanmu`, catch a rejected `link` with `console.warn('[danmu] link failed', err)`; call `onLinked` only when `!isStopped()`.
- [ ] **Step 4:** Run `pnpm test` and `pnpm exec tsc --noEmit` → all pass.
- [ ] **Step 5: Commit** `feat: post sent danmu to YouTube and handle the switch`

### Task 6: Gear-panel row and session wiring

**Files:**
- Modify: `lib/bar.ts`, `entrypoints/content/style.css`, `lib/session.ts`
- Test: `tests/bar.test.ts`

**Interfaces:**
- Consumes: `YouTubeState`, `FAILURE_TEXT` (Task 3); `postDanmu`, `switchYouTube`, `afterFailure`, `ask`, settings (Task 5); `isLinkedComment`, `setCommentLink`, `Timeline.removeWhere` (Task 2)
- Produces: `BarHandlers.onYouTube(on: boolean): void` · `BarHandlers.onSignOut(): void` · `Bar.setYouTube(state: YouTubeState): void`

- [ ] **Step 1: Write the failing tests** (add `onYouTube`/`onSignOut` spies to every `new Bar({...})` in the file)

```ts
describe('Bar YouTube row', () => {
  it('sits in the gear panel', () => expect(document.querySelector('.dm-panel-display .dm-yt')).not.toBeNull());
  it('reports On', () => {
    [...document.querySelectorAll<HTMLButtonElement>('.dm-yt .dm-seg-btn')].find((b) => b.textContent === 'On')!.click();
    expect(onYouTube).toHaveBeenCalledWith(true);
  });
  it('shows the channel and Sign out when on', () => {
    bar.setYouTube({ on: true, channelTitle: 'Kia Bai', error: null });
    expect(document.querySelector('.dm-yt-status')!.textContent).toContain('Posting as Kia Bai');
    document.querySelector<HTMLButtonElement>('.dm-yt-signout')!.click();
    expect(onSignOut).toHaveBeenCalledOnce();
  });
  it('shows the error instead of the channel', () => {
    bar.setYouTube({ on: false, channelTitle: null, error: "Couldn't post to YouTube" });
    expect(document.querySelector('.dm-yt-status')!.textContent).toBe("Couldn't post to YouTube");
  });
});
```

- [ ] **Step 2:** Run `pnpm test tests/bar.test.ts` → FAIL.
- [ ] **Step 3:** `lib/bar.ts`: last row of `displayPanel`, `row('YouTube', …)` with class `dm-yt`, holding a `segmented<boolean>` (`Off` / `On`, root title `Also post to YouTube comments`) and a `.dm-yt-status` line: the error if any, else `Posting as <channel>` + ` · ` + a `.dm-yt-signout` button `Sign out` when on, else empty. `style.css`: small, muted status text in the panel's existing type scale; the Sign out button styled as a text link.
- [ ] **Step 4:** Run `pnpm test tests/bar.test.ts` → PASS.
- [ ] **Step 5:** `lib/session.ts` wiring:
  - Load `postToYouTubeSetting` and `youtubeAccountSetting` in the existing `Promise.all`; `let yt: YouTubeState = { on, channelTitle, error: null }`; `bar.setYouTube(yt)`. A `setYt(next)` helper renders and saves both settings.
  - `const linked = new Set<string>()`; `link(id)` adds to the set, then `timeline.removeWhere((x) => isLinkedComment(x, linked))`, and `updateCount()` when anything was removed.
  - `onSend`: after `await sendDanmu(d)` succeeds and `yt.on`: `void postDanmu(d, { send: (r) => ask<PostResult>(r), link: setCommentLink, onLinked: link, isStopped: () => stopped })` and, on `{ ok: false }` while not stopped, `setYt(afterFailure(yt, reason))`. Not awaited.
  - `subscribeDanmu` callback: after `timeline.add(items)`, call `link(d.ytCommentId)` for each item that has one.
  - `loadCommentDanmu(...).then`: `timeline.add(items.filter((x) => !isLinkedComment(x, linked)))`.
  - `onYouTube(on)`: `setYt(await switchYouTube(on, { channelTitle: yt.channelTitle, signIn: () => ask<SignInResult>({ type: 'signIn' }) }))`.
  - `onSignOut()`: `await ask({ type: 'signOut' })`; `setYt({ on: false, channelTitle: null, error: null })`.
- [ ] **Step 6:** Run `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm build` → all pass.
- [ ] **Step 7: Commit** `feat: YouTube switch in the gear panel`

### Task 7: Fixed id, rules deploy, real-YouTube check

Needs Task 0 done. Every step that posts or deploys waits for Kia's OK.

- [ ] **Step 1:** `wxt.config.ts` manifest: `key: '<public key from Task 0>'`. `pnpm build`; Kia reloads `.output/chrome-mv3` in `chrome://extensions` → the shown id equals the store item id.
- [ ] **Step 2 (Kia's OK):** `firebase deploy --only firestore:rules` → "Deploy complete".
- [ ] **Step 3 (Kia picks the video):** gear panel → YouTube On → Google account and channel picker → panel shows `Posting as <channel>`.
- [ ] **Step 4:** Send `test one` → under the video, a comment `m:ss test one` from Kia's channel; the Firestore doc has `ytCommentId`.
- [ ] **Step 5:** A second Chrome profile with the extension, switch off, opens the video → `test one` flies once at that second; it sends `test one` at the same second → both fly.
- [ ] **Step 6:** On a video with comments off, send → the danmu flies, the panel says `Comments are off on this video`.
- [ ] **Step 7:** Sign out → switch Off, status line empty; send → no new YouTube comment.
- [ ] **Step 8:** Screenshots of steps 3–6 for Kia. Commit `chore: fixed extension id`.
