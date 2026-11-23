import { describe, expect, it } from 'vitest';
import { commentIdOf, isLinkedComment } from '@/lib/linked';
import type { Danmu } from '@/lib/store';

const user = (id: string, text: string): Danmu => ({ id, videoId: 'vid12345678', t: 369, text, source: 'user' });
const fromComment = (commentId: string, text: string, n = 0): Danmu => ({
  id: `c_${commentId}_${n}`,
  videoId: 'vid12345678',
  t: 369,
  text,
  source: 'comment',
});

describe('commentIdOf', () => {
  it('parses comment ids that contain _ and -', () => expect(commentIdOf('c_Ugx_a-B9_kz12_0')).toBe('Ugx_a-B9_kz12'));
  it('returns null for danmu sent through the extension', () => expect(commentIdOf('AbC123xyz0AbC123xyz0')).toBeNull());
});

describe('isLinkedComment', () => {
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
});
