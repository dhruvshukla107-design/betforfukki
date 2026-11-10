/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { EvaluationHarness } from './evaluationHarness';
import { SecurityEngine } from '../security/securityEngine';

describe('Phase F: EvaluationHarness & SecurityEngine Vitest Suite', () => {
  it('computes laser benchmark accuracy with MAE and MAPE within +/- 4%', () => {
    const groundTruth = [1.50, 2.00, 3.20, 4.50, 5.00, 6.20, 7.50];
    const measured =    [1.54, 2.06, 3.11, 4.38, 5.15, 6.02, 7.28];
    const metrics = EvaluationHarness.computeMetricAccuracy(measured, groundTruth);

    expect(metrics.sampleCount).toBe(7);
    expect(metrics.mape).toBeLessThanOrEqual(4.0);
    expect(metrics.mae).toBeGreaterThan(0.0);
    expect(metrics.ci95Lower).toBeLessThan(metrics.mape);
    expect(metrics.ci95Upper).toBeGreaterThan(metrics.mape);
    expect(metrics.benchmarkTargetPassed).toBe(true);
  });

  it('calculates MOTA and IDF1 tracking metrics accurately', () => {
    const report = EvaluationHarness.computeMOTA(100, 5, 8, 2, 87);
    expect(report.mota).toBeCloseTo(0.85, 4);
    expect(report.idf1).toBeCloseTo(174 / 187, 4);
  });

  it('encrypts and decrypts with AES-GCM-256 without data loss', async () => {
    const salt = new Uint8Array(16);
    const key = await SecurityEngine.deriveKeyFromPassphrase('test-passphrase-vitest', salt);
    const secret = 'CONFIDENTIAL_SECURITY_DISPATCH_MESSAGE';

    const enc = await SecurityEngine.encryptAESGCM(secret, key);
    expect(enc.cipherText).toBeTruthy();
    expect(enc.iv).toBeTruthy();

    const dec = await SecurityEngine.decryptAESGCM(enc, key);
    expect(dec).toBe(secret);
  });

  it('constructs an immutable hash chain and detects block tampering', async () => {
    const security = new SecurityEngine();
    await security.appendEventBlock({ id: 1 }, 'Event 1');
    await security.appendEventBlock({ id: 2 }, 'Event 2');

    expect(security.verifyChainIntegrity().isValid).toBe(true);
    expect(security.getChain().length).toBe(3); // genesis + 2
  });
});
