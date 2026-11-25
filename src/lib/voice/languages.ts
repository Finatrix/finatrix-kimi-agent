/**
 * The languages FinatriX AI listens and speaks in, decided 24 Nov 2026
 * (docs/NEW_FEATURES.md item 1): English and ten Indian languages.
 *
 * Codes are BCP 47 tags with the India region, which is what the browser's
 * SpeechRecognition, Apple's SFSpeechRecognizer and Android's SpeechRecognizer
 * all expect. Whether a phone or browser really has each one varies, so every
 * engine reports "unsupported-language" and the panel falls back to typing.
 */

export type VoiceLangCode =
  | 'en-IN' | 'hi-IN' | 'bn-IN' | 'mr-IN' | 'te-IN' | 'ta-IN'
  | 'gu-IN' | 'kn-IN' | 'ml-IN' | 'pa-IN' | 'or-IN';

type Script = 'latin' | 'devanagari' | 'bengali' | 'telugu' | 'tamil' | 'gujarati' | 'kannada' | 'malayalam' | 'gurmukhi' | 'odia';

export interface VoiceLanguage {
  code: VoiceLangCode;
  /** The English name, for the accessible label and messages. */
  name: string;
  /** The language's own name for itself, shown in the picker. */
  own: string;
  script: Script;
  /**
   * Whole utterances that end a hands-free conversation. Matched against the
   * entire thing said, never a word inside it, so "stop my SIP" is a question.
   * English "stop" works in every language, because people say it anyway.
   * To be checked by a fluent speaker of each language (listed in the PR).
   */
  stop: readonly string[];
}

export const VOICE_LANGUAGES: readonly VoiceLanguage[] = [
  { code: 'en-IN', name: 'English', own: 'English', script: 'latin',
    stop: ['stop', 'stop listening', "that's all", 'thats all', 'that is all', 'bye', 'goodbye'] },
  { code: 'hi-IN', name: 'Hindi', own: 'हिन्दी', script: 'devanagari',
    stop: ['रुको', 'रुकिए', 'बस', 'बस करो', 'बंद करो', 'स्टॉप', 'बस इतना ही'] },
  { code: 'bn-IN', name: 'Bengali', own: 'বাংলা', script: 'bengali',
    stop: ['থামো', 'থামুন', 'বন্ধ করো', 'বন্ধ করুন', 'স্টপ', 'ব্যাস'] },
  { code: 'mr-IN', name: 'Marathi', own: 'मराठी', script: 'devanagari',
    stop: ['थांब', 'थांबा', 'बंद कर', 'बंद करा', 'स्टॉप', 'बस'] },
  { code: 'te-IN', name: 'Telugu', own: 'తెలుగు', script: 'telugu',
    stop: ['ఆపు', 'ఆపండి', 'స్టాప్', 'చాలు'] },
  { code: 'ta-IN', name: 'Tamil', own: 'தமிழ்', script: 'tamil',
    stop: ['நிறுத்து', 'நிறுத்துங்கள்', 'ஸ்டாப்', 'போதும்'] },
  { code: 'gu-IN', name: 'Gujarati', own: 'ગુજરાતી', script: 'gujarati',
    stop: ['બંધ કરો', 'રોકો', 'સ્ટોપ', 'બસ'] },
  { code: 'kn-IN', name: 'Kannada', own: 'ಕನ್ನಡ', script: 'kannada',
    stop: ['ನಿಲ್ಲಿಸು', 'ನಿಲ್ಲಿಸಿ', 'ಸ್ಟಾಪ್', 'ಸಾಕು'] },
  { code: 'ml-IN', name: 'Malayalam', own: 'മലയാളം', script: 'malayalam',
    stop: ['നിർത്തൂ', 'നിർത്തുക', 'സ്റ്റോപ്പ്', 'മതി'] },
  { code: 'pa-IN', name: 'Punjabi', own: 'ਪੰਜਾਬੀ', script: 'gurmukhi',
    stop: ['ਰੁਕੋ', 'ਬੱਸ', 'ਬੰਦ ਕਰੋ', 'ਸਟਾਪ'] },
  { code: 'or-IN', name: 'Odia', own: 'ଓଡ଼ିଆ', script: 'odia',
    stop: ['ବନ୍ଦ କର', 'ରୁହ', 'ଷ୍ଟପ୍', 'ବସ୍'] },
];

export const DEFAULT_VOICE_LANG: VoiceLangCode = 'en-IN';

const BY_CODE = new Map(VOICE_LANGUAGES.map((l) => [l.code, l]));

export function voiceLanguage(code: VoiceLangCode): VoiceLanguage {
  return BY_CODE.get(code) ?? BY_CODE.get(DEFAULT_VOICE_LANG)!;
}

export function isVoiceLangCode(value: unknown): value is VoiceLangCode {
  return typeof value === 'string' && BY_CODE.has(value as VoiceLangCode);
}

/**
 * The first of the device's preferred languages that FinatriX can listen in.
 * "hi" and "hi-IN" both mean Hindi; any English means Indian English, because
 * that recogniser understands Indian names, places and "lakh".
 */
export function preferredVoiceLang(preferences: readonly string[]): VoiceLangCode {
  for (const raw of preferences) {
    const base = raw.toLowerCase().split(/[-_]/)[0];
    const match = VOICE_LANGUAGES.find((l) => l.code.slice(0, 2) === base);
    if (match) return match.code;
  }
  return DEFAULT_VOICE_LANG;
}

/* ── The device's choice ── */

/** Per device, like the AI consent and the conversation itself. Never synced. */
export const VOICE_LANG_KEY = 'fx_voice_lang';

export function loadVoiceLang(): VoiceLangCode {
  try {
    const saved = localStorage.getItem(VOICE_LANG_KEY);
    if (isVoiceLangCode(saved)) return saved;
  } catch {
    /* storage blocked: fall through to the device's languages */
  }
  return preferredVoiceLang(typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]);
}

export function saveVoiceLang(code: VoiceLangCode): void {
  try {
    localStorage.setItem(VOICE_LANG_KEY, code);
  } catch {
    /* the choice lasts as long as this page does */
  }
}

/* ── Stop words ── */

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFC')
    // Punctuation a recogniser adds, including the danda and double danda.
    .replace(/[.,!?;:'"’‘“”।॥\-–—()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ENGLISH_STOP = new Set(voiceLanguage('en-IN').stop.map(normalise));

/** True when the whole utterance means "stop", in the language spoken or in English. */
export function isStopPhrase(text: string, lang: VoiceLangCode): boolean {
  const said = normalise(text);
  if (!said) return false;
  if (ENGLISH_STOP.has(said)) return true;
  return voiceLanguage(lang).stop.some((phrase) => normalise(phrase) === said);
}

/* ── Which voice reads a reply ── */

const SCRIPT_RANGES: ReadonlyArray<[Script, RegExp]> = [
  ['devanagari', /[ऀ-ॿ]/g],
  ['bengali', /[ঀ-৿]/g],
  ['gurmukhi', /[਀-੿]/g],
  ['gujarati', /[઀-૿]/g],
  ['odia', /[଀-୿]/g],
  ['tamil', /[஀-௿]/g],
  ['telugu', /[ఀ-౿]/g],
  ['kannada', /[ಀ-೿]/g],
  ['malayalam', /[ഀ-ൿ]/g],
  ['latin', /[A-Za-z]/g],
];

/** The first language written in a script. Devanagari is Hindi unless the user chose Marathi. */
const LANG_OF_SCRIPT: Record<Script, VoiceLangCode> = {
  latin: 'en-IN', devanagari: 'hi-IN', bengali: 'bn-IN', gurmukhi: 'pa-IN', gujarati: 'gu-IN',
  odia: 'or-IN', tamil: 'ta-IN', telugu: 'te-IN', kannada: 'kn-IN', malayalam: 'ml-IN',
};

/**
 * The voice to read `text` with. The AI answers in the language it was asked
 * in, but not always: a Hindi question can get an English answer, and a Hindi
 * voice reading English sounds broken. So the reply's own script decides, and
 * the chosen language wins only where the script is shared (Hindi and Marathi).
 */
export function speechLangFor(text: string, chosen: VoiceLangCode): VoiceLangCode {
  let best: Script = 'latin';
  let most = 0;
  for (const [script, re] of SCRIPT_RANGES) {
    const n = text.match(re)?.length ?? 0;
    if (n > most) { most = n; best = script; }
  }
  if (most === 0) return chosen;
  return voiceLanguage(chosen).script === best ? chosen : LANG_OF_SCRIPT[best];
}
