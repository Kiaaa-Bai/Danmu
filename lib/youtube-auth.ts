/** Google sign-in for posting comments: the implicit flow through chrome.identity.launchWebAuthFlow. */

export const YT_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';

/** An access token and when it stops working (ms since epoch). Google gives no refresh token in this flow. */
export type StoredToken = { token: string; expiresAt: number };

/** Treat a token as expired this long before Google does, so a post never starts with a dying token. */
const EXPIRY_MARGIN_MS = 60_000;

export type TokenDeps = {
  load(): Promise<StoredToken | null>;
  save(t: StoredToken | null): Promise<void>;
  launch(url: string, interactive: boolean): Promise<string | undefined>;
  clientId: string;
  redirectUri: string;
  now(): number;
};

/** Interactive: Google's account and channel picker. Silent: reuse the Google session, or fail. */
export function authUrl(clientId: string, redirectUri: string, interactive: boolean): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('scope', YT_SCOPE);
  url.searchParams.set('prompt', interactive ? 'select_account' : 'none');
  return url.toString();
}

export function parseAuthRedirect(url: string, now: number): StoredToken | null {
  const params = new URLSearchParams(new URL(url).hash.slice(1));
  const token = params.get('access_token');
  const expiresIn = Number(params.get('expires_in'));
  if (!token || !(expiresIn > 0)) return null;
  return { token, expiresAt: now + expiresIn * 1000 };
}

async function launchFor(deps: TokenDeps, interactive: boolean): Promise<StoredToken | null> {
  try {
    const redirect = await deps.launch(authUrl(deps.clientId, deps.redirectUri, interactive), interactive);
    return redirect ? parseAuthRedirect(redirect, deps.now()) : null;
  } catch {
    return null; // window closed, access refused, or (silent) the Google session needs the person
  }
}

/** A token that works now: the stored one, or a silent renewal. Null means the person must sign in again. */
export async function validToken(deps: TokenDeps): Promise<string | null> {
  const stored = await deps.load();
  if (stored && stored.expiresAt - EXPIRY_MARGIN_MS > deps.now()) return stored.token;
  const renewed = await launchFor(deps, false);
  await deps.save(renewed);
  return renewed?.token ?? null;
}

/** Opens the account picker. Null when the person closes it or says no. */
export async function signInToken(deps: TokenDeps): Promise<StoredToken | null> {
  const t = await launchFor(deps, true);
  if (t) await deps.save(t);
  return t;
}
