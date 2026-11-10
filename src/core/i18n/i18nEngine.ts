/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Bilingual English / Hindi (हिन्दी) Localization Engine
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type SupportedLanguage = 'en' | 'hi';

export const TRANSLATIONS: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    // Header & Brand
    app_title: 'SpatialMapper 3D',
    app_version_tag: 'v2.0 CCTV',
    source_label: 'Source',
    fps_sustained: '(>50 sustained)',
    latency_label: 'latency',
    model_label: 'Model',
    
    // Actions & Views
    view_2d: '2D HUD',
    view_3d: '3D Cloud',
    view_dual: 'Dual View',
    btn_start: 'Start',
    btn_stop: 'Stop',
    btn_calib: 'Calibration & Tests',
    btn_lab: 'Lab Mode',
    btn_lab_sub: 'Test & Teach',
    btn_models: 'Models',
    btn_specs: 'Arch Specs',
    btn_install: 'Install App',
    
    // Categories & Detections
    cat_people: 'People',
    cat_animals: 'Animals',
    cat_objects: 'Objects',
    cat_threats: 'Threats',
    label_person: 'Person',
    label_child: 'Child',
    label_teen: 'Teen',
    label_adult: 'Adult',
    label_senior: 'Senior',
    label_animal: 'Animal',
    label_dog: 'Dog',
    label_cat: 'Cat',
    label_bird: 'Bird',
    label_object: 'Object',
    label_phone: 'Phone',
    label_laptop: 'Laptop',
    label_bag: 'Bag',
    label_bottle: 'Bottle',
    label_keys: 'Keys',
    label_umbrella: 'Umbrella',
    label_knife: 'Knife',
    label_firearm: 'Firearm',
    
    // Weapon & Safety Disclaimers
    weapon_alert_banner: 'Possible Weapon: Needs Human Verification',
    weapon_review_required: 'Flagged as potential weapon. Never treat as confirmed fact without human review.',
    demographic_disclaimer: 'Age demographics are physical height priors only and are strictly excluded from risk scoring.',
    
    // Risk Engine
    threat_level: 'Threat Level',
    risk_normal: 'Normal (Monitoring)',
    risk_elevated: 'Elevated (Activity Notice)',
    risk_warning: 'Threat Warning (Active)',
    risk_critical: 'Critical Alert (Review Required)',
    min_ttc: 'Minimum Time-to-Collision (TTC)',
    
    // Calibration & Geometry
    ground_dist: 'Calibrated Ground Distance',
    rmse_label: 'Reprojection RMSE',
    approx_metric: 'Approx. ±15% (Uncalibrated: Click Calibration to refine)',
    
    // Status & Offline
    offline_title: 'Offline Operation Active',
    offline_desc: 'Local edge inference (WebGL/WASM) continues at full speed.',
    scene_cut_alert: 'Scene cut / rapid motion detected. Trackers reset.',
    recalibrate_cta: 'Recalibrate Floor'
  },
  hi: {
    // Header & Brand
    app_title: 'स्पेशल-मैपर 3D',
    app_version_tag: 'v2.0 सीसीटीवी',
    source_label: 'स्रोत',
    fps_sustained: '(>50 निरंतर)',
    latency_label: 'विलंबता',
    model_label: 'मॉडल',
    
    // Actions & Views
    view_2d: '2D HUD दृश्य',
    view_3d: '3D पॉइंट क्लाउड',
    view_dual: 'दोहरा दृश्य',
    btn_start: 'निगरानी शुरू करें',
    btn_stop: 'निगरानी रोकें',
    btn_calib: 'कैलिब्रेशन और टेस्ट',
    btn_lab: 'लैब मोड',
    btn_lab_sub: 'परीक्षण और शिक्षण',
    btn_models: 'मॉडल प्रबंधक',
    btn_specs: 'वास्तुकला विनिर्देश',
    btn_install: 'ऐप इंस्टॉल करें',
    
    // Categories & Detections
    cat_people: 'लोग',
    cat_animals: 'पशु',
    cat_objects: 'वस्तुएं',
    cat_threats: 'खतरे की चेतावनी',
    label_person: 'व्यक्ति',
    label_child: 'बच्चा',
    label_teen: 'किशोर',
    label_adult: 'वयस्क',
    label_senior: 'वरिष्ठ नागरिक',
    label_animal: 'पशु',
    label_dog: 'कुत्ता',
    label_cat: 'बिल्ली',
    label_bird: 'पक्षी',
    label_object: 'वस्तु',
    label_phone: 'फ़ोन',
    label_laptop: 'लैपटॉप',
    label_bag: 'बैग',
    label_bottle: 'बोतल',
    label_keys: 'चाबियां',
    label_umbrella: 'छाता',
    label_knife: 'चाकू',
    label_firearm: 'हथियार',
    
    // Weapon & Safety Disclaimers
    weapon_alert_banner: 'संभावित हथियार: मानवीय सत्यापन आवश्यक है',
    weapon_review_required: 'संभावित हथियार के रूप में चिह्नित। मानवीय समीक्षा के बिना कभी भी पुष्ट तथ्य न मानें।',
    demographic_disclaimer: 'आयु समूह केवल भौतिक ऊंचाई अनुमान हैं और सुरक्षा जोखिम स्कोरिंग से पूरी तरह बाहर रखे गए हैं।',
    
    // Risk Engine
    threat_level: 'खतरे का स्तर',
    risk_normal: 'सामान्य (सक्रिय निगरानी)',
    risk_elevated: 'सावधान (गतिविधि सूचना)',
    risk_warning: 'चेतावनी (सक्रिय खतरा)',
    risk_critical: 'गंभीर चेतावनी (सत्यापन आवश्यक)',
    min_ttc: 'टक्कर का अनुमानित समय (TTC)',
    
    // Calibration & Geometry
    ground_dist: 'कैलिब्रेटेड जमीनी दूरी',
    rmse_label: 'पुनःप्रक्षेपण त्रुटि (RMSE)',
    approx_metric: 'लगभग ±15% (सटीक माप के लिए कैलिब्रेशन पर क्लिक करें)',
    
    // Status & Offline
    offline_title: 'ऑफ़लाइन संचालन सक्रिय',
    offline_desc: 'स्थानीय एज इन्फरेंस (WebGL/WASM) पूरी गति से जारी है।',
    scene_cut_alert: 'दृश्य परिवर्तन या तेज़ कैमरा गति पाई गई। ट्रैकर्स रीसेट किए गए।',
    recalibrate_cta: 'फर्श को पुनः कैलिब्रेट करें'
  }
};

interface I18nContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('spatialmapper_lang') as SupportedLanguage;
      if (saved === 'en' || saved === 'hi') return saved;
    }
    return 'en';
  });

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('spatialmapper_lang', lang);
    }
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    const dict = TRANSLATIONS[language] || TRANSLATIONS.en;
    let text = dict[key] || TRANSLATIONS.en[key] || key;

    if (params) {
      Object.entries(params).forEach(([paramKey, val]) => {
        text = text.replace(new RegExp(`{${paramKey}}`, 'g'), String(val));
      });
    }

    return text;
  };

  return React.createElement(
    I18nContext.Provider,
    { value: { language, setLanguage, t } },
    children
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
