# Post bullet comments to YouTube — Design

Date: 2026-11-23 · Owner: Kia Bai · Follows: `2026-10-26-danmu-design.md`
Context: Web Tools final project. Kia's order: finish the Chrome extension, publish it to the Chrome
Web Store, and add this feature before publishing.

## Intent

When someone sends a bullet comment, the extension also posts it as a timestamped comment under the
YouTube video, from that person's own YouTube account: a bullet comment "stuck here too" sent at 6:09
becomes the YouTube comment `6:09 stuck here too`. People without the extension see it in the normal
comments, and the comment-danmaku feature (Feature 2) turns it back into a bullet comment for everyone
else. Kia asked for this on 2026-11-03 (route A, "fully automatic") and again on 2026-11-16 and 2026-11-23.

## Goals

1. A switch, **off by default**, in the gear settings panel: "Also post to YouTube comments".
2. Turning it on opens Google sign-in with an account and channel picker. After sign-in the panel shows
   which channel posts, plus Sign out.
3. With the switch on, every sent bullet comment is also posted as a top-level YouTube comment
   `m:ss text` (`h:mm:ss text` from one hour on), using the video time the danmu was sent at.
4. The comment that came from a bullet comment is not shown twice: the copy that comes back through
   Feature 2 is hidden, matched by its YouTube comment id.
5. A failed YouTube post never touches the bullet comment itself; a short reason appears under the switch.

## Non-goals

Replies to existing comments · editing or deleting posted comments · posting danmu sent before the
switch was on · several signed-in accounts at once · browsers other than Chrome · the privacy policy,
Google OAuth verification, quota audit and store listing (the next step, "publish") · the phone app.

## Anti-goals (a failure even if it "works")

- Posting anything to YouTube without the person having turned the switch on.
- A YouTube error delaying, blocking or taking back the bullet comment.
- **Removing identical bullet comments from different people.** Kia, 2026-11-23: many people sending
  the same words at a hype moment is the point of danmaku. Never de-duplicate by text.
- Storing who sent a danmu (channel id, email, name) in Firestore.
- YouTube's keyboard shortcuts firing while using the new switch (the bar's existing rule).

## Constraints

- **Google OAuth verification.** `youtube.force-ssl` is a sensitive scope. Until Google verifies the app,
  at most 100 users can sign in and they see "Google hasn't verified this app". Kia's choice
  (2026-11-23): publish with the feature and run verification in parallel.
- **Quota.** One Google Cloud project, 10,000 units a day for all users together. `commentThreads.insert`
  costs 50; opening a video already costs up to 6 (duration + up to 5 comment pages). No paid tier;
  more needs YouTube's audit and quota extension form, after launch. No extra projects to get around it.
- **Sign-in runs in a background script.** `chrome.identity` is not available to content scripts, so a
  new `entrypoints/background.ts` signs in and posts; the content script asks it by message.
- **The extension id must be fixed** before the OAuth client exists, because the redirect URI contains it
  (`https://<id>.chromiumapp.org/`). The id comes from a Chrome Web Store draft; its public key goes into
  the manifest `key` so the unpacked dev build has the same id.
- Firestore rules stay create-only except one narrow update (below). Rules deploy is Kia's call.
- Credentials are Kia's to enter. The OAuth client id is not a secret, but lives in `.env.local` next to
  the API key for one place to look.

## Approaches considered

| | How | Trade-off | |
|---|---|---|---|
| A | YouTube Data API `commentThreads.insert`, sign-in via `chrome.identity.launchWebAuthFlow` with an account picker | Needs OAuth setup, verification and quota; posts as the channel the person picks | **Picked** |
| B | `chrome.identity.getAuthToken` (Chrome's own account) | One less popup, Chrome refreshes tokens; always posts as the browser's Google account, which may not be the YouTube channel they use | Dropped |
| C | Fill YouTube's own comment box and click Comment from the page | No sign-in, no quota; YouTube's terms forbid automated use, breaks on redesigns, risky in store review | Dropped |

Route B from 2026-11-03 (prefill the box, the person clicks Comment) was already rejected by Kia as not automatic.

## Design

### Flow on send (`lib/session.ts` `onSend`)

1. As today: show the danmu at once, write it to Firestore; if Firestore rejects it, take it back
   and stop (nothing goes to YouTube).
2. If the switch is on: send `{ type: 'post', videoId, text: formatStamp(t) + ' ' + text }` to the
   background. Do not await it inside the send path; the input is free right away.
3. On success the background returns the new top-level comment id. The content script then
   (a) adds the id to this tab's linked-comment set, and (b) updates the Firestore doc with
   `ytCommentId`.
4. On failure, the bar shows the reason under the switch: comments turned off · daily limit reached ·
   signed out, sign in again · this account has no YouTube channel · couldn't post.

### De-duplication by comment id

- Comment danmaku already carry ids `c_<commentId>_<n>`.
- The session keeps `linkedCommentIds`. Ids are added from (a) own successful posts and (b) any Firestore
  danmu that has `ytCommentId`. `subscribeDanmu` must also pass on `modified` docs, because the id arrives
  as an update.
- When comment danmaku load, skip those whose comment id is linked. When a linked id arrives after the
  comment danmaku are already on the timeline, remove those items (`c_<id>_*`).
- Nothing is matched by text or by person.

### Firestore

`danmu` gains optional `ytCommentId` (string, `^[A-Za-z0-9_-]{10,64}$`). Rules: create unchanged (the
field is not allowed at create); new `allow update` only when the sole changed key is `ytCommentId`
and the doc had none before. Still no delete.

### Background (`entrypoints/background.ts`)

- `signIn`: `launchWebAuthFlow({ interactive: true })` on Google's OAuth endpoint, `response_type=token`,
  scope `https://www.googleapis.com/auth/youtube.force-ssl`, `prompt=select_account`. Keep the access
  token in `storage.session`, its expiry beside it. Fetch the channel title once
  (`channels.list?part=snippet&mine=true`, 1 unit) and keep it in `local:youtubeAccount`.
- `post`: if the token is missing or expired, try a silent renew (`interactive: false`, `prompt=none`);
  if that fails, answer `signedOut`. POST `commentThreads?part=snippet` with
  `{ snippet: { videoId, topLevelComment: { snippet: { textOriginal } } } }`; return
  `snippet.topLevelComment.id`. Map API errors to the reasons above.
- `signOut`: revoke the token (`https://oauth2.googleapis.com/revoke`), clear session and account.
- Manifest: `permissions: ['storage', 'identity']`, `key: <public key from the store draft>`.

### Settings and UI

- `local:postToYouTube` (boolean, fallback `false`) and `local:youtubeAccount` (`{ channelTitle }` or null).
- Gear panel, new last row "YouTube": Off/On segmented control in the existing style, then a small line
  `Posting as <channel> · Sign out` when signed in, or the last error. Turning it on when signed out
  starts sign-in; a cancelled sign-in puts the switch back to Off.

### Testing

- Unit (vitest): `formatStamp` (0:05, 6:09, 59:59, 1:02:09), error-to-reason mapping, de-dup filter both
  orders (comments first, Firestore first), and that identical text from two danmu is never removed.
- Real YouTube, with Kia's OK on which video: a real public comment appears under his channel; the
  danmu shows once for a second viewer; posting fails cleanly on a video with comments off.

## Kia's steps (credentials and payment are his)

1. Register a Chrome Web Store developer account (one-time US$5).
2. Upload a build zip as a new item, **draft only**; copy the item id and public key.
3. Google Cloud, the project that holds the API key: OAuth consent screen (External, app name, support
   email, scope `youtube.force-ssl`, publishing status "In production"); then an OAuth client of type
   Web application with redirect URI `https://<item id>.chromiumapp.org/`.
4. Put the client id in `.env.local` as `WXT_GOOGLE_OAUTH_CLIENT_ID`.

## Left to the builder

Message shapes and file split inside `lib/` · exact error strings · whether silent renew needs
`login_hint` · how the panel row looks within the existing panel style.
