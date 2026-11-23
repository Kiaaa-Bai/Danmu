import { describe, expect, it, vi } from 'vitest';
import {
  authUrl,
  parseAuthRedirect,
  signInToken,
  validToken,
  YT_SCOPE,
  type StoredToken,
  type TokenDeps,
} from '@/lib/youtube-auth';

const REDIRECT = 'https://x.chromiumapp.org/';
const NOW = 10_000_000;

function deps(stored: StoredToken | null, launch: TokenDeps['launch']): TokenDeps & { save: ReturnType<typeof vi.fn> } {
  return {
    load: vi.fn().mockResolvedValue(stored),
    save: vi.fn().mockResolvedValue(undefined),
    launch: vi.fn(launch),
    clientId: 'cid',
    redirectUri: REDIRECT,
    now: () => NOW,
  };
}

describe('authUrl', () => {
  it('asks for the account picker when interactive', () => {
    const u = new URL(authUrl('cid', REDIRECT, true));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: 'cid',
      redirect_uri: REDIRECT,
      response_type: 'token',
      scope: YT_SCOPE,
      prompt: 'select_account',
    });
  });

  it('uses prompt=none when silent', () =>
    expect(new URL(authUrl('cid', REDIRECT, false)).searchParams.get('prompt')).toBe('none'));
});

describe('parseAuthRedirect', () => {
  it('reads the token from the redirect fragment', () =>
    expect(parseAuthRedirect(`${REDIRECT}#access_token=ya29.a&token_type=Bearer&expires_in=3599`, 1000)).toEqual({
      token: 'ya29.a',
      expiresAt: 1000 + 3_599_000,
    }));

  it('returns null when the person refused', () =>
    expect(parseAuthRedirect(`${REDIRECT}#error=access_denied`, 1000)).toBeNull());
});

describe('validToken', () => {
  it('uses a stored token with more than 60 s left, without launching', async () => {
    const d = deps({ token: 'fresh', expiresAt: NOW + 61_000 }, async () => undefined);
    await expect(validToken(d)).resolves.toBe('fresh');
    expect(d.launch).not.toHaveBeenCalled();
  });

  it('renews silently when expired and saves the new token', async () => {
    const d = deps({ token: 'old', expiresAt: NOW + 59_000 }, async () => `${REDIRECT}#access_token=new&expires_in=3600`);
    await expect(validToken(d)).resolves.toBe('new');
    const [url, interactive] = (d.launch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(new URL(url).searchParams.get('prompt')).toBe('none');
    expect(interactive).toBe(false);
    expect(d.save).toHaveBeenCalledWith({ token: 'new', expiresAt: NOW + 3_600_000 });
  });

  it('returns null and clears storage when silent renew fails', async () => {
    const d = deps({ token: 'old', expiresAt: NOW - 1 }, async () => {
      throw new Error('User interaction required.');
    });
    await expect(validToken(d)).resolves.toBeNull();
    expect(d.save).toHaveBeenCalledWith(null);
  });
});

describe('signInToken', () => {
  it('opens the account picker and saves the token', async () => {
    const d = deps(null, async () => `${REDIRECT}#access_token=t1&expires_in=3600`);
    await expect(signInToken(d)).resolves.toEqual({ token: 't1', expiresAt: NOW + 3_600_000 });
    expect((d.launch as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toBe(true);
    expect(d.save).toHaveBeenCalledWith({ token: 't1', expiresAt: NOW + 3_600_000 });
  });

  it('returns null when the sign-in window is closed', async () => {
    const d = deps(null, async () => {
      throw new Error('The user did not approve access.');
    });
    await expect(signInToken(d)).resolves.toBeNull();
  });
});
