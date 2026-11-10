/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { EscalationRiskEngine, RawRiskInputs } from './riskModel';

describe('Phase D: EscalationRiskEngine Vitest Suite', () => {
  const createBaseInputs = (): RawRiskInputs => ({
    closingSpeed: 0.0,
    timeToCollision: Infinity,
    pairwiseDistance: 5.0,
    wristSpeedRatio: 0.1,
    weaponDetectionHistory: [false, false, false, false, false, false],
    fightProbability: 0.02,
    motionEnergy: 1.0,
    isInRestrictedZone: false,
    crowdDensity: 0.1,
    isNight: false
  });

  it('correctly bounds and normalizes the 10-dimensional feature vector phi in [0, 1]^10', () => {
    const inputs = createBaseInputs();
    inputs.closingSpeed = 7.0; // Exceeds V_REF=3.5 -> clamped to 1.0
    inputs.timeToCollision = 1.0; // 1 / 1.0 = 1.0 -> 1.0
    inputs.pairwiseDistance = 0.0; // exp(0) = 1.0
    inputs.wristSpeedRatio = 8.0; // Exceeds 4.0 -> clamped to 1.0
    inputs.isInRestrictedZone = true; // 1.0
    inputs.crowdDensity = 4.0; // Exceeds rho_crit=2.0 -> clamped to 1.0
    inputs.isNight = true; // 1.0

    const phi = EscalationRiskEngine.extractFeatureVector(inputs);
    expect(phi).toHaveLength(10);
    phi.forEach(val => {
      expect(val).toBeGreaterThanOrEqual(0.0);
      expect(val).toBeLessThanOrEqual(1.0);
    });
    expect(phi[0]).toBe(1.0);
    expect(phi[1]).toBe(1.0);
    expect(phi[2]).toBe(1.0);
    expect(phi[3]).toBe(1.0);
    expect(phi[7]).toBe(1.0);
    expect(phi[8]).toBe(1.0);
    expect(phi[9]).toBe(1.0);
  });

  it('guarantees monotonic calibrated probabilities using PAVA isotonic regression', () => {
    const rawPreds = [0.15, 0.25, 0.35, 0.60, 0.75, 0.90];
    const labels = [0, 1, 0, 1, 0, 1]; // non-monotonic reversals
    const { calibratedValues } = EscalationRiskEngine.fitIsotonicRegression(rawPreds, labels);

    expect(calibratedValues.length).toBeGreaterThan(0);
    for (let i = 1; i < calibratedValues.length; i++) {
      expect(calibratedValues[i]).toBeGreaterThanOrEqual(calibratedValues[i - 1]);
    }
  });

  it('computes exact Brier score and Expected Calibration Error (ECE)', () => {
    const preds = [0.9, 0.8, 0.2, 0.1];
    const labels = [1, 1, 0, 0];
    const evalRes = EscalationRiskEngine.evaluateCalibration(preds, labels);

    // Squared error: 0.01 + 0.04 + 0.04 + 0.01 = 0.10 / 4 = 0.0250
    expect(evalRes.brierScore).toBeCloseTo(0.0250, 4);
    expect(evalRes.ece).toBeGreaterThanOrEqual(0.0);
    expect(evalRes.bins).toHaveLength(10);
  });

  it('strictly enforces weapon persistence >= 4 of the last 6 frames', () => {
    const inputsTransient = createBaseInputs();
    inputsTransient.weaponDetectionHistory = [false, false, false, true, true, true]; // 3/6
    const phiTransient = EscalationRiskEngine.extractFeatureVector(inputsTransient);
    expect(phiTransient[4]).toBeLessThan(0.5);

    const inputsPersistent = createBaseInputs();
    inputsPersistent.weaponDetectionHistory = [false, false, true, true, true, true]; // 4/6
    const phiPersistent = EscalationRiskEngine.extractFeatureVector(inputsPersistent);
    expect(phiPersistent[4]).toBe(1.0);
  });

  it('smooths raw probabilities via EMA and triggers dual hysteresis', () => {
    const engine = new EscalationRiskEngine();
    const highRisk = createBaseInputs();
    highRisk.closingSpeed = 3.5;
    highRisk.timeToCollision = 1.0;
    highRisk.pairwiseDistance = 0.5;
    highRisk.wristSpeedRatio = 3.0;
    highRisk.fightProbability = 0.9;
    highRisk.isInRestrictedZone = true;

    // First frame
    const r1 = engine.evaluateFrame(highRisk);
    expect(r1.emaScore).toBeGreaterThan(0.0);
    expect(r1.emaScore).toBeLessThan(r1.calibratedProbability);

    // Continuous exposure
    let hysteresisTriggered = false;
    for (let f = 0; f < 8; f++) {
      const res = engine.evaluateFrame(highRisk);
      if (res.isHysteresisActive) {
        hysteresisTriggered = true;
        break;
      }
    }
    expect(hysteresisTriggered).toBe(true);
  });
});
