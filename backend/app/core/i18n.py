"""Server-side phrasebook for the voice agent, callbacks and SMS (en, ar, hi, ur, ml, tl).

English is the master. Other languages live in `app/core/translations/<lang>.py`; any key missing there falls back
to English, so a partial translation never produces an empty utterance.
"""
from __future__ import annotations

import importlib
from functools import lru_cache

from app.core.config import LANGUAGES

LANGUAGE_NAMES = {"en": "English", "ar": "العربية", "hi": "हिन्दी", "ur": "اردو", "ml": "മലയാളം", "tl": "Tagalog"}
LANGUAGE_NAMES_EN = {"en": "English", "ar": "Arabic", "hi": "Hindi", "ur": "Urdu", "ml": "Malayalam", "tl": "Tagalog"}

EN: dict[str, str] = {
    # Step 1 - fixed, non-skippable opening disclosure
    "disclosure": "Hello, this is LifeLoop, an AI agent for Dubai's life-event service. This call is recorded. Would you like to continue in English or Arabic?",
    "disclosure_callback": "Hello, this is LifeLoop, an AI agent for Dubai's life-event service, calling about case {ref}. This call is recorded. Would you like to continue in English or Arabic?",
    "language_confirmed": "Thank you. We'll continue in {language}.",
    # Step 2 - intake
    "intake_open": "Are you calling about a new baby born in the UAE?",
    "intake_congrats": "Congratulations. I'll set up one case for everything that follows the birth, so you only tell us once.",
    "intake_not_birth": "LifeLoop currently coordinates the services that follow a birth. For anything else, please contact the service centre.",
    "ask_birth_date": "What is the child's date of birth? For example, the 20th of September.",
    "bad_birth_date": "I didn't catch a date. Please say the date of birth, for example the 20th of September.",
    "ask_child_name": "What is the child's full name, as it should appear on the birth certificate?",
    "ask_emirate": "In which emirate was the child born? For example Dubai, Abu Dhabi or Sharjah.",
    "ask_hospital": "Which hospital was the child born in?",
    "ask_father_name": "What is the father's full name?",
    "ask_mother_name": "What is the mother's full name?",
    "ask_father_eid": "Please say the father's Emirates ID number. I'll record it securely and I won't read it back.",
    "ask_mother_eid": "And the mother's Emirates ID number, please. Again, I won't read it back.",
    "eid_recorded": "Thank you, recorded securely.",
    "eid_invalid": "That doesn't sound like a 15-digit Emirates ID starting with 784. Could you say it again?",
    "ask_nationality": "What is the child's nationality?",
    "ask_marriage_certificate": "Is your marriage certificate attested in your home country, by the UAE embassy, and by MOFA? The birth certificate can't be issued without it.",
    "marriage_certificate_missing": "That's important to know. I'll mark it as missing, so the birth certificate step waits until it is attested. I'll explain the steps in your case documents.",
    "ask_consent_filing": "May LifeLoop use these details to prepare the filings with each authority? An Amer officer releases every submission before it is sent.",
    "consent_filing_declined": "Understood. I haven't opened a case or shared anything. You can call again whenever you're ready.",
    "ask_consent": "May LifeLoop call you back each time a step is cleared, blocked, or needs a document? You can say 'stop calling' at any time.",
    "consent_declined": "Understood. I won't call you. You'll see every update in the LifeLoop app and by SMS.",
    "intake_summary": "Thank you. I've opened case {ref}. Six services follow a birth: birth certificate, MOFA attestation, the consulate passport, residence visa, Emirates ID and insurance.",
    "plan_explained": "LifeLoop prepares and files five of them, and an Amer officer releases every submission before it goes to the authority. You'll need to attend two things yourself: the consulate appointment for the child's passport, and ICP biometrics for the Emirates ID. The consulate has no status feed, so I'll ask you when the passport is issued.",
    "plan_next": "Right now: {next}. You don't need to do anything else today.",
    "plan_next_waiting_officer": "I've prepared the birth certificate filing and an officer will release it",
    "plan_next_marriage": "the birth certificate waits for your attested marriage certificate, which you can upload in the app",
    "deadline": "The legal deadline is {date}, {days} days from now.",
    # Status agent
    "status_summary": "Your case has six steps. {done} are complete. {current}",
    "status_current_entity": "{node} is with {entity}.",
    "status_current_officer": "{node} is prepared and waiting for an officer to release it.",
    "status_current_parent": "{node} is waiting for you: {action}.",
    "status_attention": "{node} needs attention: {reason}.",
    "status_complete": "Every service in your case is complete.",
    "no_action": "You don't need to take any action right now.",
    "action_needed": "One thing needs you: {action}.",
    "no_confirmed_update": "I don't have a confirmed update from the authority yet, so it isn't cleared yet.",
    "documents_needed": "Still needed: {docs}.",
    "documents_none": "No documents are outstanding right now.",
    "fee_known": "The {service} fee in my sources is {fee}. Source: {source}.",
    "fee_unknown": "I don't have a published fee for that in my sources, so I won't quote one.",
    "consulate_ask": "The consulate step has no status feed, so I'll ask you. Has the consulate passport application been submitted, or has the passport been issued?",
    "ask_passport_number_present": "That's good news. Do you have the passport number available? I won't ask you to read it out - I only record that it's available.",
    "passport_number_later": "No problem. Tell me when you have the passport number available, and I'll re-plan the visa filing then.",
    "consulate_recorded": "Thank you. I've recorded that as parent-reported: {milestone}. I won't treat it as an official status.",
    "consulate_passport_issued": "Thank you. I've recorded the passport as issued, reported by you. I'm re-planning the residence visa filing now.",
    "consulate_status_reported": "Your consulate status is parent-reported: on {date} you told me '{milestone}'. LifeLoop has no way to check it with the consulate.",
    "consulate_status_unknown": "The consulate step has no status feed, and you haven't reported a milestone yet.",
    "callback_scheduled": "I've scheduled a callback. I'll call you shortly with the latest confirmed status.",
    "no_case_transfer": "I'll make sure an Amer officer can help as soon as your case is open. Shall we continue?",
    "anything_else": "Is there anything else I can help with?",
    "fallback": "I can tell you where your case stands, what's next, or what documents are needed. What would you like to know?",
    "goodbye": "Thank you. Goodbye.",
    # Exception agent
    "opt_out_done": "Understood. I've stopped all calls for case {ref}. You'll get updates by SMS only, and you can turn calls back on in the app.",
    "transfer": "I'm transferring you now to {officer}, an officer at {org}, with your case so you won't have to repeat anything.",
    "transfer_queued": "I've asked an Amer officer to call you back about case {ref}. They will have your case in front of them.",
    "distress": "I'm sorry this is hard. I'm connecting you with a person who can help.",
    "approval_question": "I can't make or predict that decision. Only the authority's officer can. I'll connect you with an Amer officer who can explain.",
    "disputed_record": "Thank you for telling me. I won't change any record myself. I'm passing this to an Amer officer to review.",
    # Verification (callbacks / returning callers)
    "verify_intro": "Before I share case details, I need to confirm it's you. You can approve with UAE Pass on your phone, or answer two questions from your case file.",
    "verify_q_dob": "What is the child's date of birth?",
    "verify_q_hospital": "Which hospital was the child born in?",
    "verify_ok": "Thank you, you're verified.",
    "verify_retry": "That doesn't match the case file. Let's try once more.",
    "verify_failed_transfer": "I couldn't verify you, so I won't share case details. I'm passing this to an Amer officer who can help.",
    "uae_pass_sent": "I've sent a UAE Pass request to your phone. Please approve it.",
    # Callbacks
    "cb_cleared": "{node} has been cleared by {entity}.",
    "cb_completed": "{node} is complete.",
    "cb_blocked": "{node} is blocked: {reason}.",
    "cb_document_missing": "{node} needs a document: {docs}.",
    "cb_stalled": "{node} has not been cleared yet and is past the expected time. I've flagged it to an officer.",
    "cb_parent_input": "The next step is the consulate passport. It has no status feed, so I'll check in with you.",
    "cb_escalation": "An Amer officer is now reviewing your case and will contact you.",
    "cb_case_complete": "Every service in your case is complete.",
    "cb_status": "{reason}",
    "cb_biometrics": "{node} needs you: please attend ICP biometrics with the child.",
    "cb_close": "That's the update. You don't need to do anything else right now.",
    "cb_close_action": "I can explain what's needed whenever you're ready.",
    # SMS
    "sms_opt_out": "LifeLoop: calls stopped for case {ref}. You'll get updates by SMS only. Reply CALL to request a callback.",
    "sms_update": "LifeLoop case {ref}: {update} Reply CALL for a callback.",
    "sms_missed_call": "LifeLoop tried to call about case {ref}. Reply CALL to request a callback, or open the LifeLoop app.",
}


NODE_TITLES: dict[str, dict[str, str]] = {
    "en": {"BIRTH_CERTIFICATE": "Birth certificate", "MOFA_ATTESTATION": "MOFA attestation", "CONSULATE_PASSPORT": "Consulate passport",
           "RESIDENCE_VISA": "Residence visa", "EMIRATES_ID": "Emirates ID", "INSURANCE": "Insurance endorsement"},
    "ar": {"BIRTH_CERTIFICATE": "شهادة الميلاد", "MOFA_ATTESTATION": "تصديق وزارة الخارجية MOFA", "CONSULATE_PASSPORT": "جواز السفر من القنصلية",
           "RESIDENCE_VISA": "تأشيرة الإقامة", "EMIRATES_ID": "الهوية الإماراتية", "INSURANCE": "إضافة التأمين الصحي"},
    "hi": {"BIRTH_CERTIFICATE": "जन्म प्रमाण पत्र", "MOFA_ATTESTATION": "MOFA सत्यापन", "CONSULATE_PASSPORT": "वाणिज्य दूतावास पासपोर्ट",
           "RESIDENCE_VISA": "निवास वीज़ा", "EMIRATES_ID": "एमिरेट्स आईडी", "INSURANCE": "बीमा में नाम जोड़ना"},
    "ur": {"BIRTH_CERTIFICATE": "پیدائش کا سرٹیفکیٹ", "MOFA_ATTESTATION": "MOFA تصدیق", "CONSULATE_PASSPORT": "قونصل خانے کا پاسپورٹ",
           "RESIDENCE_VISA": "رہائشی ویزا", "EMIRATES_ID": "امارات آئی ڈی", "INSURANCE": "انشورنس میں اندراج"},
    "ml": {"BIRTH_CERTIFICATE": "ജനന സർട്ടിഫിക്കറ്റ്", "MOFA_ATTESTATION": "MOFA സാക്ഷ്യപ്പെടുത്തൽ", "CONSULATE_PASSPORT": "കോൺസുലേറ്റ് പാസ്‌പോർട്ട്",
           "RESIDENCE_VISA": "റെസിഡൻസ് വിസ", "EMIRATES_ID": "എമിറേറ്റ്സ് ഐഡി", "INSURANCE": "ഇൻഷുറൻസ് ചേർക്കൽ"},
    "tl": {"BIRTH_CERTIFICATE": "Birth certificate", "MOFA_ATTESTATION": "MOFA attestation", "CONSULATE_PASSPORT": "Pasaporte mula sa konsulado",
           "RESIDENCE_VISA": "Residence visa", "EMIRATES_ID": "Emirates ID", "INSURANCE": "Insurance ng bata"},
}


def node_title(key: str | None, lang: str, fallback: str = "") -> str:
    if not key:
        return fallback
    return NODE_TITLES.get(lang, NODE_TITLES["en"]).get(key) or NODE_TITLES["en"].get(key, fallback)


@lru_cache
def _table(lang: str) -> dict[str, str]:
    if lang == "en" or lang not in LANGUAGES:
        return EN
    try:
        module = importlib.import_module(f"app.core.translations.{lang}")
        return {**EN, **module.MESSAGES}
    except ModuleNotFoundError:
        return EN


def t(key: str, lang: str = "en", **kwargs: object) -> str:
    template = _table(lang).get(key) or EN[key]
    return template.format(**kwargs) if kwargs else template


def normalise_lang(lang: str | None) -> str:
    lang = (lang or "en").lower()[:2]
    return lang if lang in LANGUAGES else "en"
