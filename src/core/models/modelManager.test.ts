/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Model Manager & PWA Tests
 */

import { describe, it, expect } from 'vitest';
import { ModelManager, BUILTIN_MODELS, ModelMetadata } from './modelManager';
import manifest from '../../../public/manifest.json';

describe('Model Manager Registry & Backends', () => {
  it('loads built-in models with expected properties and SHA-256 digests', () => {
    const manager = new ModelManager();
    const models = manager.getAllModels();

    expect(models.length).toBeGreaterThanOrEqual(3);
    const yoloNano = models.find(m => m.id === 'yolov8n-edge');
    expect(yoloNano).toBeDefined();
    expect(yoloNano?.architecture).toBe('yolov8n');
    expect(yoloNano?.sha256).toBeDefined();
    expect(yoloNano?.sha256.length).toBe(64); // Valid SHA-256 hex string length
    expect(yoloNano?.classesCount).toBe(17);
  });

  it('allows adding and activating custom user models', () => {
    const manager = new ModelManager();
    const custom: ModelMetadata = {
      id: 'custom-fine-tuned-v1',
      name: 'Custom Warehouse Model',
      architecture: 'yolov8s',
      version: '1.0.0',
      sizeBytes: 12000000,
      inputShape: [1, 3, 640, 640],
      targetBackend: 'webgl',
      isBuiltIn: false,
      isCachedLocally: true,
      sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      description: 'Custom fine-tuned weights',
      licence: 'Proprietary',
      attribution: 'User Model',
      classesCount: 8
    };

    manager.addCustomModel(custom);
    expect(manager.getAllModels().some(m => m.id === 'custom-fine-tuned-v1')).toBe(true);

    manager.setActiveModelId('custom-fine-tuned-v1');
    expect(manager.getActiveModelId()).toBe('custom-fine-tuned-v1');
  });

  it('switches execution backends smoothly', () => {
    const manager = new ModelManager();
    manager.setActiveBackend('wasm');
    expect(manager.getActiveBackend()).toBe('wasm');

    manager.setActiveBackend('webgpu');
    expect(manager.getActiveBackend()).toBe('webgpu');
  });

  it('executes synthetic benchmark and returns valid metrics', async () => {
    const manager = new ModelManager();
    const result = await manager.runSyntheticBenchmark('webgl', 3);

    expect(result.averageLatencyMs).toBeGreaterThan(0);
    expect(result.throughputFps).toBeGreaterThan(0);
    expect(result.throughputFps).toBe(Math.round(1000 / result.averageLatencyMs));
  });
});

describe('PWA Manifest & Installability Standards', () => {
  it('adheres to PWA standards with short_name <= 12 characters and standalone display', () => {
    expect(manifest.id).toBe('/');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.name).toBe('SpatialMapper 3D - Live Vision & CCTV');

    // Rule: short_name must be <= 12 chars to prevent mobile home screen truncation
    expect(manifest.short_name).toBeDefined();
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);

    expect(manifest.theme_color).toBe('#0f172a');
    expect(manifest.background_color).toBe('#020617');
  });

  it('contains compliant 192x192, 512x512, and maskable icons', () => {
    expect(manifest.icons).toBeDefined();
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

    const has192 = manifest.icons.some(i => i.sizes.includes('192x192'));
    const has512 = manifest.icons.some(i => i.sizes.includes('512x512'));
    const hasMaskable = manifest.icons.some(i => i.purpose?.includes('maskable'));

    expect(has192).toBe(true);
    expect(has512).toBe(true);
    expect(hasMaskable).toBe(true);
  });
});
