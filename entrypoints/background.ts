import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import type { BgRequest, PostResult, SignInResult } from '@/lib/messages';
import { failureFor, fetchChannelTitle, postComment } from '@/lib/youtube-api';
import { signInToken, validToken, type StoredToken, type TokenDeps } from '@/lib/youtube-auth';

/** The access token lives only in session storage: gone when Chrome closes, never visible to web pages. */
const tokenItem = storage.defineItem<StoredToken | null>('session:ytToken', { fallback: null });

const clientId: string | undefined = import.meta.env.WXT_GOOGLE_OAUTH_CLIENT_ID;

function tokenDeps(): TokenDeps {
  return {
    load: () => tokenItem.getValue(),
    save: (t) => tokenItem.setValue(t),
    launch: (url, interactive) => browser.identity.launchWebAuthFlow({ url, interactive }),
    clientId: clientId ?? '',
    redirectUri: browser.identity.getRedirectURL(),
    now: () => Date.now(),
  };
}

async function signIn(): Promise<SignInResult> {
  if (!clientId) {
    console.error('[danmu] WXT_GOOGLE_OAUTH_CLIENT_ID is missing from .env.local');
    return { ok: false, reason: 'failed' };
  }
  const t = await signInToken(tokenDeps());
  if (!t) return { ok: false, reason: 'cancelled' };
  let title: string | null;
  try {
    title = await fetchChannelTitle(t.token);
  } catch (err) {
    console.warn('[danmu] channel lookup failed', err);
    return { ok: false, reason: 'failed' };
  }
  if (title === null) {
    await tokenItem.setValue(null);
    return { ok: false, reason: 'noChannel' };
  }
  return { ok: true, channelTitle: title };
}

async function post(videoId: string, text: string): Promise<PostResult> {
  const token = await validToken(tokenDeps());
  if (!token) return { ok: false, reason: 'signedOut' };
  try {
    return { ok: true, commentId: await postComment(token, videoId, text) };
  } catch (err) {
    const reason = failureFor(err);
    if (reason === 'signedOut') await tokenItem.setValue(null);
    if (reason === 'failed') console.warn('[danmu] post failed', err);
    return { ok: false, reason };
  }
}

async function signOut(): Promise<void> {
  const t = await tokenItem.getValue();
  if (t) {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: t.token }),
    }).catch(() => undefined);
  }
  await tokenItem.setValue(null);
}

function handle(req: BgRequest): Promise<SignInResult | PostResult | void> {
  switch (req.type) {
    case 'signIn':
      return signIn();
    case 'post':
      return post(req.videoId, req.text);
    case 'signOut':
      return signOut();
  }
}

/** chrome.identity only works here, so the content script asks this script to sign in and to post. */
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    void handle(msg as BgRequest).then(sendResponse);
    return true; // the answer comes asynchronously
  });
});
