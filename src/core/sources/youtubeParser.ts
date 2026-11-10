/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - YouTube URL Parser & Validation Engine (Phase G)
 * 
 * Strict Input Validation:
 *   - Only permits legitimate YouTube domains (youtube.com, www.youtube.com, m.youtube.com, youtu.be, www.youtube-nocookie.com).
 *   - Extracts 11-character Video ID matching strict regex ^[A-Za-z0-9_-]{11}$.
 *   - Supports URL formats:
 *     1. Standard watch: https://www.youtube.com/watch?v=VIDEO_ID
 *     2. Short link: https://youtu.be/VIDEO_ID
 *     3. Shorts: https://www.youtube.com/shorts/VIDEO_ID
 *     4. Live stream: https://www.youtube.com/live/VIDEO_ID
 *     5. Embedded: https://www.youtube.com/embed/VIDEO_ID
 *     6. Playlist item: https://www.youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID
 *   - Parses start timestamp from query params 't' or 'start' (supports formats like 90, 90s, 1m30s, 1h2m3s).
 *   - Rejects phishing, internal IPs, SSRF attempts, or invalid ID lengths with user-friendly messages.
 */

export interface YouTubeParseResult {
  isValid: boolean;
  videoId?: string;
  startTimeSec: number;
  playlistId?: string;
  canonicalUrl?: string;
  embedUrl?: string;
  error?: string;
}

export class YouTubeParser {
  private static readonly VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
  private static readonly ALLOWED_HOSTS = new Set([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'youtu.be',
    'youtube-nocookie.com',
    'www.youtube-nocookie.com'
  ]);

  /**
   * Parses time string or seconds integer into seconds.
   * Supports: '90', '90s', '1m30s', '1h2m30s', '2h', etc.
   */
  public static parseTimeParam(timeParam: string | null | undefined): number {
    if (!timeParam) return 0;
    const clean = timeParam.trim().toLowerCase();

    // Plain integer check
    if (/^\d+$/.test(clean)) {
      return parseInt(clean, 10);
    }

    // Trailing 's' check e.g. '120s'
    if (/^\d+s$/.test(clean)) {
      return parseInt(clean.slice(0, -1), 10);
    }

    // Compound format e.g. 1h2m30s or 2m10s
    let totalSeconds = 0;
    const hoursMatch = clean.match(/(\d+)h/);
    const minutesMatch = clean.match(/(\d+)m/);
    const secondsMatch = clean.match(/(\d+)s/);

    if (hoursMatch) totalSeconds += parseInt(hoursMatch[1], 10) * 3600;
    if (minutesMatch) totalSeconds += parseInt(minutesMatch[1], 10) * 60;
    if (secondsMatch) totalSeconds += parseInt(secondsMatch[1], 10);

    return totalSeconds > 0 ? totalSeconds : 0;
  }

  /**
   * Strictly parses and validates a YouTube video URL.
   */
  public static parse(rawInput: string): YouTubeParseResult {
    if (!rawInput || typeof rawInput !== 'string') {
      return {
        isValid: false,
        startTimeSec: 0,
        error: 'Please paste a valid YouTube video link.'
      };
    }

    const trimmed = rawInput.trim();

    // If user pasted bare 11-char ID directly
    if (YouTubeParser.VIDEO_ID_REGEX.test(trimmed)) {
      return {
        isValid: true,
        videoId: trimmed,
        startTimeSec: 0,
        canonicalUrl: `https://www.youtube.com/watch?v=${trimmed}`,
        embedUrl: `https://www.youtube-nocookie.com/embed/${trimmed}?enablejsapi=1`
      };
    }

    // Add protocol if user started with youtube.com or youtu.be
    let normalizedUrl = trimmed;
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      return {
        isValid: false,
        startTimeSec: 0,
        error: "This doesn't look like a valid web address."
      };
    }

    // Validate hostname strictly against allowed YouTube domains
    const host = parsedUrl.hostname.toLowerCase();
    if (!YouTubeParser.ALLOWED_HOSTS.has(host)) {
      return {
        isValid: false,
        startTimeSec: 0,
        error: `Invalid domain "${host}". Only official YouTube links (youtube.com or youtu.be) are supported.`
      };
    }

    let videoId: string | undefined;
    let playlistId: string | undefined;

    // Check query params for playlist
    const listParam = parsedUrl.searchParams.get('list');
    if (listParam && /^[A-Za-z0-9_-]+$/.test(listParam)) {
      playlistId = listParam;
    }

    // Format 1: youtu.be/VIDEO_ID
    if (host === 'youtu.be') {
      const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0) {
        videoId = pathParts[0];
      }
    }
    // Format 2: youtube.com/watch?v=VIDEO_ID
    else if (parsedUrl.pathname === '/watch') {
      const v = parsedUrl.searchParams.get('v');
      if (v) videoId = v;
    }
    // Format 3: youtube.com/shorts/VIDEO_ID
    else if (parsedUrl.pathname.startsWith('/shorts/')) {
      const parts = parsedUrl.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        videoId = parts[1];
      }
    }
    // Format 4: youtube.com/live/VIDEO_ID
    else if (parsedUrl.pathname.startsWith('/live/')) {
      const parts = parsedUrl.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        videoId = parts[1];
      }
    }
    // Format 5: youtube.com/embed/VIDEO_ID
    else if (parsedUrl.pathname.startsWith('/embed/')) {
      const parts = parsedUrl.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        videoId = parts[1];
      }
    }

    // Strict 11-char alphanumeric/underscore/dash regex check
    if (!videoId || !YouTubeParser.VIDEO_ID_REGEX.test(videoId)) {
      return {
        isValid: false,
        startTimeSec: 0,
        error: "Could not extract a valid 11-character YouTube video ID from this link."
      };
    }

    // Parse start time parameter ('t' or 'start')
    const tParam = parsedUrl.searchParams.get('t') || parsedUrl.searchParams.get('start');
    const startTimeSec = YouTubeParser.parseTimeParam(tParam);

    return {
      isValid: true,
      videoId,
      startTimeSec,
      playlistId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&autoplay=1&mute=1&playsinline=1&rel=0`
    };
  }

  /**
   * Pre-configured public domain / Creative Commons surveillance, traffic & pedestrian test clips.
   */
  public static getExampleClips(): Array<{ label: string; url: string; description: string }> {
    return [
      {
        label: 'Crosswalk Pedestrians & Cyclists',
        url: 'https://www.youtube.com/watch?v=1EiC9bvVGnk',
        description: 'Urban street crossing with multiple pedestrians, distances, and varying speeds.'
      },
      {
        label: 'City Center Walkway CCTV',
        url: 'https://www.youtube.com/watch?v=wqctLW03xoY',
        description: 'Fixed perspective CCTV angle showing pedestrians walking, pausing, and interacting.'
      },
      {
        label: 'Shibuya Crossing High-Angle Flow',
        url: 'https://www.youtube.com/watch?v=b0Osd_kS1mY',
        description: 'High-density pedestrian crowd dynamics and group kinematics.'
      },
      {
        label: 'Retail Store Aisle Monitoring',
        url: 'https://www.youtube.com/watch?v=mn61fNq7c6g',
        description: 'Indoor ceiling-mount camera monitoring human-object proximity.'
      }
    ];
  }
}
