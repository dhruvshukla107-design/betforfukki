/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Error Taxonomy & Self-Healing Diagnostic Engine
 * Defines standard error codes, root cause descriptions, severity levels,
 * and automated remediation actions.
 */

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface DiagnosticError {
  code: string;
  category: 'camera' | 'youtube' | 'calibration' | 'inference' | 'security' | 'timing';
  severity: ErrorSeverity;
  title: string;
  titleHi: string;
  message: string;
  messageHi: string;
  remediation: string;
  remediationHi: string;
  autoRemedyAction?: string;
}

export const ERROR_REGISTRY: Record<string, DiagnosticError> = {
  CAM_PERM_DENIED: {
    code: 'CAM_PERM_DENIED',
    category: 'camera',
    severity: 'error',
    title: 'Camera Access Blocked',
    titleHi: 'कैमरा एक्सेस अवरोधित',
    message: 'The browser or user denied permission to access the webcam or camera stream.',
    messageHi: 'ब्राउज़र या उपयोगकर्ता ने वेबकैम या कैमरा स्ट्रीम तक पहुँचने की अनुमति नहीं दी।',
    remediation: 'Click the camera/lock icon in your browser URL bar to grant permission, or switch to Simulated CCTV Feed.',
    remediationHi: 'अनुमति देने के लिए अपने ब्राउज़र बार में कैमरा आइकन पर क्लिक करें, या सिम्युलेटेड सीसीटीवी फ़ीड पर स्विच करें।',
    autoRemedyAction: 'SWITCH_TO_TEST_FEED'
  },
  CAM_NOT_FOUND: {
    code: 'CAM_NOT_FOUND',
    category: 'camera',
    severity: 'warning',
    title: 'No Camera Device Detected',
    titleHi: 'कोई कैमरा उपकरण नहीं मिला',
    message: 'No video input devices were found attached to this machine.',
    messageHi: 'इस डिवाइस से जुड़ा कोई वीडियो इनपुट उपकरण नहीं मिला।',
    remediation: 'Connect an external USB webcam or use Simulated CCTV / YouTube stream modes.',
    remediationHi: 'एक बाहरी यूएसबी वेबकैम कनेक्ट करें या सिम्युलेटेड सीसीटीवी / यूट्यूब स्ट्रीम मोड का उपयोग करें।',
    autoRemedyAction: 'SWITCH_TO_TEST_FEED'
  },
  YT_EMBED_FORBIDDEN: {
    code: 'YT_EMBED_FORBIDDEN',
    category: 'youtube',
    severity: 'warning',
    title: 'YouTube Embedding Restricted (Code 101/150)',
    titleHi: 'यूट्यूब एम्बेडिंग प्रतिबंधित (कोड 101/150)',
    message: 'The owner of this video has disabled playback in third-party embedded players.',
    messageHi: 'इस वीडियो के स्वामी ने तीसरे पक्ष के एम्बेडेड प्लेयर में प्लेबैक अक्षम कर दिया है।',
    remediation: 'Select another video or try one of the curated CCTV benchmark clips provided in the YouTube tab.',
    remediationHi: 'कोई अन्य वीडियो चुनें या यूट्यूब टैब में दिए गए सीसीटीवी क्लिप्स का प्रयास करें।',
    autoRemedyAction: 'LOAD_BENCHMARK_CLIP'
  },
  YT_INVALID_URL: {
    code: 'YT_INVALID_URL',
    category: 'youtube',
    severity: 'info',
    title: 'Invalid YouTube URL',
    titleHi: 'अमान्य यूट्यूब लिंक',
    message: 'The provided link does not match a valid YouTube video ID pattern (11 characters).',
    messageHi: 'प्रदान किया गया लिंक एक मान्य यूट्यूब वीडियो आईडी पैटर्न (11 वर्ण) से मेल नहीं खाता है।',
    remediation: 'Paste a full link such as https://www.youtube.com/watch?v=... or click an example clip.',
    remediationHi: 'https://www.youtube.com/watch?v=... जैसा पूरा लिंक पेस्ट करें या किसी उदाहरण क्लिप पर क्लिक करें।',
    autoRemedyAction: 'CLEAR_INPUT'
  },
  CALIB_COLLINEAR: {
    code: 'CALIB_COLLINEAR',
    category: 'calibration',
    severity: 'error',
    title: 'Degenerate Calibration Points (Collinear)',
    titleHi: 'अमान्य कैलिब्रेशन बिंदु (एक रेखा में)',
    message: 'Three or more clicked ground points lie on the same straight line, causing SVD rank deficiency.',
    messageHi: 'तीन या अधिक क्लिक किए गए फर्श बिंदु एक ही सीधी रेखा पर हैं, जिससे गणितीय विसंगति हो रही है।',
    remediation: 'Click 4 non-collinear floor points distributed across the floor plane (e.g. four corners of a rug or tile square).',
    remediationHi: 'फर्श पर 4 ऐसे बिंदु चुनें जो एक सीधी रेखा में न हों (जैसे फर्श की टाइल के चार कोने)।',
    autoRemedyAction: 'RESET_CALIBRATION_POINTS'
  },
  CALIB_INSUFFICIENT_PTS: {
    code: 'CALIB_INSUFFICIENT_PTS',
    category: 'calibration',
    severity: 'warning',
    title: 'Insufficient Ground Points',
    titleHi: 'अपर्याप्त फर्श बिंदु',
    message: 'Computing a 3x3 homography requires at least 4 point correspondences (8 degrees of freedom).',
    messageHi: '3x3 होमोग्राफी की गणना के लिए कम से कम 4 फर्श बिंदुओं की आवश्यकता होती है।',
    remediation: 'Click at least 4 floor points on the camera frame before computing homography.',
    remediationHi: 'होमोग्राफी की गणना करने से पहले कैमरा फ्रेम पर कम से कम 4 फर्श बिंदुओं पर क्लिक करें।'
  },
  SCENE_CUT_DESYNC: {
    code: 'SCENE_CUT_DESYNC',
    category: 'timing',
    severity: 'info',
    title: 'Scene Cut / Rapid Pan Detected',
    titleHi: 'दृश्य परिवर्तन या तेज़ कैमरा गति पाई गई',
    message: 'Sudden luminance histogram shift (χ² > 0.45) or high camera pan detected.',
    messageHi: 'अचानक प्रकाश में परिवर्तन या तेज़ कैमरा गति का पता चला है।',
    remediation: 'Kalman trackers were automatically reset to prevent stale velocity projections. Floor recalibration recommended if camera moved.',
    remediationHi: 'गलत अनुमानों को रोकने के लिए ट्रैकर्स रीसेट कर दिए गए हैं। यदि कैमरा हिला है तो पुनः कैलिब्रेट करें।',
    autoRemedyAction: 'RESET_TRACKERS'
  },
  WEBGPU_UNAVAILABLE: {
    code: 'WEBGPU_UNAVAILABLE',
    category: 'inference',
    severity: 'info',
    title: 'WebGPU Not Available (Using WebGL 2.0)',
    titleHi: 'WebGPU उपलब्ध नहीं है (WebGL 2.0 का उपयोग)',
    message: 'This browser or hardware does not support the modern WebGPU standard.',
    messageHi: 'यह ब्राउज़र या हार्डवेयर आधुनिक WebGPU मानक का समर्थन नहीं करता है।',
    remediation: 'System automatically fell back to WebGL 2.0 shader acceleration without loss of detection features.',
    remediationHi: 'सिस्टम ने बिना किसी फीचर के नुकसान के अपने आप WebGL 2.0 पर स्विच कर लिया है।',
    autoRemedyAction: 'FALLBACK_WEBGL'
  },
  HASH_INTEGRITY_FAIL: {
    code: 'HASH_INTEGRITY_FAIL',
    category: 'security',
    severity: 'critical',
    title: 'Cryptographic Hash Mismatch',
    titleHi: 'क्रिप्टोग्राफ़िक हैश बेमेल',
    message: 'Model weight buffer does not match the expected SHA-256 digest in the manifest.',
    messageHi: 'मॉडल फ़ाइल मैनिफ़ेस्ट में दिए गए SHA-256 हैश से मेल नहीं खाती है।',
    remediation: 'The model weights may be corrupted or tampered with. Do not deploy until verified.',
    remediationHi: 'मॉडल फ़ाइल दूषित या छेड़छाड़ की गई हो सकती है। सत्यापित होने तक उपयोग न करें।',
    autoRemedyAction: 'BLOCK_DEPLOYMENT'
  },
  CLIP_BUFFER_OVERFLOW: {
    code: 'CLIP_BUFFER_OVERFLOW',
    category: 'timing',
    severity: 'warning',
    title: 'Video Buffer Stalled',
    titleHi: 'वीडियो बफ़र रुका हुआ है',
    message: 'Video frame presentation stalled or dropped frames detected during playback.',
    messageHi: 'प्लेबैक के दौरान वीडियो फ्रेम में रुकावट पाई गई।',
    remediation: 'Kinematic calculations paused automatically until steady video playback resumes.',
    remediationHi: 'स्थिर प्लेबैक फिर से शुरू होने तक गति गणना को रोक दिया गया है।',
    autoRemedyAction: 'PAUSE_KINEMATICS'
  }
};

export class ErrorTaxonomyEngine {
  private activeErrors: DiagnosticError[] = [];
  private errorListeners: ((errors: DiagnosticError[]) => void)[] = [];

  public raiseError(code: string): DiagnosticError {
    const errorDef = ERROR_REGISTRY[code] || {
      code,
      category: 'inference',
      severity: 'warning',
      title: 'System Notice',
      titleHi: 'सिस्टम सूचना',
      message: `An event with code ${code} occurred.`,
      messageHi: `कोड ${code} वाली घटना घटी।`,
      remediation: 'Check console logs or retry the operation.',
      remediationHi: 'लॉग जांचें या पुनः प्रयास करें।'
    };

    // Avoid duplicate error codes in active list
    if (!this.activeErrors.some(e => e.code === code)) {
      this.activeErrors.unshift(errorDef);
      this.notifyListeners();
    }

    return errorDef;
  }

  public dismissError(code: string): void {
    this.activeErrors = this.activeErrors.filter(e => e.code !== code);
    this.notifyListeners();
  }

  public clearAll(): void {
    this.activeErrors = [];
    this.notifyListeners();
  }

  public getActiveErrors(): DiagnosticError[] {
    return [...this.activeErrors];
  }

  public subscribe(listener: (errors: DiagnosticError[]) => void): () => void {
    this.errorListeners.push(listener);
    listener([...this.activeErrors]);
    return () => {
      this.errorListeners = this.errorListeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.errorListeners.forEach(listener => listener([...this.activeErrors]));
  }
}
