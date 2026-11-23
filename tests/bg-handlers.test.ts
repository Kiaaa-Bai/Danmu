import { describe, expect, it, vi } from 'vitest';
import { createHandlers, type BgDeps } from '@/lib/bg-handlers';
import type { StoredToken } from '@/lib/youtube-auth';

const NOW = 10_000_000;
const REDIRECT = 'https://x.chromiumapp.org/';
const FRESH: StoredToken = { token: 'fresh', expiresAt: NOW + 3_600_000 };
const EXPIRED: StoredToken = { token: 'old', expiresAt: NOW - 1 };

function deps(over: { token?: StoredToken | null; channelId?: string | null; on?: boolean; renewTo?: string } = {}) {
  let token = over.token === undefined ? FRESH : over.token;
  let channelId = over.channelId === undefined ? 'UC_kia' : over.channelId;
  const d = {
    tokens: {
      load: vi.fn(async () => token),
      save: vi.fn(async (t: StoredToken | null) => {
        token = t;
      }),
      launch: vi.fn(async (_url: string, _interactive: boolean) =>
        over.renewTo ? `${REDIRECT}#access_token=${over.renewTo}&expires_in=3600` : undefined,
      ),
      clientId: 'cid',
      redirectUri: REDIRECT,
      now: () => NOW,
    },
    channel: {
      load: vi.fn(async () => channelId),
      save: vi.fn(async (id: string | null) => {
        channelId = id;
      }),
    },
    postingOn: vi.fn(async () => over.on ?? true),
    postComment: vi.fn(async () => 'Ugx_new0001'),
    fetchChannel: vi.fn(async (): Promise<{ id: string; title: string } | null> => ({ id: 'UC_kia', title: 'Kia Bai' })),
    revoke: vi.fn(async () => {}),
  } satisfies BgDeps;
  return { d, h: createHandlers(d), token: () => token, channelId: () => channelId };
}

describe('post', () => {
  it('refuses to post when the switch is off in storage', async () => {
    const { d, h } = deps({ on: false });
    await expect(h.post('vid12345678', '6:09 hi')).resolves.toEqual({ ok: false, reason: 'off' });
    expect(d.postComment).not.toHaveBeenCalled();
  });

  it('posts with a fresh stored token without re-checking the channel', async () => {
    const { d, h } = deps();
    await expect(h.post('vid12345678', '6:09 hi')).resolves.toEqual({ ok: true, commentId: 'Ugx_new0001' });
    expect(d.postComment).toHaveBeenCalledWith('fresh', 'vid12345678', '6:09 hi');
    expect(d.fetchChannel).not.toHaveBeenCalled();
  });

  it('posts after a silent renewal that comes back as the same channel', async () => {
    const { d, h } = deps({ token: EXPIRED, renewTo: 'renewed' });
    await expect(h.post('vid12345678', '6:09 hi')).resolves.toEqual({ ok: true, commentId: 'Ugx_new0001' });
    expect(d.fetchChannel).toHaveBeenCalledWith('renewed');
    expect(d.postComment).toHaveBeenCalledWith('renewed', 'vid12345678', '6:09 hi');
  });

  it('signs out instead of posting when a silent renewal comes back as another channel', async () => {
    const { d, h, token } = deps({ token: EXPIRED, renewTo: 'renewed' });
    d.fetchChannel.mockResolvedValue({ id: 'UC_someone_else', title: 'Someone' });
    await expect(h.post('vid12345678', '6:09 hi')).resolves.toEqual({ ok: false, reason: 'signedOut' });
    expect(d.postComment).not.toHaveBeenCalled();
    expect(token()).toBeNull();
  });

  it('is signed out when the token cannot be renewed', async () => {
    const { d, h } = deps({ token: EXPIRED });
    await expect(h.post('vid12345678', '6:09 hi')).resolves.toEqual({ ok: false, reason: 'signedOut' });
    expect(d.postComment).not.toHaveBeenCalled();
  });
});

describe('signIn', () => {
  it('remembers which channel signed in', async () => {
    const { h, channelId } = deps({ token: null, channelId: null, renewTo: 'new' });
    await expect(h.signIn()).resolves.toEqual({ ok: true, channelTitle: 'Kia Bai' });
    expect(channelId()).toBe('UC_kia');
  });

  it('clears the token for an account with no channel', async () => {
    const { d, h, token } = deps({ token: null, channelId: null, renewTo: 'new' });
    d.fetchChannel.mockResolvedValue(null);
    await expect(h.signIn()).resolves.toEqual({ ok: false, reason: 'noChannel' });
    expect(token()).toBeNull();
  });
});

describe('signOut', () => {
  it('revokes the token and forgets the token and the channel', async () => {
    const { d, h, token, channelId } = deps();
    await h.signOut();
    expect(d.revoke).toHaveBeenCalledWith('fresh');
    expect(token()).toBeNull();
    expect(channelId()).toBeNull();
  });
});
