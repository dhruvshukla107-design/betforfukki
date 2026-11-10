/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Phase C Pose & Behaviour Unit Test Suite
 * Self-verifying test suite with known numeric worked examples for:
 *   1. Torso Length Normalization L_t
 *   2. Joint Angle theta = acos( (u . v) / (||u|| ||v||) ) (90 deg & 180 deg)
 *   3. Wrist Speed Ratio ||dw/dt|| / L_t
 *   4. Arm Extension Ratio ||p_wrist - p_shoulder|| / L_t
 *   5. Raised-Arm Detection (Image space geometry)
 *   6. Fall Cue Condition (Aspect ratio w/h > 1.0 & torso lean)
 *   7. Weapon-in-Hand Proximity (||c_weapon - wrist|| / L_t < 0.5)
 *   8. Ground Crowd Density (persons/m^2) and Motion Energy ME
 */

import { PoseFeatureEngine } from './poseEngine';
import { Keypoint, PoseSkeleton } from './poseTypes';
import { TestResultItem } from '../calibration/phaseATests';

export class PhaseCTestRunner {
  public static runAllTests(): TestResultItem[] {
    const results: TestResultItem[] = [];

    // Helper to generate empty skeleton
    const createSkeleton = (): PoseSkeleton =>
      Array.from({ length: 17 }, () => ({ x: 0, y: 0, score: 0.9 }));

    // 1. Torso Length Normalization L_t
    try {
      const skel = createSkeleton();
      // Shoulders at (90, 100) and (110, 100) -> midpoint = (100, 100)
      skel[5] = { x: 90, y: 100, score: 0.95 };
      skel[6] = { x: 110, y: 100, score: 0.95 };
      // Hips at (95, 180) and (105, 180) -> midpoint = (100, 180)
      skel[11] = { x: 95, y: 180, score: 0.95 };
      skel[12] = { x: 105, y: 180, score: 0.95 };

      // Lt = sqrt((100-100)^2 + (180-100)^2) = 80.0 px
      const Lt = PoseFeatureEngine.computeTorsoLength(skel);
      const passed = Math.abs(Lt - 80.0) < 1e-5;

      results.push({
        id: 'test-torso-length',
        name: '1. Torso Length Normalization: L_t = ||p_midShoulder - p_midHip||',
        passed,
        expected: '80.0000 px',
        actual: `${Lt.toFixed(4)} px`,
        details: 'Evaluated mid-shoulder (100, 100) to mid-hip (100, 180). Exact Euclidean distance: 80.0 px.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-torso-length',
        name: '1. Torso Length Normalization',
        passed: false,
        expected: '80.0000 px',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 2. Joint Angle theta = acos( (u . v) / (||u|| ||v||) ) (90 deg & 180 deg)
    try {
      // Orthogonal angle (90 deg): A = (10, 0), B = (0, 0), C = (0, 10)
      const ptA: Keypoint = { x: 10, y: 0, score: 0.9 };
      const ptB: Keypoint = { x: 0, y: 0, score: 0.9 };
      const ptC: Keypoint = { x: 0, y: 10, score: 0.9 };
      const angle90 = PoseFeatureEngine.computeJointAngleDeg(ptA, ptB, ptC);

      // Straight angle (180 deg): D = (-10, 0), B = (0, 0), A = (10, 0)
      const ptD: Keypoint = { x: -10, y: 0, score: 0.9 };
      const angle180 = PoseFeatureEngine.computeJointAngleDeg(ptD, ptB, ptA);

      const passed = Math.abs(angle90 - 90.0) < 1e-4 && Math.abs(angle180 - 180.0) < 1e-4;

      results.push({
        id: 'test-joint-angle',
        name: '2. Joint Angle: theta = acos( (u.v) / (||u|| ||v||) )',
        passed,
        expected: 'theta_ortho = 90.0000°, theta_straight = 180.0000°',
        actual: `theta_ortho = ${angle90.toFixed(4)}°, theta_straight = ${angle180.toFixed(4)}°`,
        details: 'Tested dot product cos-inversion on orthogonal and collinear keypoint segments.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-joint-angle',
        name: '2. Joint Angle',
        passed: false,
        expected: '90° and 180°',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 3. Wrist Speed Ratio ||dw/dt|| / L_t
    try {
      // Frame 1: skel with Lt = 80, wrist at (100, 100), t = 1.0s
      const skel1 = createSkeleton();
      skel1[5] = { x: 90, y: 100, score: 0.95 }; skel1[6] = { x: 110, y: 100, score: 0.95 };
      skel1[11] = { x: 95, y: 180, score: 0.95 }; skel1[12] = { x: 105, y: 180, score: 0.95 };
      skel1[9] = { x: 100, y: 100, score: 0.95 }; // left wrist
      skel1[10] = { x: 100, y: 100, score: 0.95 };
      PoseFeatureEngine.extractFeatures(201, skel1, [80, 80, 50, 120], 1.0);

      // Frame 2: dt = 0.05s, wrist moves to (106, 108) -> displacement = sqrt(6^2 + 8^2) = 10 px
      // Speed = 10 / 0.05 = 200 px/s
      // Ratio = 200 / 80 = 2.50 s^-1
      const skel2 = createSkeleton();
      skel2[5] = { x: 90, y: 100, score: 0.95 }; skel2[6] = { x: 110, y: 100, score: 0.95 };
      skel2[11] = { x: 95, y: 180, score: 0.95 }; skel2[12] = { x: 105, y: 180, score: 0.95 };
      skel2[9] = { x: 106, y: 108, score: 0.95 };
      skel2[10] = { x: 100, y: 100, score: 0.95 };
      const feats = PoseFeatureEngine.extractFeatures(201, skel2, [80, 80, 50, 120], 1.05);

      const expectedRatio = 2.50;
      const passed = Math.abs(feats.leftWristSpeedRatio - expectedRatio) < 1e-4;

      results.push({
        id: 'test-wrist-speed',
        name: '3. Wrist Speed Ratio: ||dw/dt|| / L_t',
        passed,
        expected: '2.5000 s^-1',
        actual: `${feats.leftWristSpeedRatio.toFixed(4)} s^-1`,
        details: 'Displacement 10 px over dt = 0.05s with Lt = 80 px gives exact ratio 2.50 s^-1.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-wrist-speed',
        name: '3. Wrist Speed Ratio',
        passed: false,
        expected: '2.5000 s^-1',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 4. Arm Extension Ratio ||p_wrist - p_shoulder|| / L_t
    try {
      const skel = createSkeleton();
      // Lt = 80 px
      skel[5] = { x: 90, y: 100, score: 0.95 }; skel[6] = { x: 110, y: 100, score: 0.95 };
      skel[11] = { x: 95, y: 180, score: 0.95 }; skel[12] = { x: 105, y: 180, score: 0.95 };
      // Left shoulder at (90, 100), left wrist at (150, 180) -> dist = sqrt(60^2 + 80^2) = 100 px
      skel[5] = { x: 90, y: 100, score: 0.95 };
      skel[9] = { x: 150, y: 180, score: 0.95 };
      // Arm extension = 100 / 80 = 1.25
      const feats = PoseFeatureEngine.extractFeatures(202, skel, [70, 70, 80, 130], 1.0);

      const expectedExt = 100.0 / 80.0; // 1.25
      const passed = Math.abs(feats.leftArmExtension - expectedExt) < 1e-4;

      results.push({
        id: 'test-arm-extension',
        name: '4. Arm Extension: ||p_wrist - p_shoulder|| / L_t',
        passed,
        expected: '1.2500',
        actual: `${feats.leftArmExtension.toFixed(4)}`,
        details: 'Shoulder-wrist distance 100 px normalized by torso length 80 px = 1.25.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-arm-extension',
        name: '4. Arm Extension',
        passed: false,
        expected: '1.2500',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 5. Raised-Arm Detection (y_wrist < y_shoulder in image space)
    try {
      const skel = createSkeleton();
      skel[5] = { x: 90, y: 100, score: 0.95 }; skel[6] = { x: 110, y: 100, score: 0.95 };
      skel[11] = { x: 95, y: 180, score: 0.95 }; skel[12] = { x: 105, y: 180, score: 0.95 };
      // Shoulder at y = 100. Raised wrist at y = 60 (above shoulder)
      skel[9] = { x: 90, y: 60, score: 0.95 };
      const feats = PoseFeatureEngine.extractFeatures(203, skel, [80, 50, 50, 150], 1.0);

      const passed = feats.isRaisedArmLeft && feats.isAnyArmRaised;

      results.push({
        id: 'test-raised-arm',
        name: '5. Raised-Arm Flag: y_wrist < y_shoulder - 0.05*L_t',
        passed,
        expected: 'isRaisedArmLeft = true, isAnyArmRaised = true',
        actual: `isRaisedArmLeft = ${feats.isRaisedArmLeft}, isAnyArmRaised = ${feats.isAnyArmRaised}`,
        details: 'Wrist at y = 60 px is 40 px above shoulder at y = 100 px (0.5*Lt above shoulder).'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-raised-arm',
        name: '5. Raised-Arm Flag',
        passed: false,
        expected: 'true',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 6. Fall Cue Condition (w/h > 1.0 & torso lean)
    try {
      const skel = createSkeleton();
      skel[5] = { x: 50, y: 100, score: 0.95 }; skel[6] = { x: 50, y: 120, score: 0.95 };
      skel[11] = { x: 150, y: 100, score: 0.95 }; skel[12] = { x: 150, y: 120, score: 0.95 };
      // Fallen horizontal person: box w = 180, h = 60 -> aspect ratio = 3.0 > 1.0
      const featsFall = PoseFeatureEngine.extractFeatures(204, skel, [20, 90, 180, 60], 1.0);

      // Upright standing person: box w = 50, h = 160 -> aspect ratio = 0.31 < 1.0
      const featsUpright = PoseFeatureEngine.extractFeatures(205, skel, [20, 20, 50, 160], 1.0);

      const passed = featsFall.isFallCue && !featsUpright.isFallCue;

      results.push({
        id: 'test-fall-cue',
        name: '6. Fall Cue: (w_box / h_box > 1.0) & Severe Torso Inversion',
        passed,
        expected: 'Horizontal box -> isFallCue=true, Vertical box -> isFallCue=false',
        actual: `Horizontal isFallCue=${featsFall.isFallCue}, Upright isFallCue=${featsUpright.isFallCue}`,
        details: 'Aspect ratio 3.0 triggers horizontal posture alert; upright 0.31 remains benign.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-fall-cue',
        name: '6. Fall Cue',
        passed: false,
        expected: 'Fall detected',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 7. Weapon-in-Hand Proximity: ||c_weapon - wrist|| / L_t < 0.5
    try {
      const skel = createSkeleton();
      // Lt = 80 px
      skel[5] = { x: 90, y: 100, score: 0.95 }; skel[6] = { x: 110, y: 100, score: 0.95 };
      skel[11] = { x: 95, y: 180, score: 0.95 }; skel[12] = { x: 105, y: 180, score: 0.95 };
      // Right wrist at (120, 140)
      skel[10] = { x: 120, y: 140, score: 0.95 };

      // Case A: Weapon candidate held right in hand at (132, 156)
      // dist = sqrt((132-120)^2 + (156-140)^2) = sqrt(144 + 256) = 20 px
      // ratio = 20 / 80 = 0.25 < 0.50 -> weapon in hand
      const featsClose = PoseFeatureEngine.extractFeatures(
        206, skel, [80, 80, 50, 120], 1.0, [{ x: 132, y: 156 }]
      );

      // Case B: Distant object at (200, 300) -> dist > 180 px -> ratio > 2.0
      const featsFar = PoseFeatureEngine.extractFeatures(
        207, skel, [80, 80, 50, 120], 1.0, [{ x: 200, y: 300 }]
      );

      const passed = featsClose.hasWeaponInHand && !featsFar.hasWeaponInHand;

      results.push({
        id: 'test-weapon-in-hand',
        name: '7. Weapon-in-Hand: ||c_weapon - wrist|| / L_t < 0.5',
        passed,
        expected: 'Proximity=0.2500 (<0.5 -> hasWeapon=true), Distant=false',
        actual: `Proximity = ${featsClose.weaponInHandProximity.toFixed(4)}, hasWeaponInHand = ${featsClose.hasWeaponInHand}`,
        details: 'Identifies suspicious objects held directly at wrist boundary (ratio 0.25 < threshold 0.50).'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-weapon-in-hand',
        name: '7. Weapon-in-Hand',
        passed: false,
        expected: 'true for close, false for far',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 8. Ground Crowd Density and Motion Energy ME
    try {
      const footPoints = [
        { x: 1.0, y: 2.0 }, { x: 2.0, y: 3.0 }, { x: 1.5, y: 4.0 }, { x: 3.0, y: 2.5 }
      ];
      // 4 persons across 20 m^2 floor -> density = 4 / 20 = 0.20 persons/m^2
      // Motion magnitude sum = 450 px over 300 px mask -> ME = 450 / 300 = 1.50 px
      const metrics = PoseFeatureEngine.computeCrowdMetrics(footPoints, 20.0, 450.0, 300.0);

      const passed =
        Math.abs(metrics.crowdDensityPersonsPerM2 - 0.20) < 1e-4 &&
        Math.abs(metrics.motionEnergyME - 1.50) < 1e-4;

      results.push({
        id: 'test-crowd-density',
        name: '8. Crowd Density (N/Area) and Motion Energy: ME = (1/|Omega|) * sum ||f||',
        passed,
        expected: 'Density = 0.2000 persons/m^2, ME = 1.5000 px',
        actual: `Density = ${metrics.crowdDensityPersonsPerM2.toFixed(4)} persons/m^2, ME = ${metrics.motionEnergyME.toFixed(4)} px`,
        details: 'Ground metric density and optical flow motion energy validated on synthetic mask.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-crowd-density',
        name: '8. Crowd Density & Motion Energy',
        passed: false,
        expected: '0.20 and 1.50',
        actual: String(e),
        details: 'Exception'
      });
    }

    return results;
  }
}
