/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Error Taxonomy & i18n Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { ERROR_REGISTRY, ErrorTaxonomyEngine } from '../errors/errorTaxonomy';
import { TRANSLATIONS } from './i18nEngine';

describe('Error Taxonomy & Remediation Engine', () => {
  it('contains expected standard error codes with plain-language remediations', () => {
    const requiredCodes = [
      'CAM_PERM_DENIED',
      'CAM_NOT_FOUND',
      'YT_EMBED_FORBIDDEN',
      'YT_INVALID_URL',
      'CALIB_COLLINEAR',
      'CALIB_INSUFFICIENT_PTS',
      'SCENE_CUT_DESYNC',
      'WEBGPU_UNAVAILABLE',
      'HASH_INTEGRITY_FAIL',
      'CLIP_BUFFER_OVERFLOW'
    ];

    requiredCodes.forEach(code => {
      const err = ERROR_REGISTRY[code];
      expect(err).toBeDefined();
      expect(err.code).toBe(code);
      expect(err.message.length).toBeGreaterThan(10);
      expect(err.remediation.length).toBeGreaterThan(10);
      expect(err.titleHi.length).toBeGreaterThan(0);
      expect(err.messageHi.length).toBeGreaterThan(0);
    });
  });

  it('manages active error state and notifications cleanly', () => {
    const engine = new ErrorTaxonomyEngine();
    let currentErrors: string[] = [];

    const unsubscribe = engine.subscribe(errors => {
      currentErrors = errors.map(e => e.code);
    });

    engine.raiseError('CAM_PERM_DENIED');
    expect(currentErrors).toContain('CAM_PERM_DENIED');

    engine.raiseError('SCENE_CUT_DESYNC');
    expect(currentErrors.length).toBe(2);

    engine.dismissError('CAM_PERM_DENIED');
    expect(currentErrors).not.toContain('CAM_PERM_DENIED');
    expect(currentErrors).toContain('SCENE_CUT_DESYNC');

    engine.clearAll();
    expect(currentErrors.length).toBe(0);

    unsubscribe();
  });
});

describe('Bilingual English & Hindi (हिन्दी) Localization', () => {
  it('guarantees complete translation coverage between English and Hindi', () => {
    const enKeys = Object.keys(TRANSLATIONS.en);
    const hiKeys = Object.keys(TRANSLATIONS.hi);

    expect(enKeys.length).toBeGreaterThanOrEqual(35);
    expect(hiKeys.length).toBeGreaterThanOrEqual(35);

    // Verify every English key has a non-empty Hindi counterpart
    enKeys.forEach(key => {
      expect(TRANSLATIONS.hi[key]).toBeDefined();
      expect(TRANSLATIONS.hi[key].trim().length).toBeGreaterThan(0);
    });
  });

  it('includes mandatory weapon assistive wording in both English and Hindi', () => {
    // English
    expect(TRANSLATIONS.en.weapon_alert_banner).toBe('Possible Weapon: Needs Human Verification');
    expect(TRANSLATIONS.en.weapon_review_required).toContain('human review');

    // Hindi
    expect(TRANSLATIONS.hi.weapon_alert_banner).toBe('संभावित हथियार: मानवीय सत्यापन आवश्यक है');
    expect(TRANSLATIONS.hi.weapon_review_required).toContain('मानवीय समीक्षा');
  });

  it('translates core CCTV entities accurately', () => {
    expect(TRANSLATIONS.hi.cat_people).toBe('लोग');
    expect(TRANSLATIONS.hi.cat_animals).toBe('पशु');
    expect(TRANSLATIONS.hi.cat_objects).toBe('वस्तुएं');
    expect(TRANSLATIONS.hi.btn_start).toBe('निगरानी शुरू करें');
    expect(TRANSLATIONS.hi.btn_stop).toBe('निगरानी रोकें');
  });
});
