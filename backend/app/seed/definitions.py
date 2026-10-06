"""Static reference data: life-event templates and their workflow graphs."""
from typing import Any

# Node tuple: key, name, description, entity_code|None, service_code|None, is_system, config, depends_on
Node = dict[str, Any]


def node(key: str, name: str, description: str, entity: str | None, service: str | None, deps: list[str], *,
         system: bool = False, **config: Any) -> Node:
    return {"key": key, "name": name, "description": description, "entity": entity, "service": service,
            "deps": deps, "system": system, "config": config}


BIRTH_NODES: list[Node] = [
    node("BIRTH_REPORTED", "Birth Reported", "The resident reported the birth and consented to coordination.", None, None, [], system=True),
    node("BIRTH_REGISTRATION", "Birth Registration", "Register the birth in the civil register.", "BIRTH_REGISTRATION", "BIRTH_REGISTRATION",
         ["BIRTH_REPORTED"], started_label="Birth registration initiated", completed_label="Birth registration completed"),
    node("BIRTH_CERTIFICATE", "Birth Certificate", "Issue the official birth certificate.", "BIRTH_REGISTRATION", "BIRTH_CERTIFICATE",
         ["BIRTH_REGISTRATION"], started_label="Birth certificate requested", completed_label="Birth certificate issued"),
    node("IDENTITY_PROCESS", "Identity Process", "Identity record for the newborn.", "IDENTITY", "IDENTITY_APPLICATION",
         ["BIRTH_CERTIFICATE"], started_label="Identity process initiated", completed_label="Identity process completed",
         max_attempts=2,
         alternative={"key": "IDENTITY_MANUAL_REVIEW", "name": "Identity Manual Review", "service_code": "IDENTITY_MANUAL_REVIEW",
                      "description": "Officer-led review path used when the standard application cannot proceed."}),
    node("HEALTH_PROCESS", "Health & Insurance", "Health cover enrolment for the child.", "HEALTH", "HEALTH_ENROLMENT",
         ["BIRTH_CERTIFICATE"], started_label="Health insurance enrolment initiated", completed_label="Health insurance enrolment completed"),
    node("ADDITIONAL_SERVICES", "Additional Services", "Authority-run family services review once identity is confirmed.", "ADDITIONAL_SERVICES",
         "FAMILY_SERVICES_REVIEW", ["IDENTITY_PROCESS"], started_label="Additional services review initiated",
         completed_label="Additional services review completed"),
    node("CASE_COMPLETE", "Case Complete", "All required services confirmed by their authorities.", None, None,
         ["HEALTH_PROCESS", "ADDITIONAL_SERVICES"], system=True),
]

MARRIAGE_NODES: list[Node] = [
    node("MARRIAGE_REPORTED", "Marriage Reported", "The resident reported the marriage and consented to coordination.", None, None, [], system=True),
    node("MARRIAGE_REGISTRATION", "Marriage Registration", "Register the marriage in the civil register.", "MARRIAGE_REGISTRY", "MARRIAGE_REGISTRATION",
         ["MARRIAGE_REPORTED"], started_label="Marriage registration initiated", completed_label="Marriage registration completed"),
    node("MARRIAGE_CERTIFICATE", "Marriage Certificate", "Issue the official marriage certificate.", "MARRIAGE_REGISTRY", "MARRIAGE_CERTIFICATE",
         ["MARRIAGE_REGISTRATION"], started_label="Marriage certificate requested", completed_label="Marriage certificate issued"),
    node("RECORD_UPDATES", "Record Updates", "Update civil status records to reflect the marriage.", "CIVIL_RECORDS", "RECORD_UPDATE",
         ["MARRIAGE_CERTIFICATE"], started_label="Civil record update initiated", completed_label="Civil records updated"),
    node("CASE_COMPLETE", "Case Complete", "All required services confirmed by their authorities.", None, None, ["RECORD_UPDATES"], system=True),
]

MOVE_NODES: list[Node] = [
    node("MOVE_REPORTED", "Move Reported", "The resident reported the move and consented to coordination.", None, None, [], system=True),
    node("ADDRESS_UPDATE", "Address Update", "Update the registered address.", "ADDRESS_REGISTRY", "ADDRESS_UPDATE",
         ["MOVE_REPORTED"], started_label="Address update initiated", completed_label="Registered address updated"),
    node("IDENTITY_UPDATE", "Identity Record Update", "Reflect the new address on the identity record.", "IDENTITY", "IDENTITY_RECORD_UPDATE",
         ["ADDRESS_UPDATE"], started_label="Identity record update initiated", completed_label="Identity record updated"),
    node("UTILITIES", "Utilities Transfer", "Transfer utilities to the new address.", "UTILITIES", "UTILITY_TRANSFER",
         ["ADDRESS_UPDATE"], started_label="Utilities transfer initiated", completed_label="Utilities transferred"),
    node("CASE_COMPLETE", "Case Complete", "All required services confirmed by their authorities.", None, None,
         ["IDENTITY_UPDATE", "UTILITIES"], system=True),
]

BUSINESS_NODES: list[Node] = [
    node("BUSINESS_REPORTED", "Business Start Reported", "The resident reported the new business and consented to coordination.", None, None, [], system=True),
    node("TRADE_NAME", "Trade Name Reservation", "Reserve the trade name.", "COMMERCE_REGISTRY", "TRADE_NAME_RESERVATION",
         ["BUSINESS_REPORTED"], started_label="Trade name reservation initiated", completed_label="Trade name reserved"),
    node("LICENSE", "Business License", "Issue the business licence.", "COMMERCE_REGISTRY", "BUSINESS_LICENSE",
         ["TRADE_NAME"], started_label="Business licence application initiated", completed_label="Business licence issued"),
    node("TAX_REGISTRATION", "Tax Registration", "Register the business for tax.", "TAX", "TAX_REGISTRATION",
         ["LICENSE"], started_label="Tax registration initiated", completed_label="Tax registration completed"),
    node("CASE_COMPLETE", "Case Complete", "All required services confirmed by their authorities.", None, None,
         ["TAX_REGISTRATION"], system=True),
]

LIFE_EVENTS: list[dict[str, Any]] = [
    {"code": "BIRTH", "name": "Birth", "case_title": "New Baby", "icon": "baby", "configured": True,
     "description": "A child is born: registration, certificate, identity and health cover.", "nodes": BIRTH_NODES},
    {"code": "MARRIAGE", "name": "Marriage", "case_title": "Marriage", "icon": "heart", "configured": True,
     "description": "A marriage is registered, the certificate issued and civil records updated.", "nodes": MARRIAGE_NODES},
    {"code": "MOVE", "name": "Moving", "case_title": "Moving Home", "icon": "home", "configured": True,
     "description": "A move is reflected in the registered address, identity record and utilities.", "nodes": MOVE_NODES},
    {"code": "BUSINESS_START", "name": "Starting a business", "case_title": "New Business", "icon": "briefcase", "configured": True,
     "description": "A new business gets its trade name, licence and tax registration.", "nodes": BUSINESS_NODES},
]
