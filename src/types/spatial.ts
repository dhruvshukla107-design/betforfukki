/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Core Type Definitions
 * Phase 1: Spatial & AI Architecture Specification
 */

export type AgeBand = '0-12' | '13-19' | '20-59' | '60+' | 'Unknown';

export type DetectionCategory = 'person' | 'animal' | 'object' | 'weapon';

export interface Detection {
  id?: number;
  cls: string;
  category: DetectionCategory;
  score: number;
  box: [number, number, number, number]; // [x, y, width, height] normalized (0..1) or pixel
  ageBand?: AgeBand;
  ageConfidence?: number;
  distanceM?: number; // estimated distance from 3D monocular depth map
  isWeaponAlert?: boolean;
  temporalConfirmationCount?: number;
}

export interface VerifyResult {
  verified: boolean;
  confidence: number;
  humanLabel: string;
  notes?: string;
  flaggedWeapon?: boolean;
}

export interface AIProvider {
  id: string;
  name: string;
  description: string;
  isLocal: boolean;
  init(opts?: Record<string, unknown>): Promise<void>;
  detect(frame: ImageBitmap | HTMLCanvasElement | HTMLVideoElement): Promise<Detection[]>;
  verify?(crop: ImageBitmap | HTMLCanvasElement, label: string): Promise<VerifyResult>;
}

export interface TrackedEntity {
  id: number;
  cls: string;
  category: DetectionCategory;
  score: number;
  box: [number, number, number, number]; // [cx, cy, w, h]
  velocity: [number, number];            // [vx, vy]
  ageHistory: AgeBand[];
  smoothAge?: AgeBand;
  distanceM?: number;
  missedFrames: number;
  hitStreak: number;
  firstSeen: number;
  lastSeen: number;
  weaponStreak: number;
  inZoneAlertSent?: boolean;
}

export interface ZonePolygon {
  id: string;
  name: string;
  points: [number, number][]; // normalized [x, y] coordinates (0..1)
  color: string;
  alertOnCategories: DetectionCategory[];
  active: boolean;
}

export interface SecurityEvent {
  id: string;
  timestamp: number;
  trackId: number;
  cls: string;
  category: DetectionCategory;
  confidence: number;
  ageBand?: AgeBand;
  distanceM?: number;
  thumbnailUrl?: string;
  zoneName?: string;
  status: 'new' | 'verified' | 'dismissed';
  notes?: string;
  isPossibleWeapon: boolean;
  verificationSource?: 'local' | 'cloud-vlm' | 'human';
}

export type PresetType = 'home' | 'shop' | 'office' | 'outdoor';

export interface PresetConfig {
  name: string;
  description: string;
  detectPeople: boolean;
  detectAnimals: boolean;
  detectObjects: boolean;
  detectWeapons: boolean;
  detectAgeGroups: boolean;
  detectDistance: boolean;
  sensitivity: 'low' | 'medium' | 'high';
  iouThreshold: number;
  confidenceThreshold: number;
}

export type SourceType =
  | 'webcam'
  | 'ip_camera'
  | 'video_url'
  | 'online_player'
  | 'upload_file'
  | 'youtube'
  | 'dataset_folder'
  | 'test_feed';

export type SourceStatus = 'connecting' | 'live' | 'buffering' | 'ended' | 'error';

export interface CameraSourceConfig {
  type: SourceType;
  name: string;
  url?: string;
  deviceId?: string;
  youtubeId?: string;
  startTimeSec?: number;
  file?: File;
  status?: SourceStatus;
  statusMessage?: string;
  playbackRate?: number;
  corsMode?: 'cors' | 'watch_only';
  streamType?: 'hls' | 'dash' | 'mp4' | 'webm' | 'direct' | 'unknown';
}

