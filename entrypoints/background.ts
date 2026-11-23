import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import { createHandlers } from '@/lib/bg-handlers';
import type { BgRequest, PostResult, SignInResult } from '@/lib/messages';
import { postToYouTubeSetting } from '@/lib/settings';
import { fetchChannel, postComment } from '@/lib/youtube-api';
import type { StoredToken } from '@/lib/youtube-auth';

/** The access token lives only in session storage: gone when Chrome closes, never visible to web pages. */
const tokenItem = storage.defineItem<StoredToken | null>('session:ytToken', { fallback: null });
/** Which channel the person signed in as; public, kept so a renewed token can be checked against it. */
const channelItem = storage.defineItem<string | null>('local:ytChannelId', { fallback: null });

const clientId: string | undefined = import.meta.env.WXT_GOOGLE_OAUTH_CLIENT_ID;
if (!clientId) console.error('[danmu] WXT_GOOGLE_OAUTH_CLIENT_ID is missing from .env.local');

const handlers = createHandlers({
  tokens: {
    load: () => tokenItem.getValue(),
    save: (t) => tokenItem.setValue(t),
    launch: (url, interactive) => browser.identity.launchWebAuthFlow({ url, interactive }),
    clientId: clientId ?? '',
    redirectUri: browser.identity.getRedirectURL(),
    now: () => Date.now(),
  },
  channel: { load: () => channelItem.getValue(), save: (id) => channelItem.setValue(id) },
  postingOn: () => postToYouTubeSetting.getValue(),
  postComment,
  fetchChannel,
  revoke: async (token) => {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
  },
});

function handle(req: BgRequest): Promise<SignInResult | PostResult | void> {
  switch (req.type) {
    case 'signIn':
      return handlers.signIn();
    case 'post':
      return handlers.post(req.videoId, req.text);
    case 'signOut':
      return handlers.signOut();
  }
}

/** chrome.identity only works here, so the content script asks this script to sign in and to post. */
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    void handle(msg as BgRequest).then(sendResponse);
    return true; // the answer comes asynchronously
  });
});
