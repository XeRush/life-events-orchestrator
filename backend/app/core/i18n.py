"""Minimal server-side i18n for voice / callback phrasing (English + Arabic)."""

MESSAGES: dict[str, dict[str, str]] = {
    "en": {
        "ai_intro": "This is the LifeLoop assistant, an AI assistant.",
        "consent_prompt": "Congratulations. I can coordinate the services associated with this event. With your permission, I can keep you updated as each stage is completed. Would you like me to proceed?",
        "consent_declined": "No problem. I haven't created a case or contacted anyone. You can call again whenever you're ready.",
        "case_created": "Thank you. I've opened case {ref}. I'll start the first steps with the relevant authorities and call you when something important changes. You don't need to do anything right now.",
        "case_exists": "You already have an open case for this event: {ref}. I'll keep using it.",
        "no_case": "I don't have an open case for you yet. Tell me about the life event, for example a birth, and I can get started.",
        "no_confirmed_update": "I don't have a confirmed update from the relevant authority yet.",
        "defer_doc": "That's okay. I won't mark the application as complete. I'll keep the case open and contact you again when you're ready.",
        "doc_recorded": "Thank you. I've recorded {doc} and passed it to the authority. They will confirm whether it's accepted.",
        "escalated": "I've asked for a human officer to review case {ref}. They will follow up with you. I haven't changed any application.",
        "paused": "Understood. I've paused case {ref}. No new services will be started until you resume it.",
        "resumed": "Welcome back. Case {ref} is active again.",
        "fallback": "I can tell you where your case stands, what happens next, or what you need to do. What would you like to know?",
        "no_action": "You don't need to take any action right now.",
        "action_needed": "One thing needs your attention: {action}.",
        "cb_intro": "Hello, this is the LifeLoop assistant, an AI assistant, calling about case {ref}.",
        "cb_close_done": "Nothing else is needed from you right now.",
        "cb_close_action": "I can explain what's required whenever you're ready.",
        "completed_case": "Your case is complete. Every service has been confirmed by the responsible authority.",
        "cannot_complete": "I can't close the case yet, because the authorities haven't confirmed every service. I can only report what they confirm.",
    },
    "ar": {
        "ai_intro": "معك مساعد لايف لوب، مساعد يعمل بالذكاء الاصطناعي.",
        "consent_prompt": "مبروك. أستطيع تنسيق الخدمات المرتبطة بهذا الحدث. بموافقتك، سأبقيك على اطلاع مع اكتمال كل مرحلة. هل تودّ أن أتابع؟",
        "consent_declined": "لا مشكلة. لم أنشئ أي ملف ولم أتواصل مع أي جهة. يمكنك الاتصال في أي وقت.",
        "case_created": "شكراً لك. فتحت الملف رقم {ref}. سأبدأ الخطوات الأولى مع الجهات المعنية وأتصل بك عند حدوث أي تغيير مهم. لا يلزمك أي إجراء الآن.",
        "case_exists": "لديك ملف مفتوح لهذا الحدث: {ref}. سأواصل استخدامه.",
        "no_case": "ليس لديك ملف مفتوح بعد. أخبرني بالحدث، مثل ولادة، وسأبدأ.",
        "no_confirmed_update": "ليس لدي تحديث مؤكد من الجهة المختصة بعد.",
        "defer_doc": "لا بأس. لن أعتبر الطلب مكتملاً. سأبقي الملف مفتوحاً وأتواصل معك عندما تكون جاهزاً.",
        "doc_recorded": "شكراً. سجلت {doc} وأرسلته إلى الجهة. ستؤكد الجهة قبوله.",
        "escalated": "طلبت من موظف مختص مراجعة الملف {ref}. سيتواصل معك. لم أغيّر أي طلب.",
        "paused": "حسناً. أوقفت الملف {ref} مؤقتاً. لن تبدأ خدمات جديدة حتى تستأنفه.",
        "resumed": "أهلاً بعودتك. الملف {ref} نشط مجدداً.",
        "fallback": "أستطيع إخبارك بحالة ملفك أو الخطوة التالية أو ما يلزمك فعله. ماذا تود أن تعرف؟",
        "no_action": "لا يلزمك أي إجراء الآن.",
        "action_needed": "هناك أمر يحتاج انتباهك: {action}.",
        "cb_intro": "مرحباً، معك مساعد لايف لوب، مساعد بالذكاء الاصطناعي، بخصوص الملف {ref}.",
        "cb_close_done": "لا يلزمك أي شيء الآن.",
        "cb_close_action": "يمكنني شرح المطلوب متى شئت.",
        "completed_case": "اكتمل ملفك. أكدت الجهات المسؤولة جميع الخدمات.",
        "cannot_complete": "لا أستطيع إغلاق الملف بعد لأن الجهات لم تؤكد كل الخدمات.",
    },
}


def t(key: str, lang: str = "en", **kwargs: object) -> str:
    table = MESSAGES.get(lang, MESSAGES["en"])
    template = table.get(key) or MESSAGES["en"][key]
    return template.format(**kwargs) if kwargs else template


def detect_language(text: str) -> str:
    return "ar" if any("؀" <= ch <= "ۿ" for ch in text) else "en"
