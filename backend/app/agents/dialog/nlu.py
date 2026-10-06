"""Deterministic, multilingual NLU for the simulated voice channel (en, ar incl. Gulf usage, hi, ur, ml, tl).

With ElevenLabs connected, the LLM does understanding and calls the same tools; this engine exists so the full
flow runs offline. It favours precision: when unsure it asks rather than guesses.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.core.dates import parse_spoken_date
from app.core.pii import EID_RE, digits

LEX: dict[str, tuple[str, ...]] = {
    "yes": ("yes", "yeah", "yep", "sure", "ok", "okay", "correct", "please do", "go ahead", "of course", "that's right",
            "نعم", "ايوه", "أيوه", "اي", "إي", "اكيد", "أكيد", "تمام", "زين", "صح", "هي", "हाँ", "हां", "जी हाँ", "जी हां", "ठीक है", "बिल्कुल",
            "haan", "ha", "ہاں", "جی ہاں", "ٹھیک ہے", "അതെ", "ശരി", "ഉവ്വ്", "athe", "oo", "opo", "sige", "tama", "oho"),
    "no": ("no", "nope", "not yet", "don't", "do not", "negative", "لا", "لأ", "مب", "مو", "ما ابي", "نहीं", "नही", "नहीं", "nahi",
           "nahin", "نہیں", "نہ", "جی نہیں", "जी नहीं", "ഇല്ല", "illa", "hindi", "huwag", "wala pa"),
    "stop_calling": ("stop calling", "don't call", "do not call", "stop the calls", "no more calls", "stop phoning", "unsubscribe",
                     "لا تتصل", "لا تتصلوا", "وقف الاتصال", "بس اتصالات", "لا تدق", "कॉल मत", "कॉल बंद", "फोन मत", "call mat karo",
                     "کال مت", "کال بند", "کالز بند", "کالیں بند", "فون مت", "توقفوا عن الاتصال", "توقف عن الاتصال", "വിളിക്കരുത്", "വിളിക്കേണ്ട", "huwag nang tumawag", "tigil na ang tawag", "wag nang tumawag"),
    "human": ("human", "real person", "officer", "agent please", "speak to someone", "talk to someone", "speak to a person",
              "talk to a person", "representative", "operator",
              "موظف", "شخص", "انسان", "إنسان", "ابي اكلم احد", "अधिकारी", "किसी इंसान", "इंसान से", "insaan", "افسر", "کسی انسان",
              "ഉദ്യോഗസ്ഥ", "ആളുമായി", "tao", "opisyal", "kausapin ang tao"),
    "distress": ("scared", "panic", "panicking", "crying", "desperate", "overwhelmed", "can't cope", "stressed", "worried sick", "help me",
                 "خايف", "خائف", "متضايق", "تعبان", "ساعدني", "ساعدوني", "डर", "परेशान", "घबरा", "मदद करो", "ڈر", "پریشان", "مدد کریں",
                 "പേടി", "ഭയം", "സഹായിക്കൂ", "takot", "natatakot", "tulungan", "nag-aalala"),
    "approval_question": ("will it be approved", "will they approve", "be approved", "get approved", "can you approve", "approve it",
                          "guarantee", "will i get", "rejected", "يوافقون", "بتنقبل", "راح يوافقون", "موافقة", "मंज़ूर", "मंजूर", "अप्रूव",
                          "منظور", "اپروو", "അംഗീകരിക്കുമോ", "aaprubahan", "maaaprubahan"),
    "dispute": ("wrong", "incorrect", "mistake", "not my", "that's not right", "misspelled", "error in", "غلط", "خطأ", "مو صحيح", "गलत",
                "غلط ہے", "തെറ്റ്", "mali"),
    "status": ("where are we", "status", "update", "progress", "what's happening", "how is", "any news", "وين وصلنا", "شو الوضع", "اخبار",
               "الحالة", "कहाँ तक", "स्थिति", "क्या हुआ", "kya hua", "کہاں تک", "صورتحال", "എവിടെ വരെ", "സ്ഥിതി", "nasaan na", "kumusta"),
    "next": ("what next", "what's next", "next step", "what do i need", "what should i do", "do i need to", "شو المطلوب", "ايش الخطوة",
             "الخطوة الجاية", "अगला", "मुझे क्या करना", "اگلا", "مجھے کیا", "അടുത്ത", "ano ang susunod", "ano ang kailangan"),
    "documents": ("document", "documents", "papers", "paperwork", "certificate", "مستندات", "اوراق", "أوراق", "وثائق", "दस्तावेज़", "कागज",
                  "دستاویز", "کاغذات", "രേഖ", "dokumento", "papeles"),
    "deadline": ("deadline", "how long", "how many days", "120 days", "fine", "late", "موعد", "مهلة", "غرامة", "समय सीमा", "जुर्माना",
                 "مدت", "جرمانہ", "സമയപരിധി", "പിഴ", "takdang", "multa"),
    "fee": ("fee", "fees", "cost", "how much", "pay", "price", "charge", "رسوم", "كم السعر", "بكم", "शुल्क", "फीस", "कितना", "فیس",
            "کتنا", "ഫീസ്", "എത്ര", "bayad", "magkano"),
    "timeline": ("what happened", "history", "timeline", "so far", "شو صار", "ايش صار", "क्या हुआ अब तक", "اب تک", "ഇതുവരെ", "ano ang nangyari"),
    "callback": ("call me back", "call back", "callback", "ring me", "اتصل علي", "كلمني", "मुझे कॉल", "واپس کال", "തിരികെ വിളിക്കൂ", "tawagan mo ako"),
    "goodbye": ("bye", "goodbye", "that's all", "nothing else", "thank you bye", "مع السلامة", "باي", "خلاص", "شكرا", "अलविदा", "बस इतना",
                "خدا حافظ", "بس", "വിട", "നന്ദി", "paalam", "salamat"),
    "uae_pass": ("uae pass", "uaepass", "الهوية الرقمية", "يو اي اي باس", "यूएई पास", "یو اے ای پاس", "യുഎഇ പാസ്"),
    "baby": ("baby", "born", "birth", "daughter", "son", "newborn", "child", "مولود", "بنت", "ولد", "ولادة", "ولدت", "طفل", "बच्चा", "बच्ची",
             "बेटी", "बेटा", "जन्म", "بچہ", "بچی", "بیٹی", "بیٹا", "پیدائش", "കുഞ്ഞ്", "മകൾ", "മകൻ", "ജനനം", "sanggol", "anak", "ipinanganak"),
    # consulate milestones (parent-reported)
    "passport_issued": ("passport is ready", "passport issued", "got the passport", "received the passport", "passport came", "have the passport",
                        "passport is here", "passport has been issued", "passport was issued", "پاسپورٹ جاری", "पासपोर्ट जारी",
                        "പാസ്‌പോർട്ട് ഇഷ്യൂ", "nailabas na", "na-issue na", "استلمت الجواز", "الجواز جاهز", "طلع الجواز", "पासपोर्ट मिल", "पासपोर्ट आ गया", "پاسپورٹ مل", "പാസ്‌പോർട്ട് കിട്ടി",
                        "nakuha na ang pasaporte", "dumating na ang pasaporte"),
    "application_submitted": ("applied at the consulate", "submitted the application", "application submitted", "applied for the passport",
                              "قدمت", "قدمنا على الجواز", "आवेदन कर दिया", "अप्लाई", "درخواست دے", "അപേക്ഷ നൽകി", "nag-apply na"),
    "appointment_booked": ("appointment booked", "booked an appointment", "got an appointment", "have an appointment", "حجزت موعد",
                           "अपॉइंटमेंट", "اپوائنٹمنٹ", "അപ്പോയിന്റ്മെന്റ്", "may appointment"),
    "consulate_delayed": ("consulate is delayed", "still waiting at the consulate", "no news from the consulate", "consulate hasn't",
                          "stuck at the consulate", "السفارة متأخرة", "القنصلية متأخرة", "दूतावास में देरी", "قونصل خانہ تاخیر", "കോൺസുലേറ്റ് വൈകി",
                          "naantala ang konsulado"),
    "consulate": ("consulate", "embassy", "passport", "القنصلية", "السفارة", "الجواز", "जवाज़", "पासपोर्ट", "दूतावास", "پاسپورٹ", "سفارت",
                  "പാസ്‌പോർട്ട്", "കോൺസുലേറ്റ്", "pasaporte", "konsulado", "embahada"),
}

# A bare honorific ("ji") answers yes only when nothing else in the reply says yes or no: "جی نہیں" is a no.
HONORIFIC_YES = ("جی", "जी", "ji", "po")

LANGUAGE_WORDS = {
    "ar": ("arabic", "عربي", "العربية", "عربية", "arabi"), "en": ("english", "انجليزي", "إنجليزي", "इंग्लिश", "انگریزی", "ingles"),
    "hi": ("hindi", "हिंदी", "हिन्दी"), "ur": ("urdu", "اردو"), "ml": ("malayalam", "മലയാളം"), "tl": ("tagalog", "filipino", "pilipino"),
}

EMIRATE_WORDS = {
    "DUBAI": ("dubai", "دبي", "दुबई", "دبئی", "ദുബായ്"), "ABU_DHABI": ("abu dhabi", "ابوظبي", "أبوظبي", "अबू धाबी", "ابوظہبی", "അബുദാബി"),
    "SHARJAH": ("sharjah", "الشارقة", "शारजाह", "شارجہ", "ഷാർജ"), "AJMAN": ("ajman", "عجمان", "अजमान"),
    "UMM_AL_QUWAIN": ("umm al quwain", "ام القيوين", "أم القيوين"), "RAS_AL_KHAIMAH": ("ras al khaimah", "rak", "رأس الخيمة", "راس الخيمة"),
    "FUJAIRAH": ("fujairah", "الفجيرة"),
}

NATIONALITIES = ("Indian", "Pakistani", "Filipino", "Bangladeshi", "Egyptian", "British", "Jordanian", "Lebanese", "Syrian", "Sri Lankan",
                 "Nepali", "American", "Canadian", "Sudanese", "Indonesian", "Kenyan", "Nigerian", "Chinese", "Russian", "French", "German")
NATIONALITY_ALIASES = {"india": "Indian", "pakistan": "Pakistani", "philippines": "Filipino", "filipina": "Filipino", "bangladesh": "Bangladeshi",
                       "egypt": "Egyptian", "uk": "British", "england": "British", "jordan": "Jordanian", "lebanon": "Lebanese",
                       "هندي": "Indian", "باكستاني": "Pakistani", "فلبيني": "Filipino", "مصري": "Egyptian", "भारतीय": "Indian",
                       "پاکستانی": "Pakistani", "ഇന്ത്യൻ": "Indian", "pilipino": "Filipino"}


# Letters of the supported scripts, including combining marks and the zero-width (non-)joiners Malayalam uses.
_LETTER = "[\\w؀-ۿݐ-ݿऀ-ॿഀ-ൿ‌‍]"
# Arabic attaches conjunctions, prepositions and the article to the word: "الموافقة", "والجواز", "بالجواز".
_AR_PROCLITIC = "(?:[وفبلك]?(?:ال)?)"


def _matches(phrase: str, low: str) -> bool:
    """Latin phrases match as whole words. Other scripts must start a word (after an Arabic proclitic); tokens of two
    letters or fewer ("مب", "نہ") must also end one, while longer ones may carry suffixes (Malayalam and Hindi inflect)."""
    if re.search(r"[a-z]", phrase):
        return re.search(rf"(?<![a-z]){re.escape(phrase)}(?![a-z])", low) is not None
    short = len(phrase) <= 2
    head = _AR_PROCLITIC if not short and re.match("[؀-ۿ]", phrase) else ""
    tail = f"(?!{_LETTER})" if short else ""
    return re.search(f"(?<!{_LETTER}){head}{re.escape(phrase)}{tail}", low) is not None


def has(text: str, intent: str) -> bool:
    low = (text or "").lower()
    return any(_matches(phrase, low) for phrase in LEX[intent])


def yes_no(text: str) -> bool | None:
    yes, no = has(text, "yes"), has(text, "no")
    if no and not yes:
        return False
    if yes and not no:
        return True
    if not yes and not no and any(_matches(h, (text or "").lower()) for h in HONORIFIC_YES):
        return True
    return None


def language_choice(text: str) -> str | None:
    low = (text or "").lower()
    for lang, words in LANGUAGE_WORDS.items():
        if any(w in low for w in words):
            return lang
    return detect_script(text)


def detect_script(text: str) -> str | None:
    if re.search(r"[ഀ-ൿ]", text or ""):
        return "ml"
    if re.search(r"[ऀ-ॿ]", text or ""):
        return "hi"
    if re.search(r"[؀-ۿ]", text or ""):
        return "ur" if re.search(r"[ٹڈڑںےگک]", text) else "ar"
    return None


def emirate(text: str) -> str | None:
    low = (text or "").lower()
    for code, words in EMIRATE_WORDS.items():
        if any(w in low for w in words):
            return code
    return None


def nationality(text: str) -> str | None:
    low = (text or "").lower()
    for n in NATIONALITIES:
        if n.lower() in low:
            return n
    for alias, n in NATIONALITY_ALIASES.items():
        if alias in low:
            return n
    words = re.findall(r"[A-Za-z]+", text or "")
    return words[-1].title() if len(words) == 1 and len(words[0]) > 3 else None


def hospital(text: str) -> str | None:
    m = re.search(r"([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,4}\s+(?:Hospital|Medical Centre|Medical Center|Clinic))", text or "")
    if m:
        return m.group(1).strip()
    m = re.search(r"(?:at|in)\s+(?:the\s+)?([\w' -]{3,60}?hospital)", text or "", re.I)
    if m:
        return m.group(1).strip().title()
    m = re.search(r"(مستشفى\s+[؀-ۿ ]{2,40})", text or "")
    return m.group(1).strip() if m else None


def eid(text: str) -> str | None:
    m = EID_RE.search(text or "")
    if m:
        return digits(m.group(0))
    d = digits((text or "").translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")))
    return d if len(d) == 15 and d.startswith("784") else None


def birth_date(text: str):
    return parse_spoken_date(text)


def person_name(text: str) -> str | None:
    cleaned = re.sub(r"(?i)\b(her|his|the|child's|baby's|name|is|it's|we named (?:her|him)|called|full)\b", " ", text or "")
    cleaned = re.sub(r"[^\w\s'\-؀-ۿऀ-ॿഀ-ൿ]", " ", cleaned)
    words = [w for w in cleaned.split() if w]
    return " ".join(w if not re.match(r"[a-z]", w) else w.title() for w in words[:5]) if words else None


@dataclass
class Signals:
    stop_calling: bool
    human: bool
    distress: bool
    approval_question: bool
    dispute: bool


def exception_signals(text: str) -> Signals:
    return Signals(stop_calling=has(text, "stop_calling"), human=has(text, "human"), distress=has(text, "distress"),
                   approval_question=has(text, "approval_question"), dispute=has(text, "dispute") and not has(text, "status"))


def consulate_milestone(text: str) -> str | None:
    for intent, milestone in (("passport_issued", "PASSPORT_ISSUED"), ("application_submitted", "APPLICATION_SUBMITTED"),
                              ("appointment_booked", "APPOINTMENT_BOOKED"), ("consulate_delayed", "DELAYED")):
        if has(text, intent):
            return milestone
    return None
