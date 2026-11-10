/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { YouTubeParser } from './youtubeParser';

describe('Phase G: YouTubeParser Unit Test Suite', () => {
  it('parses standard youtube.com/watch?v= URLs', () => {
    const res = YouTubeParser.parse('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('dQw4w9WgXcQ');
    expect(res.startTimeSec).toBe(0);
    expect(res.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('parses short youtu.be/ URLs', () => {
    const res = YouTubeParser.parse('https://youtu.be/dQw4w9WgXcQ');
    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('dQw4w9WgXcQ');
  });

  it('parses YouTube Shorts URLs', () => {
    const res = YouTubeParser.parse('https://www.youtube.com/shorts/dQw4w9WgXcQ');
    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('dQw4w9WgXcQ');
  });

  it('parses YouTube Live URLs', () => {
    const res = YouTubeParser.parse('https://www.youtube.com/live/dQw4w9WgXcQ');
    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('dQw4w9WgXcQ');
  });

  it('parses embedded URLs', () => {
    const res = YouTubeParser.parse('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('dQw4w9WgXcQ');
  });

  it('correctly parses timestamps in various formats (plain seconds, 90s, 1m30s, 1h2m3s)', () => {
    expect(YouTubeParser.parseTimeParam('90')).toBe(90);
    expect(YouTubeParser.parseTimeParam('120s')).toBe(120);
    expect(YouTubeParser.parseTimeParam('1m30s')).toBe(90);
    expect(YouTubeParser.parseTimeParam('1h2m3s')).toBe(3723);

    const res = YouTubeParser.parse('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m45s');
    expect(res.isValid).toBe(true);
    expect(res.startTimeSec).toBe(105);
  });

  it('parses playlist links while preserving video ID and playlist ID', () => {
    const res = YouTubeParser.parse('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890abcdef');
    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('dQw4w9WgXcQ');
    expect(res.playlistId).toBe('PL1234567890abcdef');
  });

  it('accepts bare 11-char video ID directly', () => {
    const res = YouTubeParser.parse('dQw4w9WgXcQ');
    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('dQw4w9WgXcQ');
  });

  it('rejects malicious phishing domains or non-YouTube hosts', () => {
    const evilRes = YouTubeParser.parse('https://evil-site.com/watch?v=dQw4w9WgXcQ');
    expect(evilRes.isValid).toBe(false);
    expect(evilRes.error).toContain('Invalid domain');

    const subRes = YouTubeParser.parse('https://youtube.com.attacker.com/watch?v=dQw4w9WgXcQ');
    expect(subRes.isValid).toBe(false);
  });

  it('rejects invalid or malformed video IDs', () => {
    const shortIdRes = YouTubeParser.parse('https://www.youtube.com/watch?v=tooShort');
    expect(shortIdRes.isValid).toBe(false);

    const specialCharRes = YouTubeParser.parse('https://www.youtube.com/watch?v=invalid$$$11');
    expect(specialCharRes.isValid).toBe(false);
  });
});
