// Case timeline entries, keyed "tl.<backend i18n key>". The backend stores each entry's English title plus an i18n key
// with structured params (node keys, entity codes, enum values, ISO dates). CaseTimeline renders these keys when the UI
// language is not English; the English UI keeps showing the backend's own title and description, unchanged.
// "<key>.desc" is an optional localised description. Placeholders must stay identical in every language.
const timeline = {
  // --- case lifecycle -------------------------------------------------------------------------------------------
  "tl.timeline.caseCreated": "Case {ref} opened",
  "tl.timeline.caseCreated.desc": "New baby, born {date} in {emirate}. Reported by {channel}.",
  "tl.timeline.graphBuilt": "Six-step task graph built",
  "tl.timeline.graphBuilt.desc": "Birth certificate, MOFA attestation, consulate passport, residence visa, Emirates ID, insurance.",
  "tl.timeline.caseCompleted": "Case complete",
  "tl.timeline.caseCompleted.desc": "Every service in the case has been cleared or completed.",

  // --- consent and opt-out --------------------------------------------------------------------------------------
  "tl.timeline.consent": "Consent captured: {type}",
  "tl.timeline.consentRevoked": "Consent withdrawn: {type}",
  "tl.timeline.optOutRequested": "Request to stop calls received",
  "tl.timeline.optOutCompleted": "Calls stopped - case switched to SMS-only",
  "tl.timeline.optOutCompleted.desc": "Pending callbacks cancelled: {count}. Updates continue by SMS and in the app.",
  "tl.timeline.optInRestored": "Voice callbacks turned back on",
  "tl.timeline.optInRestored.desc": "A fresh callback consent was recorded.",

  // --- verification ---------------------------------------------------------------------------------------------
  "tl.timeline.verified": "Caller verified",
  "tl.timeline.verified.desc": "Method: {method}",
  "tl.timeline.verificationFailed": "Verification failed (attempt {attempt})",

  // --- documents ------------------------------------------------------------------------------------------------
  "tl.timeline.documentUploaded": "{doc} uploaded",
  "tl.timeline.documentUploaded.desc": "Uploaded; not yet checked by an officer.",
  "tl.timeline.documentVerified": "{doc} checked by an officer",
  "tl.timeline.documentVerified.desc": "Checked by a LifeLoop officer. The issuing authority makes its own determination.",
  "tl.timeline.documentsRequested": "Officer requested: {docs}",

  // --- officer gate and escalations ----------------------------------------------------------------------------
  "tl.timeline.officerApproved": "{node} released by an Amer officer",
  "tl.timeline.officerRejected": "{node} not released by the Amer officer",
  "tl.timeline.caseTransferred": "Case transferred to another Amer officer",
  "tl.timeline.escalated": "Handed to an Amer officer: {reason}",
  "tl.timeline.escalationResolved": "Escalation resolved by an Amer officer: {reason}",

  // --- calls and callbacks --------------------------------------------------------------------------------------
  "tl.timeline.callStarted": "Call with LifeLoop started",
  "tl.timeline.callStarted.desc": "Language: {language}. The AI disclosure was given first.",
  "tl.timeline.callStartedPhone": "Phone call to the life-event line",
  "tl.timeline.callStartedPhone.desc": "Telephone call: the caller must verify before case details are shared.",
  "tl.timeline.callEnded": "Call ended ({seconds}s)",
  "tl.timeline.callTransferred": "Call warm-transferred to an Amer officer",
  "tl.timeline.callTransferred.desc": "The officer receives the case, the transcript and the reason, so nothing has to be repeated.",
  "tl.timeline.postCallProcessed": "Call record added to the case",
  "tl.timeline.postCallProcessed.desc": "Transcript, consent evidence and extracted fields written to the case.",
  "tl.timeline.callbackScheduled": "Callback scheduled: {cbReason}",
  "tl.timeline.callbackDialed": "LifeLoop is placing a callback",
  "tl.timeline.callbackCompleted": "Update given by voice call",
  "tl.timeline.callbackNoAnswer": "Callback not answered - SMS sent",
  "tl.timeline.callbackBlocked.OPTED_OUT": "Call not placed - calls are switched off; SMS sent",
  "tl.timeline.callbackBlocked.NO_CONSENT": "Call not placed - no callback consent",
  "tl.timeline.callbacksCancelled": "Pending callbacks cancelled: {count}",

  // --- step (node) transitions ----------------------------------------------------------------------------------
  "tl.node.PENDING": "{node} waiting for an earlier step",
  "tl.node.READY": "{node} ready to prepare",
  "tl.node.WAITING_FOR_HUMAN": "{node} prepared - awaiting officer release",
  "tl.node.SUBMITTING": "{node} released for filing with {entity} (mock)",
  "tl.node.SUBMITTED": "{node} request submitted to {entity} (mock)",
  "tl.node.PROCESSING": "{node} being processed by {entity} (mock)",
  "tl.node.CLEARED": "{node} cleared by {entity} (mock)",
  "tl.node.COMPLETED": "{node} completed by {entity} (mock)",
  "tl.node.BLOCKED": "{node} blocked",
  "tl.node.DOCUMENT_MISSING": "{node}: document missing",
  "tl.node.DOCUMENT_MISSING.desc": "Needed: {docs}",
  "tl.node.STALLED": "{node} stalled - not cleared yet",
  "tl.node.WAITING_FOR_PARENT": "{node} waiting for you",
  "staff.tl.node.WAITING_FOR_PARENT": "{node} waiting for the parent",
  "tl.node.REJECTED": "{node} not approved by {entity} (mock)",
  "tl.node.PROCESSING.PARENT_REPORTED": "{node}: application in progress (parent-reported)",
  "tl.node.STALLED.PARENT_REPORTED": "{node}: parent reports no progress",
  "tl.node.COMPLETED.PARENT_REPORTED": "{node} reported as issued (parent-reported)",

  // --- consulate milestones (parent-reported; the consulate has no API) -----------------------------------------
  "tl.consulate.APPOINTMENT_BOOKED": "Parent reported: consulate appointment booked",
  "tl.consulate.APPLICATION_SUBMITTED": "Parent reported: passport application submitted at the consulate",
  "tl.consulate.PASSPORT_ISSUED": "Parent reported: passport issued",
  "tl.consulate.DELAYED": "Parent reported: no progress at the consulate",
  "tl.consulate.desc": "Recorded as parent-reported. LifeLoop cannot verify consulate status.",

  // --- vocabulary for params ------------------------------------------------------------------------------------
  "tl.entity.DHA": "DHA",
  "tl.entity.MOHAP": "MOHAP",
  "tl.entity.DOH": "DOH",
  "tl.entity.MOFA": "MOFA",
  "tl.entity.CONSULATE": "the consulate",
  "tl.entity.GDRFA": "GDRFA-Dubai",
  "tl.entity.ICP": "ICP",
  "tl.entity.INSURER": "the insurer",

  "tl.consentType.DATA_PROCESSING": "data processing",
  "tl.consentType.SERVICE_FILING": "service filing",
  "tl.consentType.CALLBACK": "callbacks",

  "tl.reason.TWO_FAILED_VERIFICATIONS": "two failed verifications",
  "tl.reason.SLA_STALL": "stalled past its expected time",
  "tl.reason.CONSULATE_STALL": "consulate step stalled",
  "tl.reason.DISTRESS": "the caller needed support",
  "tl.reason.APPROVAL_QUESTION": "question about an approval decision",
  "tl.reason.DISPUTED_RECORD": "disputed record",
  "tl.reason.RESIDENT_REQUEST": "the resident asked for a person",
  "tl.reason.ENTITY_REJECTION": "the authority did not approve",
  "tl.reason.OFFICER_REFERRAL": "officer referral",

  "tl.cbReason.CLEARED": "a step cleared",
  "tl.cbReason.COMPLETED": "a step completed",
  "tl.cbReason.BLOCKED": "a step is blocked",
  "tl.cbReason.DOCUMENT_MISSING": "a document is missing",
  "tl.cbReason.STALLED": "a step stalled",
  "tl.cbReason.HUMAN_ESCALATION": "handed to an Amer officer",
  "tl.cbReason.PARENT_INPUT": "the parent's input is needed",
  "tl.cbReason.CASE_COMPLETE": "case complete",
  "tl.cbReason.STATUS": "status update",
  "tl.cbReason.BIOMETRICS": "biometrics appointment",

  "tl.method.UAE_PASS": "UAE Pass (simulated)",
  "tl.method.KNOWLEDGE_FACTS": "two facts from the case file",

  "tl.channel.VOICE": "voice call",
  "tl.channel.WEB": "web form",
};

export default timeline;
