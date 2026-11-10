/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Phase D: Escalation-Risk Engine & Calibrated Decision Pipeline
 * 
 * Strict Guardrails:
 *   - Demographics (age band, gender, face, race) are EXPLICITLY EXCLUDED from
 *     the feature space to guarantee algorithmic neutrality.
 *   - Any weapon / dangerous object detection is framed strictly as:
 *     "possible weapon: needs human verification", never as an automated confirmed fact.
 * 
 * Mathematical Core:
 *   1. Feature Vector phi in [0, 1]^10:
 *      phi_1  = min(1, v_c / v_ref) (closing speed ratio, v_ref = 3.5 m/s)
 *      phi_2  = min(1, 1 / max(0.1, TTC)) (reciprocal time-to-collision)
 *      phi_3  = exp(-d / d_0) (ground proximity, d_0 = 2.0 m)
 *      phi_4  = min(1, wrist_speed_ratio / 4.0) (rapid arm/hand movement)
 *      phi_5  = weapon_in_hand (temporal-filtered confidence in [0, 1])
 *      phi_6  = P_fight (temporal pose sequence classifier output in [0, 1])
 *      phi_7  = min(1, ME / ME_thresh) (motion energy in interaction zone, ME_thresh = 12.0)
 *      phi_8  = zone_breach (1 if restricted zone entered, 0 otherwise)
 *      phi_9  = min(1, rho / rho_crit) (crowd density ratio, rho_crit = 2.0 persons/m^2)
 *      phi_10 = is_night (ambient darkness flag in [0, 1])
 * 
 *   2. Logistic Regression:
 *      z = w^T phi + b, p = sigma(z) = 1 / (1 + exp(-z))
 * 
 *   3. Calibration:
 *      - Platt Scaling: p_cal = sigma(A * z + B)
 *      - Isotonic Regression (PAVA: Pool Adjacent Violators Algorithm)
 *      - Brier Score: (1/N) * sum((p_i - y_i)^2)
 *      - Expected Calibration Error (ECE): sum_m (|B_m|/N) * |acc(B_m) - conf(B_m)|
 * 
 *   4. Temporal Fusion & Hysteresis:
 *      - EMA: s_t = alpha * p_t + (1 - alpha) * s_{t-1}
 *      - Dual Hysteresis: tau_on > tau_off to prevent alert chatter
 *      - CUSUM: S_t = max(0, S_{t-1} + p_t - k), alarm when S_t > h
 *      - Bayesian Log-Odds: l_t = lambda * l_{t-1} + ln(LR_t)
 * 
 *   5. Cost-Optimal Decision Matrix:
 *      tau* = argmin (C_FN * FN(tau) + C_FP * FP(tau)) subject to false-alarm rate budget.
 * 
 *   6. Explainability:
 *      Top-3 contributing terms (w_k * phi_k) with plain-language diagnostic descriptions.
 */

export interface RawRiskInputs {
  /** Closing speed in m/s (from Kalman tracker) */
  closingSpeed: number;
  /** Time-to-collision in seconds (infinity if diverging) */
  timeToCollision: number;
  /** Pairwise distance in metres */
  pairwiseDistance: number;
  /** Wrist speed normalized by torso length (from Pose engine) */
  wristSpeedRatio: number;
  /** History of recent weapon class detections in the last 6 frames (boolean or confidence) */
  weaponDetectionHistory: boolean[];
  /** Temporal fight sequence classifier probability [0, 1] */
  fightProbability: number;
  /** Spatial motion energy in the interaction zone */
  motionEnergy: number;
  /** Whether the subject is currently inside a restricted virtual perimeter */
  isInRestrictedZone: boolean;
  /** Crowd density in the immediate ground zone (persons / m^2) */
  crowdDensity: number;
  /** Whether ambient conditions are night / low-light */
  isNight: boolean;
}

export type RiskLevel = 'Low' | 'Watch' | 'Alert' | 'Urgent';

export interface RiskExplanationItem {
  featureIndex: number;
  featureName: string;
  weight: number;
  featureValue: number;
  contribution: number;
  humanDescription: string;
}

export interface RiskAssessmentResult {
  /** 10-dimensional normalized feature vector in [0, 1] */
  featureVector: number[];
  /** Raw logit z = w^T phi + b */
  rawLogit: number;
  /** Uncalibrated sigmoid probability sigma(z) */
  rawProbability: number;
  /** Platt calibrated probability */
  calibratedProbability: number;
  /** Filtered EMA score s_t */
  emaScore: number;
  /** CUSUM cumulative anomaly statistic S_t */
  cusumStatistic: number;
  /** Bayesian log-odds l_t */
  bayesianLogOdds: number;
  /** Discrete alert level with hysteresis and persistence */
  alertLevel: RiskLevel;
  /** True if hysteresis trigger is active */
  isHysteresisActive: boolean;
  /** Verified weapon presence flag (persists >= 4 of last 6 frames) */
  hasPossibleWeaponFlag: boolean;
  /** Top 3 explanatory factors for human operator verification */
  topExplanations: RiskExplanationItem[];
  /** Informational tag stating requirement for human verification */
  verificationNotice: string;
}

export interface CalibrationBin {
  binIndex: number;
  rangeMin: number;
  rangeMax: number;
  count: number;
  meanConfidence: number;
  accuracy: number;
  absoluteGap: number;
}

export interface CalibrationEvaluation {
  brierScore: number;
  ece: number; // Expected Calibration Error [0, 1]
  maximumCalibrationError: number; // MCE [0, 1]
  bins: CalibrationBin[];
}

export interface CostMatrixConfig {
  costFalseNegative: number; // e.g. 10.0 (high cost of missing escalation)
  costFalsePositive: number; // e.g. 1.0 (cost of nuisance alarm)
  maxAllowedFalseAlarmRatePerHour: number; // Budget constraint
}

export class EscalationRiskEngine {
  // Reference normalizers
  public static readonly V_REF: number = 3.5; // m/s (sprinting threshold)
  public static readonly D_0: number = 2.0; // metres (personal space threshold)
  public static readonly ME_THRESH: number = 12.0; // motion energy normalizer
  public static readonly RHO_CRIT: number = 2.0; // 2 persons/m^2 dense crowd

  // Logistic regression model weights w and bias b
  // Features: [closingSpeed, invTTC, proximity, wristSpeed, weaponInHand, fightProb, motionEnergy, zoneBreach, crowdDensity, isNight]
  // Strictly no demographic or identity features.
  public static readonly DEFAULT_WEIGHTS: number[] = [
    1.85, // phi_0: Closing speed
    2.20, // phi_1: 1 / TTC
    1.50, // phi_2: Proximity exp(-d/d0)
    1.40, // phi_3: Rapid wrist motion relative to torso
    3.20, // phi_4: Possible handheld weapon (strictly verified persistence)
    2.80, // phi_5: Temporal pose fight classifier
    1.25, // phi_6: Spatial motion energy
    2.10, // phi_7: Restricted zone breach
    0.95, // phi_8: Crowd density
    0.45  // phi_9: Ambient darkness / night
  ];
  public static readonly DEFAULT_BIAS: number = -3.60;

  // Platt scaling calibration parameters (sigma(A * z + B))
  public static readonly DEFAULT_PLATT_A: number = 0.92;
  public static readonly DEFAULT_PLATT_B: number = -0.15;

  // Filter & Hysteresis parameters
  public static readonly EMA_ALPHA: number = 0.35; // Smoothing factor
  public static readonly CUSUM_K: number = 0.30; // Allowance slack
  public static readonly CUSUM_H: number = 2.00; // Decision threshold
  public static readonly BAYESIAN_LAMBDA: number = 0.90; // Forgetting factor

  // Dual hysteresis thresholds
  public static readonly TAU_ON: number = 0.65;
  public static readonly TAU_OFF: number = 0.45;

  // State persistence requirement
  public static readonly PERSISTENCE_FRAMES_REQUIRED: number = 5;

  // Internal temporal tracker states
  private weights: number[];
  private bias: number;
  private plattA: number;
  private plattB: number;
  private emaScore: number = 0.0;
  private cusumStatistic: number = 0.0;
  private bayesianLogOdds: number = 0.0;
  private hysteresisActive: boolean = false;
  private currentAlertLevel: RiskLevel = 'Low';
  private framesInCurrentLevel: number = 0;
  private candidateLevel: RiskLevel = 'Low';
  private candidateLevelFrames: number = 0;

  constructor(
    weights?: number[],
    bias?: number,
    plattA?: number,
    plattB?: number
  ) {
    this.weights = weights ? [...weights] : [...EscalationRiskEngine.DEFAULT_WEIGHTS];
    this.bias = bias ?? EscalationRiskEngine.DEFAULT_BIAS;
    this.plattA = plattA ?? EscalationRiskEngine.DEFAULT_PLATT_A;
    this.plattB = plattB ?? EscalationRiskEngine.DEFAULT_PLATT_B;
  }

  /**
   * Resets all temporal states (EMA, CUSUM, hysteresis, persistence counters).
   */
  public resetState(): void {
    this.emaScore = 0.0;
    this.cusumStatistic = 0.0;
    this.bayesianLogOdds = 0.0;
    this.hysteresisActive = false;
    this.currentAlertLevel = 'Low';
    this.framesInCurrentLevel = 0;
    this.candidateLevel = 'Low';
    this.candidateLevelFrames = 0;
  }

  /**
   * Transforms raw telemetry into the strict 10-dimensional normalized feature vector phi in [0, 1]^10.
   * Explicitly avoids any age, gender, race or face attributes.
   */
  public static extractFeatureVector(inputs: RawRiskInputs): number[] {
    // phi_0: Closing speed ratio (bounded in [0, 1])
    const phi0 = Math.max(0, Math.min(1.0, inputs.closingSpeed / EscalationRiskEngine.V_REF));

    // phi_1: Reciprocal TTC (bounded in [0, 1])
    // If objects are diverging (TTC <= 0 or infinity), reciprocal is 0.
    let phi1 = 0.0;
    if (inputs.timeToCollision > 0 && isFinite(inputs.timeToCollision)) {
      phi1 = Math.max(0, Math.min(1.0, 1.0 / Math.max(0.1, inputs.timeToCollision)));
    }

    // phi_2: Ground proximity exp(-d / d0) in (0, 1]
    const clampedDist = Math.max(0, inputs.pairwiseDistance);
    const phi2 = Math.exp(-clampedDist / EscalationRiskEngine.D_0);

    // phi_3: Rapid wrist speed ratio relative to torso
    const phi3 = Math.max(0, Math.min(1.0, inputs.wristSpeedRatio / 4.0));

    // phi_4: Weapon presence requires persistence >= 4 of the last 6 frames
    const recentFrames = inputs.weaponDetectionHistory.slice(-6);
    const trueCount = recentFrames.filter(Boolean).length;
    // Normalized persistence confidence
    const phi4 = recentFrames.length >= 4 && trueCount >= 4 ? 1.0 : (trueCount / 6.0) * 0.4;

    // phi_5: Temporal pose fight classifier
    const phi5 = Math.max(0, Math.min(1.0, inputs.fightProbability));

    // phi_6: Motion energy ratio
    const phi6 = Math.max(0, Math.min(1.0, inputs.motionEnergy / EscalationRiskEngine.ME_THRESH));

    // phi_7: Zone breach flag
    const phi7 = inputs.isInRestrictedZone ? 1.0 : 0.0;

    // phi_8: Crowd density ratio
    const phi8 = Math.max(0, Math.min(1.0, inputs.crowdDensity / EscalationRiskEngine.RHO_CRIT));

    // phi_9: Night / low-light flag
    const phi9 = inputs.isNight ? 1.0 : 0.0;

    return [phi0, phi1, phi2, phi3, phi4, phi5, phi6, phi7, phi8, phi9];
  }

  /**
   * Sigmoid activation: sigma(z) = 1 / (1 + exp(-z)).
   * Numerically clamped to avoid overflow.
   */
  public static sigmoid(z: number): number {
    if (z > 35.0) return 1.0;
    if (z < -35.0) return 0.0;
    return 1.0 / (1.0 + Math.exp(-z));
  }

  /**
   * Evaluates logistic regression logit: z = sum(w_i * phi_i) + b.
   */
  public computeLogit(phi: number[]): number {
    let z = this.bias;
    for (let i = 0; i < phi.length; i++) {
      z += this.weights[i] * phi[i];
    }
    return z;
  }

  /**
   * Applies Platt Scaling: p_cal = sigma(A * z + B).
   */
  public plattScale(z: number): number {
    return EscalationRiskEngine.sigmoid(this.plattA * z + this.plattB);
  }

  /**
   * Pool Adjacent Violators Algorithm (PAVA) for isotonic regression calibration.
   * Guarantees monotonic non-decreasing calibrated probabilities.
   * 
   * @param predictions Array of raw model probabilities
   * @param groundTruth Binary labels (0 or 1)
   */
  public static fitIsotonicRegression(
    predictions: number[],
    groundTruth: number[]
  ): { thresholds: number[]; calibratedValues: number[] } {
    const n = predictions.length;
    if (n === 0) return { thresholds: [], calibratedValues: [] };

    // Sort pairs by prediction ascending
    const pairs = predictions.map((pred, idx) => ({ pred, label: groundTruth[idx] }));
    pairs.sort((a, b) => a.pred - b.pred);

    // Block structure for PAVA
    interface Block {
      weight: number;
      sumLabels: number;
      value: number;
      minPred: number;
      maxPred: number;
    }

    const blocks: Block[] = pairs.map(p => ({
      weight: 1,
      sumLabels: p.label,
      value: p.label,
      minPred: p.pred,
      maxPred: p.pred
    }));

    // Pool adjacent violators until monotonic
    let i = 0;
    while (i < blocks.length - 1) {
      if (blocks[i].value > blocks[i + 1].value) {
        // Violator found: merge block i and i+1
        const b1 = blocks[i];
        const b2 = blocks[i + 1];
        const mergedWeight = b1.weight + b2.weight;
        const mergedSum = b1.sumLabels + b2.sumLabels;
        const mergedValue = mergedSum / mergedWeight;

        blocks[i] = {
          weight: mergedWeight,
          sumLabels: mergedSum,
          value: mergedValue,
          minPred: b1.minPred,
          maxPred: b2.maxPred
        };
        blocks.splice(i + 1, 1);

        // Step back to recheck monotonicity with previous block
        if (i > 0) i--;
      } else {
        i++;
      }
    }

    const thresholds = blocks.map(b => b.maxPred);
    const calibratedValues = blocks.map(b => b.value);

    return { thresholds, calibratedValues };
  }

  /**
   * Evaluates calibration metrics: Brier score, Expected Calibration Error (ECE), and MCE.
   * 
   * ECE = sum_{m=1}^M (|B_m| / N) * |acc(B_m) - conf(B_m)|
   * Brier = (1/N) * sum((p_i - y_i)^2)
   */
  public static evaluateCalibration(
    probabilities: number[],
    labels: number[],
    numBins: number = 10
  ): CalibrationEvaluation {
    const N = probabilities.length;
    if (N === 0) {
      return { brierScore: 0, ece: 0, maximumCalibrationError: 0, bins: [] };
    }

    let brierSum = 0;
    for (let i = 0; i < N; i++) {
      const diff = probabilities[i] - labels[i];
      brierSum += diff * diff;
    }
    const brierScore = brierSum / N;

    // Binning for ECE
    const binCounts = new Array(numBins).fill(0);
    const binConfSums = new Array(numBins).fill(0);
    const binLabelSums = new Array(numBins).fill(0);

    for (let i = 0; i < N; i++) {
      const p = Math.max(0, Math.min(1.0, probabilities[i]));
      let binIdx = Math.floor(p * numBins);
      if (binIdx >= numBins) binIdx = numBins - 1;

      binCounts[binIdx]++;
      binConfSums[binIdx] += p;
      binLabelSums[binIdx] += labels[i];
    }

    let ece = 0;
    let mce = 0;
    const bins: CalibrationBin[] = [];

    for (let m = 0; m < numBins; m++) {
      const count = binCounts[m];
      const rangeMin = m / numBins;
      const rangeMax = (m + 1) / numBins;

      if (count > 0) {
        const meanConf = binConfSums[m] / count;
        const accuracy = binLabelSums[m] / count;
        const gap = Math.abs(accuracy - meanConf);

        ece += (count / N) * gap;
        if (gap > mce) mce = gap;

        bins.push({
          binIndex: m,
          rangeMin,
          rangeMax,
          count,
          meanConfidence: meanConf,
          accuracy,
          absoluteGap: gap
        });
      } else {
        bins.push({
          binIndex: m,
          rangeMin,
          rangeMax,
          count: 0,
          meanConfidence: (rangeMin + rangeMax) / 2,
          accuracy: (rangeMin + rangeMax) / 2,
          absoluteGap: 0
        });
      }
    }

    return {
      brierScore,
      ece,
      maximumCalibrationError: mce,
      bins
    };
  }

  /**
   * Cost-optimal threshold selection:
   * tau* = argmin_tau (C_FN * FN(tau) + C_FP * FP(tau))
   * subject to empirical false alarm rate <= maxAllowedFalseAlarmRatePerHour.
   */
  public static selectOptimalThreshold(
    probabilities: number[],
    labels: number[],
    config: CostMatrixConfig,
    observationDurationHours: number
  ): {
    optimalThreshold: number;
    minimumCost: number;
    expectedFalseAlarmsPerHour: number;
    sensitivity: number;
    specificity: number;
  } {
    const N = probabilities.length;
    let bestThreshold = 0.5;
    let minCost = Infinity;
    let bestFA = 0;
    let bestSens = 0;
    let bestSpec = 0;

    // Test candidate thresholds from 0.05 to 0.95
    for (let t = 0.05; t <= 0.95; t += 0.02) {
      let tp = 0;
      let fp = 0;
      let fn = 0;
      let tn = 0;

      for (let i = 0; i < N; i++) {
        const predPositive = probabilities[i] >= t;
        const actualPositive = labels[i] === 1;

        if (predPositive && actualPositive) tp++;
        else if (predPositive && !actualPositive) fp++;
        else if (!predPositive && actualPositive) fn++;
        else tn++;
      }

      const totalCost = config.costFalseNegative * fn + config.costFalsePositive * fp;
      const faPerHour = observationDurationHours > 0 ? fp / observationDurationHours : fp;

      if (faPerHour <= config.maxAllowedFalseAlarmRatePerHour && totalCost < minCost) {
        minCost = totalCost;
        bestThreshold = t;
        bestFA = faPerHour;
        bestSens = tp + fn > 0 ? tp / (tp + fn) : 1.0;
        bestSpec = tn + fp > 0 ? tn / (tn + fp) : 1.0;
      }
    }

    return {
      optimalThreshold: bestThreshold,
      minimumCost: minCost,
      expectedFalseAlarmsPerHour: bestFA,
      sensitivity: bestSens,
      specificity: bestSpec
    };
  }

  /**
   * Generates plain-language descriptions for top contributing features.
   */
  private static getFeatureDescription(index: number, value: number, weight: number): string {
    switch (index) {
      case 0:
        return `High approach speed (${(value * EscalationRiskEngine.V_REF).toFixed(1)} m/s)`;
      case 1:
        return value > 0.1
          ? `Imminent convergence (TTC ${(1 / value).toFixed(1)} s)`
          : 'Rapid collision trajectory';
      case 2:
        return `Close proximity interaction zone (< ${(EscalationRiskEngine.D_0 * -Math.log(Math.max(1e-4, value))).toFixed(1)} m)`;
      case 3:
        return `Abrupt hand/wrist acceleration (${(value * 4.0).toFixed(1)}x torso norm)`;
      case 4:
        return 'Possible handheld weapon detected: needs human verification';
      case 5:
        return `Aggressive posture / motion sequence (${Math.round(value * 100)}% match)`;
      case 6:
        return `Elevated kinetic motion energy (${(value * EscalationRiskEngine.ME_THRESH).toFixed(1)} units)`;
      case 7:
        return 'Virtual security zone boundary breach';
      case 8:
        return `High local ground crowd density (${(value * EscalationRiskEngine.RHO_CRIT).toFixed(1)} p/m²)`;
      case 9:
        return 'Low-light / night ambient condition modifier';
      default:
        return `Feature factor ${index}`;
    }
  }

  /**
   * Evaluates the full step for one frame:
   *   1. Normalizes feature inputs
   *   2. Computes uncalibrated logit z & sigmoid probability
   *   3. Applies Platt scaling
   *   4. Updates EMA filter s_t
   *   5. Updates CUSUM statistic S_t
   *   6. Updates Bayesian log-odds l_t
   *   7. Applies dual hysteresis (tau_on / tau_off) and M-frame state persistence
   *   8. Extracts top-3 explanatory terms w_k * phi_k
   */
  public evaluateFrame(inputs: RawRiskInputs): RiskAssessmentResult {
    // 1. Extract feature vector phi in [0, 1]^10
    const phi = EscalationRiskEngine.extractFeatureVector(inputs);

    // 2. Uncalibrated logit and probability
    const z = this.computeLogit(phi);
    const rawP = EscalationRiskEngine.sigmoid(z);

    // 3. Platt scaling
    const calP = this.plattScale(z);

    // 4. Temporal EMA smoothing: s_t = alpha * calP + (1 - alpha) * s_{t-1}
    this.emaScore = EscalationRiskEngine.EMA_ALPHA * calP + (1.0 - EscalationRiskEngine.EMA_ALPHA) * this.emaScore;

    // 5. CUSUM: S_t = max(0, S_{t-1} + calP - k)
    this.cusumStatistic = Math.max(0, this.cusumStatistic + calP - EscalationRiskEngine.CUSUM_K);

    // 6. Bayesian log-odds update: l_t = lambda * l_{t-1} + ln(LR_t)
    // Likelihood ratio: LR = P(E|Escalation) / P(E|Normal) ~ calP / (1 - calP) clamped
    const safeCalP = Math.max(0.01, Math.min(0.99, calP));
    const logLR = Math.log(safeCalP / (1.0 - safeCalP));
    this.bayesianLogOdds = EscalationRiskEngine.BAYESIAN_LAMBDA * this.bayesianLogOdds + logLR;

    // 7. Dual Hysteresis
    if (!this.hysteresisActive && this.emaScore >= EscalationRiskEngine.TAU_ON) {
      this.hysteresisActive = true;
    } else if (this.hysteresisActive && this.emaScore <= EscalationRiskEngine.TAU_OFF) {
      this.hysteresisActive = false;
    }

    // Determine instantaneous raw level
    let rawLevel: RiskLevel;
    if (this.emaScore >= 0.85 || this.cusumStatistic >= EscalationRiskEngine.CUSUM_H) {
      rawLevel = 'Urgent';
    } else if (this.emaScore >= 0.60 || this.hysteresisActive) {
      rawLevel = 'Alert';
    } else if (this.emaScore >= 0.30) {
      rawLevel = 'Watch';
    } else {
      rawLevel = 'Low';
    }

    // Strict persistence gating: level changes require M consecutive frames
    if (rawLevel === this.candidateLevel) {
      this.candidateLevelFrames++;
      if (this.candidateLevelFrames >= EscalationRiskEngine.PERSISTENCE_FRAMES_REQUIRED) {
        this.currentAlertLevel = rawLevel;
      }
    } else {
      this.candidateLevel = rawLevel;
      this.candidateLevelFrames = 1;
    }

    // Check weapon presence persistence (phi[4] >= 0.90 indicates >= 4 of last 6 frames)
    const hasPossibleWeaponFlag = phi[4] >= 0.90;

    // 8. Explainability: Top-3 contributing terms (w_k * phi_k)
    const featureNames = [
      'Closing Speed',
      'Inverse TTC',
      'Proximity',
      'Wrist Acceleration',
      'Possible Weapon',
      'Fight Posture',
      'Kinetic Energy',
      'Zone Breach',
      'Crowd Density',
      'Ambient Darkness'
    ];

    const contributions: RiskExplanationItem[] = phi.map((val, idx) => ({
      featureIndex: idx,
      featureName: featureNames[idx],
      weight: this.weights[idx],
      featureValue: val,
      contribution: this.weights[idx] * val,
      humanDescription: EscalationRiskEngine.getFeatureDescription(idx, val, this.weights[idx])
    }));

    // Sort descending by positive contribution
    contributions.sort((a, b) => b.contribution - a.contribution);
    const topExplanations = contributions.slice(0, 3).filter(c => c.contribution > 0.1);

    return {
      featureVector: phi,
      rawLogit: z,
      rawProbability: rawP,
      calibratedProbability: calP,
      emaScore: this.emaScore,
      cusumStatistic: this.cusumStatistic,
      bayesianLogOdds: this.bayesianLogOdds,
      alertLevel: this.currentAlertLevel,
      isHysteresisActive: this.hysteresisActive,
      hasPossibleWeaponFlag,
      topExplanations,
      verificationNotice: 'Automated advisory only: requires trained human verification.'
    };
  }
}
