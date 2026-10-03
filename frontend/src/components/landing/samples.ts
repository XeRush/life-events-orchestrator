import type { Lang } from "../../types/api";

/**
 * Language SAMPLES, not UI copy: each line is deliberately written in its own language so the multilingual
 * capability is visible whatever language the page itself is shown in. They are never passed through t().
 * The disclosure lines mirror backend/app/core/translations/*.py ("disclosure"), the fixed first turn of every call.
 */
export interface LanguageSample {
  lang: Lang;
  native: string;
  english: string;
  dir: "ltr" | "rtl";
  font: string;
  tagline: string;
  disclosure: string;
}

const DISPLAY = "var(--font-display)";

export const SAMPLES: LanguageSample[] = [
  {
    lang: "en", native: "English", english: "English", dir: "ltr", font: DISPLAY,
    tagline: "One call. One case. Every step after birth.",
    disclosure: "Hello, this is LifeLoop, an AI agent for Dubai's life-event service. This call is recorded. Would you like to continue in English or Arabic?",
  },
  {
    lang: "ar", native: "العربية", english: "Arabic (MSA + Gulf)", dir: "rtl", font: "\"IBM Plex Sans Arabic\", var(--font-sans)",
    tagline: "مكالمة واحدة. ملف واحد. كل خطوة بعد الولادة.",
    disclosure: "مرحبًا، أنا LifeLoop، وكيل ذكاء اصطناعي لخدمة أحداث الحياة في دبي. هذه المكالمة مسجلة. هل تود المتابعة بالعربية أم بالإنجليزية؟",
  },
  {
    lang: "hi", native: "हिन्दी", english: "Hindi", dir: "ltr", font: "\"Noto Sans Devanagari\", var(--font-sans)",
    tagline: "एक कॉल। एक केस। जन्म के बाद का हर कदम।",
    disclosure: "नमस्ते, मैं LifeLoop हूँ, दुबई की लाइफ़-इवेंट सेवा का एआई एजेंट। यह कॉल रिकॉर्ड की जा रही है। क्या आप हिंदी, अंग्रेज़ी या अरबी में बात जारी रखना चाहेंगे?",
  },
  {
    lang: "ur", native: "اردو", english: "Urdu", dir: "rtl", font: "\"Noto Nastaliq Urdu\", \"IBM Plex Sans Arabic\", var(--font-sans)",
    tagline: "ایک کال۔ ایک کیس۔ پیدائش کے بعد ہر قدم۔",
    disclosure: "السلام علیکم، میں LifeLoop ہوں، دبئی کی لائف ایونٹ سروس کا اے آئی ایجنٹ۔ یہ کال ریکارڈ کی جا رہی ہے۔ کیا آپ اردو، انگریزی یا عربی میں بات جاری رکھنا چاہیں گے؟",
  },
  {
    lang: "ml", native: "മലയാളം", english: "Malayalam", dir: "ltr", font: "\"Noto Sans Malayalam\", var(--font-sans)",
    tagline: "ഒരു കോൾ. ഒരു കേസ്. ജനനത്തിനു ശേഷമുള്ള ഓരോ ഘട്ടവും.",
    disclosure: "നമസ്കാരം, ഇത് LifeLoop ആണ്, ദുബായിലെ ലൈഫ്-ഇവന്റ് സേവനത്തിനായുള്ള ഒരു എഐ ഏജന്റ്. ഈ കോൾ റെക്കോർഡ് ചെയ്യുന്നുണ്ട്. മലയാളത്തിലോ ഇംഗ്ലീഷിലോ അറബിയിലോ, ഏത് ഭാഷയിൽ തുടരാനാണ് നിങ്ങൾക്ക് താൽപ്പര്യം?",
  },
  {
    lang: "tl", native: "Tagalog", english: "Tagalog", dir: "ltr", font: DISPLAY,
    tagline: "Isang tawag. Isang kaso. Bawat hakbang pagkatapos ng panganganak.",
    disclosure: "Hello po, ito ang LifeLoop, isang AI agent para sa life-event services ng Dubai. Nire-record ang tawag na ito. Gusto mo bang magpatuloy sa Tagalog, English, o Arabic?",
  },
];
