/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Pose & Behaviour Feature Types (Phase C)
 * Standard COCO 17 Keypoints & Torso-Normalized Observable Biomechanical Cues
 */

export const COCO_KEYPOINTS = [
  'nose',           // 0
  'left_eye',       // 1
  'right_eye',      // 2
  'left_ear',       // 3
  'right_ear',      // 4
  'left_shoulder',  // 5
  'right_shoulder', // 6
  'left_elbow',     // 7
  'right_elbow',    // 8
  'left_wrist',     // 9
  'right_wrist',    // 10
  'left_hip',       // 11
  'right_hip',      // 12
  'left_knee',      // 13
  'right_knee',     // 14
  'left_ankle',     // 15
  'right_ankle'     // 16
] as const;

export type KeypointName = typeof COCO_KEYPOINTS[number];

export interface Keypoint {
  x: number;          // Image pixel X (or normalized [0..1])
  y: number;          // Image pixel Y (or normalized [0..1])
  score: number;      // Confidence [0..1]
}

export type PoseSkeleton = Keypoint[]; // Exactly 17 points

export interface BiomechanicalFeatures {
  trackId: number;
  torsoLengthLt: number;          // L_t = ||p_midShoulder - p_midHip|| in pixels
  leftElbowAngleDeg: number;      // theta = acos(u.v / (||u|| ||v||))
  rightElbowAngleDeg: number;
  leftShoulderAngleDeg: number;
  rightShoulderAngleDeg: number;
  leftKneeAngleDeg: number;
  rightKneeAngleDeg: number;
  leftWristSpeedRatio: number;    // ||dw_left / dt|| / L_t (per second)
  rightWristSpeedRatio: number;   // ||dw_right / dt|| / L_t (per second)
  maxWristSpeedRatio: number;
  leftArmExtension: number;       // ||p_wrist - p_shoulder|| / L_t
  rightArmExtension: number;
  isRaisedArmLeft: boolean;       // Wrist above shoulder level
  isRaisedArmRight: boolean;
  isAnyArmRaised: boolean;
  torsoLeanAngleDeg: number;      // Angle of torso relative to vertical
  isFallCue: boolean;             // Aspect ratio w/h > 1.0 AND downward vertical velocity > threshold
  weaponInHandProximity: number;  // Min ||c_weapon - wrist|| / L_t
  hasWeaponInHand: boolean;       // ||c_weapon - wrist|| / L_t < 0.5
  temporalClassProb: {
    normal: number;
    fight: number;
    fall: number;
    running: number;
  };
}

export interface CrowdMetrics {
  totalPersons: number;
  groundAreaM2: number;
  crowdDensityPersonsPerM2: number; // N / Area
  motionEnergyME: number;           // (1 / |Omega|) * sum ||f(x, y)||
}
