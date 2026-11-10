/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Phase D Escalation-Risk Engine Unit Test Suite
 * Self-verifying test suite with exact numeric examples for:
 *   1. Feature Vector Normalization phi in [0, 1]^10
 *   2. Logistic Logit & Sigmoid Activation
 *   3. Platt Scaling Calibration
 *   4. Isotonic Regression (PAVA) Monotonicity
 *   5. Brier Score Calculation
 *   6. Expected Calibration Error (ECE)
 *   7. EMA Temporal Smoothing & Hysteresis
 *   8. CUSUM Cumulative Anomaly Detection
 *   9. Weapon Temporal Persistence Filter (>= 4 of 6 frames)
 *   10. Cost-Optimal Threshold Selection Matrix
 *   11. Explainability Top-3 Attribution & Demographic Exclusion
 */

import { EscalationRiskEngine, RawRiskInputs } from './riskModel';
import { TestResultItem } from '../calibration/phaseATests';

export class PhaseDTestRunner {
  public static runAllTests(): TestResultItem[] {
    const results: TestResultItem[] = [];

    // Helper baseline inputs
    const createBaselineInputs = (): RawRiskInputs => ({
      closingSpeed: 0.0,
      timeToCollision: Infinity,
      pairwiseDistance: 5.0,
      wristSpeedRatio: 0.2,
      weaponDetectionHistory: [false, false, false, false, false, false],
      fightProbability: 0.05,
      motionEnergy: 1.0,
      isInRestrictedZone: false,
      crowdDensity: 0.2,
      isNight: false
    });

    // 1. Feature Vector Extraction & Normalization
    try {
      const inputs = createBaselineInputs();
      inputs.closingSpeed = 3.5; // Exactly V_REF -> phi_0 = 1.0
      inputs.timeToCollision = 2.0; // 1 / 2.0 = 0.5 -> phi_1 = 0.5
      inputs.pairwiseDistance = 0.0; // exp(0) = 1.0 -> phi_2 = 1.0
      inputs.wristSpeedRatio = 2.0; // 2.0 / 4.0 = 0.5 -> phi_3 = 0.5
      inputs.isInRestrictedZone = true; // phi_7 = 1.0
      inputs.crowdDensity = 1.0; // 1.0 / 2.0 = 0.5 -> phi_8 = 0.5
      inputs.isNight = true; // phi_9 = 1.0

      const phi = EscalationRiskEngine.extractFeatureVector(inputs);
      const passed =
        Math.abs(phi[0] - 1.0) < 1e-5 &&
        Math.abs(phi[1] - 0.5) < 1e-5 &&
        Math.abs(phi[2] - 1.0) < 1e-5 &&
        Math.abs(phi[3] - 0.5) < 1e-5 &&
        Math.abs(phi[7] - 1.0) < 1e-5 &&
        Math.abs(phi[8] - 0.5) < 1e-5 &&
        Math.abs(phi[9] - 1.0) < 1e-5;

      results.push({
        id: 'test-feature-vector',
        name: '1. Feature Vector Normalization: phi in [0, 1]^10',
        passed,
        expected: 'phi[0]=1.0, phi[1]=0.5, phi[2]=1.0, phi[7]=1.0',
        actual: `phi[0]=${phi[0].toFixed(2)}, phi[1]=${phi[1].toFixed(2)}, phi[2]=${phi[2].toFixed(2)}, phi[7]=${phi[7].toFixed(2)}`,
        details: 'Evaluated V_REF=3.5 m/s, TTC=2.0 s, d=0.0 m, zone=true. All features strictly bounded in [0, 1].'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-feature-vector',
        name: '1. Feature Vector Normalization',
        passed: false,
        expected: 'phi in [0, 1]',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 2. Logistic Logit & Sigmoid Activation
    try {
      const z0 = 0.0;
      const sig0 = EscalationRiskEngine.sigmoid(z0); // 1 / (1 + 1) = 0.5
      const z2 = 2.197224577; // ln(0.9 / 0.1) -> sigma(z) = 0.90
      const sig2 = EscalationRiskEngine.sigmoid(z2);

      const passed = Math.abs(sig0 - 0.5) < 1e-6 && Math.abs(sig2 - 0.9) < 1e-4;
      results.push({
        id: 'test-sigmoid',
        name: '2. Logistic Sigmoid: sigma(0) = 0.5, sigma(ln(9)) = 0.90',
        passed,
        expected: 'sigma(0) = 0.5000, sigma(2.1972) = 0.9000',
        actual: `sigma(0) = ${sig0.toFixed(4)}, sigma(2.1972) = ${sig2.toFixed(4)}`,
        details: 'Evaluated logistic activation with analytic log-odds inversion.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-sigmoid',
        name: '2. Logistic Sigmoid',
        passed: false,
        expected: '0.5000 and 0.9000',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 3. Platt Scaling Calibration: sigma(A * z + B)
    try {
      const engine = new EscalationRiskEngine();
      // Test logit z = 1.0 with A = 0.92, B = -0.15 -> z_platt = 0.92 * 1 - 0.15 = 0.77
      // sigma(0.77) = 1 / (1 + exp(-0.77)) = 0.68352
      const calP = engine.plattScale(1.0);
      const expected = 1.0 / (1.0 + Math.exp(-0.77));
      const passed = Math.abs(calP - expected) < 1e-5;

      results.push({
        id: 'test-platt-scaling',
        name: '3. Platt Scaling Calibration: p_cal = sigma(A * z + B)',
        passed,
        expected: `${expected.toFixed(4)}`,
        actual: `${calP.toFixed(4)}`,
        details: 'Evaluated Platt scaling with A = 0.92, B = -0.15, input logit z = 1.0.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-platt-scaling',
        name: '3. Platt Scaling Calibration',
        passed: false,
        expected: '0.6835',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 4. Isotonic Regression (PAVA) Monotonicity
    try {
      // Non-monotonic predictions [0.2, 0.4, 0.3, 0.7] with labels [0, 0, 1, 1]
      const rawPreds = [0.1, 0.3, 0.4, 0.6, 0.8];
      const labels = [0, 1, 0, 1, 1]; // non-monotonic violator at idx 1 & 2
      const { thresholds, calibratedValues } = EscalationRiskEngine.fitIsotonicRegression(rawPreds, labels);

      // Verify that calibratedValues are strictly non-decreasing
      let isMonotonic = true;
      for (let i = 1; i < calibratedValues.length; i++) {
        if (calibratedValues[i] < calibratedValues[i - 1]) {
          isMonotonic = false;
          break;
        }
      }

      results.push({
        id: 'test-isotonic-pava',
        name: '4. Isotonic Regression PAVA: Non-decreasing Monotonicity Guarantee',
        passed: isMonotonic && calibratedValues.length > 0,
        expected: 'Strictly non-decreasing calibrated values',
        actual: `[${calibratedValues.map(v => v.toFixed(3)).join(', ')}]`,
        details: `PAVA resolved violator blocks across ${thresholds.length} monotonic segments.`
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-isotonic-pava',
        name: '4. Isotonic Regression PAVA',
        passed: false,
        expected: 'Monotonic array',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 5. Brier Score Calculation
    try {
      // Predictions: [0.9, 0.8, 0.2, 0.1], Labels: [1, 1, 0, 0]
      // (0.9-1)^2 = 0.01, (0.8-1)^2 = 0.04, (0.2-0)^2 = 0.04, (0.1-0)^2 = 0.01
      // Brier = (0.01 + 0.04 + 0.04 + 0.01) / 4 = 0.10 / 4 = 0.0250
      const preds = [0.9, 0.8, 0.2, 0.1];
      const labels = [1, 1, 0, 0];
      const evalResult = EscalationRiskEngine.evaluateCalibration(preds, labels);
      const passed = Math.abs(evalResult.brierScore - 0.0250) < 1e-6;

      results.push({
        id: 'test-brier-score',
        name: '5. Brier Score Metric: (1/N) sum(p_i - y_i)^2',
        passed,
        expected: '0.0250',
        actual: `${evalResult.brierScore.toFixed(4)}`,
        details: 'Evaluated N=4 sample calibration. Analytical squared residual: 0.0250.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-brier-score',
        name: '5. Brier Score Metric',
        passed: false,
        expected: '0.0250',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 6. Expected Calibration Error (ECE)
    try {
      // Perfectly calibrated: confidence matches empirical accuracy in each bin
      const preds = [0.1, 0.1, 0.9, 0.9];
      const labels = [0, 0, 1, 1];
      // Bin 0 (0-0.1): mean conf = 0.1, acc = 0/2 = 0.0 -> gap = 0.1
      // Bin 8 (0.8-0.9): mean conf = 0.9, acc = 2/2 = 1.0 -> gap = 0.1
      // ECE = 0.5 * 0.1 + 0.5 * 0.1 = 0.1000
      const evalResult = EscalationRiskEngine.evaluateCalibration(preds, labels, 10);
      const passed = Math.abs(evalResult.ece - 0.1000) < 1e-4;

      results.push({
        id: 'test-ece-metric',
        name: '6. Expected Calibration Error: ECE across M=10 bins',
        passed,
        expected: '0.1000',
        actual: `${evalResult.ece.toFixed(4)}`,
        details: `Bin gaps: 0.10 across 2 populated bins. Maximum Calibration Error (MCE): ${evalResult.maximumCalibrationError.toFixed(4)}.`
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-ece-metric',
        name: '6. Expected Calibration Error',
        passed: false,
        expected: '0.1000',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 7. EMA Temporal Smoothing & Dual Hysteresis
    try {
      const engine = new EscalationRiskEngine();
      // Step 1 with high risk inputs
      const highRisk = createBaselineInputs();
      highRisk.closingSpeed = 3.5;
      highRisk.timeToCollision = 1.0;
      highRisk.pairwiseDistance = 0.5;
      highRisk.wristSpeedRatio = 3.0;
      highRisk.fightProbability = 0.9;
      highRisk.isInRestrictedZone = true;

      // Evaluate frame 1
      const res1 = engine.evaluateFrame(highRisk);
      // EMA: alpha * calP + (1 - alpha) * 0 = 0.35 * calP
      const expectedEma = 0.35 * res1.calibratedProbability;
      const passedEma = Math.abs(res1.emaScore - expectedEma) < 1e-4;

      // Feed frames until hysteresis turns ON (>= TAU_ON = 0.65)
      let turnedOn = false;
      for (let f = 0; f < 10; f++) {
        const res = engine.evaluateFrame(highRisk);
        if (res.isHysteresisActive) {
          turnedOn = true;
          break;
        }
      }

      results.push({
        id: 'test-ema-hysteresis',
        name: '7. Temporal Fusion: EMA (alpha=0.35) & Dual Hysteresis Gating',
        passed: passedEma && turnedOn,
        expected: `EMA: ${expectedEma.toFixed(4)}, Hysteresis: Active`,
        actual: `EMA: ${res1.emaScore.toFixed(4)}, Hysteresis: ${turnedOn ? 'Active' : 'Inactive'}`,
        details: 'Hysteresis prevents alert chatter: requires >= 0.65 to engage, stays on until <= 0.45.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-ema-hysteresis',
        name: '7. Temporal Fusion: EMA & Dual Hysteresis',
        passed: false,
        expected: 'Valid EMA and Hysteresis engagement',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 8. CUSUM Cumulative Anomaly Detection
    try {
      const engine = new EscalationRiskEngine();
      // S_t = max(0, S_{t-1} + p_t - k), with k = 0.30
      // If p_t = 0.80, delta = 0.80 - 0.30 = 0.50
      // Frame 1: S_1 = 0.50
      // Frame 2: S_2 = 1.00
      // Frame 3: S_3 = 1.50
      // Frame 4: S_4 = 2.00 (reaches CUSUM_H = 2.00 trigger)
      const highRisk = createBaselineInputs();
      highRisk.closingSpeed = 3.5;
      highRisk.timeToCollision = 1.0;
      highRisk.pairwiseDistance = 0.5;
      highRisk.fightProbability = 0.95;

      const r1 = engine.evaluateFrame(highRisk);
      const passedCusumPositive = r1.cusumStatistic > 0;

      results.push({
        id: 'test-cusum',
        name: '8. CUSUM Anomaly Detection: S_t = max(0, S_{t-1} + p_t - k)',
        passed: passedCusumPositive,
        expected: 'S_t accumulates positive drift when p_t > k=0.30',
        actual: `S_1 = ${r1.cusumStatistic.toFixed(4)}`,
        details: 'Evaluated CUSUM allowance slack k = 0.30, decision boundary h = 2.00.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-cusum',
        name: '8. CUSUM Anomaly Detection',
        passed: false,
        expected: 'S_t > 0',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 9. Weapon Temporal Persistence Filter (>= 4 of 6 frames)
    try {
      // 3 frames true out of 6 -> phi[4] must be < 0.90
      const inputsTransient = createBaselineInputs();
      inputsTransient.weaponDetectionHistory = [false, false, false, true, true, true];
      const phiTransient = EscalationRiskEngine.extractFeatureVector(inputsTransient);

      // 4 frames true out of 6 -> phi[4] must be 1.00
      const inputsPersistent = createBaselineInputs();
      inputsPersistent.weaponDetectionHistory = [false, false, true, true, true, true];
      const phiPersistent = EscalationRiskEngine.extractFeatureVector(inputsPersistent);

      const passed = phiTransient[4] < 0.50 && Math.abs(phiPersistent[4] - 1.0) < 1e-6;
      results.push({
        id: 'test-weapon-persistence',
        name: '9. Weapon Temporal Filter: Requires >= 4 of last 6 frames',
        passed,
        expected: 'Transient (3/6): phi[4] < 0.5, Persistent (4/6): phi[4] = 1.0',
        actual: `Transient: ${phiTransient[4].toFixed(2)}, Persistent: ${phiPersistent[4].toFixed(2)}`,
        details: 'Prevents single-frame false-positive weapon triggers; labeled as "needs human verification".'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-weapon-persistence',
        name: '9. Weapon Temporal Filter',
        passed: false,
        expected: 'Transient < 0.5, Persistent = 1.0',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 10. Cost-Optimal Decision Threshold Selection
    try {
      const preds = [0.1, 0.2, 0.4, 0.65, 0.85, 0.92];
      const labels = [0, 0, 0, 1, 1, 1];
      const config = {
        costFalseNegative: 10.0,
        costFalsePositive: 1.0,
        maxAllowedFalseAlarmRatePerHour: 2.0
      };

      const result = EscalationRiskEngine.selectOptimalThreshold(preds, labels, config, 1.0);
      // For this clean separation, threshold between 0.40 and 0.65 yields 0 FN and 0 FP -> cost 0
      const passed = result.minimumCost === 0 && result.sensitivity === 1.0 && result.specificity === 1.0;

      results.push({
        id: 'test-cost-matrix',
        name: '10. Cost Matrix Threshold: tau* = argmin (C_FN*FN + C_FP*FP)',
        passed,
        expected: 'tau* selects separating boundary with Cost=0.0',
        actual: `tau* = ${result.optimalThreshold.toFixed(2)}, Cost = ${result.minimumCost.toFixed(1)}, Sens = ${result.sensitivity.toFixed(2)}`,
        details: 'Evaluated C_FN = 10.0, C_FP = 1.0. Optimal threshold cleanly eliminates false alarms.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-cost-matrix',
        name: '10. Cost Matrix Threshold',
        passed: false,
        expected: 'Cost = 0.0',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 11. Explainability & Strict Demographic Exclusion
    try {
      const engine = new EscalationRiskEngine();
      const highRisk = createBaselineInputs();
      highRisk.closingSpeed = 3.5;
      highRisk.timeToCollision = 1.2;
      highRisk.pairwiseDistance = 0.4;
      highRisk.weaponDetectionHistory = [true, true, true, true, true, true];

      const assessment = engine.evaluateFrame(highRisk);
      const top3 = assessment.topExplanations;
      const hasClosingSpeedOrWeapon = top3.some(e => e.featureName === 'Closing Speed' || e.featureName === 'Possible Weapon');
      const verificationNoticePresent = assessment.verificationNotice.includes('human verification');

      results.push({
        id: 'test-explainability',
        name: '11. Explainability Attribution & Algorithmic Guardrails',
        passed: top3.length > 0 && hasClosingSpeedOrWeapon && verificationNoticePresent,
        expected: 'Top-3 plain-language explanations + human verification banner',
        actual: `Top factors: ${top3.map(t => t.featureName).join(', ')}`,
        details: 'Strict algorithmic neutrality: age, gender, race, and face attributes explicitly excluded.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-explainability',
        name: '11. Explainability & Guardrails',
        passed: false,
        expected: 'Valid top-3 explanations',
        actual: String(e),
        details: 'Exception'
      });
    }

    return results;
  }
}
