# Multilingual design

Canvas box A lists six languages: Arabic (Modern Standard Arabic and Gulf), English, Hindi, Urdu, Malayalam and
Tagalog. These cover the largest expatriate parent groups in Dubai and the Emirati officers who serve them.

| Code | Language | Script direction | ElevenLabs language code | Notes |
|---|---|---|---|---|
| `en` | English | LTR | `en` | Master phrasebook; default |
| `ar` | Arabic | **RTL** | `ar` | Modern Standard Arabic by default; the agent mirrors Gulf Arabic when the caller uses it |
| `hi` | Hindi | LTR | `hi` | |
| `ur` | Urdu | **RTL** | `ur` | |
| `ml` | Malayalam | LTR | `ml` | |
| `tl` | Tagalog | LTR | **`fil`** | LifeLoop uses `tl`; the ElevenLabs preset is keyed `fil` (Filipino) |

The list is defined once (`LANGUAGES` and `RTL_LANGUAGES` in [`config.py`](../../backend/app/core/config.py)) and
reused by the API, the phrasebook, the ElevenLabs config and the frontend's language picker.

## Choosing and changing the language

- The disclosure asks "Would you like to continue in English or Arabic?" (canvas box I step 1). The LANGUAGE node
  accepts any of the six languages by name in several scripts ("Arabic", "عربي", "اردو", "Tagalog", "Filipino",
  "हिंदी", "മലയാളം", ...).
- A caller can switch at any time: `POST /api/v1/agent/calls/{id}/language` (the console's language control), or by
  asking. The new language is written to the call, the agent session and the case, so callbacks and SMS follow it.
- A case remembers its language. Callbacks are composed and dialled in the case language; the callback disclosure is
  in that language.

## Language-aware routing

Language changes the words, not the rules. Every sub-agent and guardrail works the same in all six languages:

| Concern | How it is language-aware |
|---|---|
| Intent detection (simulated channel) | [`nlu.py`](../../backend/app/agents/dialog/nlu.py) holds a lexicon per intent in all six languages and in Gulf Arabic usage: yes/no ("ايوه", "زين", "opo", "sige"), stop calling ("لا تتصل", "कॉल मत", "huwag nang tumawag"), distress, approval questions, disputes, consulate milestones, emirates and nationalities. Phrases match on word boundaries in every script: two-letter tokens such as "مب" (Gulf "no") must be whole words, so they never fire inside "نمبر" (number); Arabic phrases may carry a proclitic ("الموافقة", "والجواز"); a bare honorific ("جی", "जी", "po") counts as yes only when nothing else in the reply says yes or no, so "جی نہیں" is a no. The frontend's quick-reply chips in all six languages are checked against this lexicon |
| Exception handling | "Stop calling", distress and approval questions are recognised in every language before any other intent |
| Fixed utterances | The disclosure, the plan, callback scripts and SMS texts come from the phrasebook by key, never from free generation |
| Verification | Hospital matching ignores the word "hospital" in each language ("مستشفى", "अस्पताल", "ہسپتال", "ആശുപത്രി", "ospital") |
| Guardrail evaluator | Approval words, negations, attributions ("you told me", "أخبرتني", "sinabi mo") and transfer markers in all six languages, so `INVENTED_APPROVAL` and `ESCALATION_MISSED` work beyond English |
| Language check | `WRONG_LANGUAGE` checks that agent turns after the opening exchange are in the expected script for Arabic, Urdu, Hindi and Malayalam |

## Phrasebook

[`backend/app/core/i18n.py`](../../backend/app/core/i18n.py) holds every server-side utterance by key, with English as
the master. The other five languages live in [`backend/app/core/translations/`](../../backend/app/core/translations/)
(`ar.py`, `hi.py`, `ur.py`, `ml.py`, `tl.py`), one `MESSAGES` dictionary per language covering all 83 keys: the
disclosure and callback disclosure, intake questions, the plan, status sentences, consulate questions, verification,
transfer and opt-out confirmations, callback scripts and SMS texts. Arabic is written in plain Modern Standard Arabic
(government-service register). Template parameters (`{ref}`, `{node}`, `{date}`) are filled after translation. A key
missing from a module would fall back to English, so a partial translation never produces an empty utterance; a test
checks that no key is missing.

What the agent speaks in the caller's language:

| Item | How |
|---|---|
| Fixed utterances | `t(key, lang)` from the phrasebook |
| Step names ("birth certificate", "residence visa", ...) | `NODE_TITLES` / `node_title()` in `i18n.py`, used in status sentences and callback scripts (for example "شهادة الميلاد" in Arabic, "जन्म प्रमाण पत्र" in Hindi, "رہائشی ویزا" in Urdu, "Pasaporte mula sa konsulado" in Tagalog) |
| Language names | Spoken natively when the language is confirmed ("العربية", "हिन्दी", "اردو", "മലയാളം", "Tagalog") |
| Authority names | Kept as proper names (DHA, MOFA, GDRFA-Dubai, ICP) |

## ElevenLabs language presets

`build_agent_config` ([`agent.py`](../../backend/app/integrations/elevenlabs/agent.py)) adds one language preset per
non-English language. Each preset overrides the agent's `language` and `first_message`, so the disclosure is spoken
in the chosen language:

```python
ELEVENLABS_LANG = {"en": "en", "ar": "ar", "hi": "hi", "ur": "ur", "ml": "ml", "tl": "fil"}
presets = {ELEVENLABS_LANG[lang]: {"overrides": {"agent": {"first_message": t("disclosure", lang),
                                                           "language": ELEVENLABS_LANG[lang]}}}
           for lang in LANGUAGES if lang != "en"}
```

The system prompt tells the agent to speak the caller's chosen language for the whole call, use Modern Standard
Arabic by default and mirror Gulf Arabic if the caller uses it, and switch when the caller switches. Scribe v2 (STT)
and Eleven v3 (TTS) receive the language code where the API accepts one (`/api/v1/agent/stt?language=`,
`/api/v1/agent/tts` body `language`).

## Frontend

The web app uses LifeLoop's own i18n (no library) with the same six languages. Arabic and Urdu switch the layout to
right-to-left. The API always returns state names (`CLEARED`, `PARENT_REPORTED`, ...) rather than translated text, so
a translation changes the label a resident reads, never what a state means.

Text the API composes about a step is phrased in the reader's language when the request carries `?lang=`
(`GET /cases/{ref}`, `/cases/{ref}/graph`, `/cases/{ref}/documents`). It comes from
[`workflows/step_text.py`](../../backend/app/workflows/step_text.py), whose English is taken from the workflow template
itself: the next action ("لدى GDRFA-Dubai - سيتصل بك LifeLoop عند حدوث أي تغيير"), what LifeLoop and the parent do,
the expected timing, the fee note, the consulate milestone labels, the passport fields shared with each authority, the
legal-deadline source and the document disclaimer. For a reader in another language the node's status line is the
state phrased for residents, with the mock marker kept ("(تجريبي - محاكاة)"); in English it stays the stored line, which
is often the (mock) authority's own wording. The stored English never changes, so officer screens and the audit trail
read exactly as recorded. `tests/test_localisation.py` checks that every key has all five translations with matching
placeholders and that the case view, graph and documents follow the reader's language. In-app and SMS notification
titles use the same table in the case language; their bodies come from the phrasebook.

Timeline entries keep their English `title` and `description` for officers and the audit trail, and also carry an
`i18n` key with coded parameters (node keys, authority codes, document types, counts; never free text or PII). In
another language the timeline renders `tl.<key>` from
[`frontend/src/i18n/en/timeline.ts`](../../frontend/src/i18n/en/timeline.ts) and its five translations, turning codes
into words. When no localised description exists it shows none rather than the English one.
`tests/test_timeline_i18n.py` checks that the major events carry a key and that every parameter is a code.

## Testing

- The must-PASS scenario `multilingual` runs a full Arabic intake through the real dialog engine ("العربية",
  "نعم، ولدت بنتي أمس", "عائشة", "دبي", "مستشفى لطيفة", ...) and passes only if a case is created and the evaluator
  finds no violation, including the `WRONG_LANGUAGE` check on every agent reply after the opening exchange.
- `test_translations_cover_every_key_and_keep_the_disclosure` checks, for each of ar, hi, ur, ml and tl, that every
  English key exists, that the placeholders match, and that both disclosures still state that LifeLoop is an AI
  agent and that the call is recorded (`contains_disclosure`).

Both run with `make agent-test`. See [Agent Testing](testing.md).

## Related

- [Sub-agents](sub-agents.md)
- [Guardrails](guardrails.md)
- [ElevenLabs](../integrations/elevenlabs.md)

[Documentation index](../README.md)
