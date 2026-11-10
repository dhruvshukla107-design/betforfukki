/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Online Player URL Parser Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { OnlinePlayerParser } from './onlinePlayerParser';

describe('OnlinePlayerParser', () => {
  it('rejects empty and whitespace URLs', () => {
    const res = OnlinePlayerParser.validate('');
    expect(res.isValid).toBe(false);
    expect(res.error).toBeDefined();

    const res2 = OnlinePlayerParser.validate('   ');
    expect(res2.isValid).toBe(false);
  });

  it('rejects malformed URLs without protocols', () => {
    const res = OnlinePlayerParser.validate('not-a-valid-url');
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Invalid URL');
  });

  it('rejects unsupported protocols like ftp or javascript', () => {
    const res = OnlinePlayerParser.validate('ftp://example.com/video.mp4');
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('ftp');
  });

  it('validates blob URLs from local file uploads', () => {
    const res = OnlinePlayerParser.validate('blob:http://localhost:3000/1234-5678');
    expect(res.isValid).toBe(true);
    expect(res.format).toBe('direct');
  });

  it('detects HLS stream format (.m3u8)', () => {
    const res = OnlinePlayerParser.validate('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
    expect(res.isValid).toBe(true);
    expect(res.format).toBe('hls');
    expect(res.formatLabel).toContain('HLS');

    const resWithQuery = OnlinePlayerParser.validate('https://cdn.example.com/live/stream.m3u8?token=xyz');
    expect(resWithQuery.isValid).toBe(true);
    expect(resWithQuery.format).toBe('hls');
  });

  it('detects DASH stream format (.mpd)', () => {
    const res = OnlinePlayerParser.validate('https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd');
    expect(res.isValid).toBe(true);
    expect(res.format).toBe('dash');
    expect(res.formatLabel).toContain('DASH');
  });

  it('detects MP4 format (.mp4)', () => {
    const res = OnlinePlayerParser.validate('https://example.com/surveillance_sample.mp4');
    expect(res.isValid).toBe(true);
    expect(res.format).toBe('mp4');
    expect(res.formatLabel).toContain('MP4');
  });

  it('detects WebM format (.webm)', () => {
    const res = OnlinePlayerParser.validate('https://example.com/cctv_footage.webm');
    expect(res.isValid).toBe(true);
    expect(res.format).toBe('webm');
    expect(res.formatLabel).toContain('WebM');
  });

  it('detects direct streams for generic paths', () => {
    const res = OnlinePlayerParser.validate('https://camera.local/feed');
    expect(res.isValid).toBe(true);
    expect(res.format).toBe('direct');
  });

  it('provides benchmark clips', () => {
    const clips = OnlinePlayerParser.getBenchmarkClips();
    expect(clips.length).toBeGreaterThanOrEqual(4);
    expect(clips.some(c => c.format === 'mp4')).toBe(true);
    expect(clips.some(c => c.format === 'hls')).toBe(true);
    expect(clips.some(c => c.format === 'dash')).toBe(true);
  });
});
