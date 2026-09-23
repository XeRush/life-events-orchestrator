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
    node("MARRIAGE_REPORTED", "Marriage Reported", "Marriage reported by the resident.", None, None, [], system=True),
    node("MARRIAGE_REGISTRATION", "Marriage Registration", "Register the marriage.", None, None, ["MARRIAGE_REPORTED"]),
    node("MARRIAGE_CERTIFICATE", "Marriage Certificate", "Issue the marriage certificate.", None, None, ["MARRIAGE_REGISTRATION"]),
    node("RECORD_UPDATES", "Record Updates", "Update civil and identity records.", None, None, ["MARRIAGE_CERTIFICATE"]),
    node("CASE_COMPLETE", "Case Complete", "All services confirmed.", None, None, ["RECORD_UPDATES"], system=True),
]

MOVE_NODES: list[Node] = [
    node("MOVE_REPORTED", "Move Reported", "Move reported by the resident.", None, None, [], system=True),
    node("ADDRESS_UPDATE", "Address Update", "Update the registered address.", None, None, ["MOVE_REPORTED"]),
    node("IDENTITY_UPDATE", "Identity Record Update", "Reflect the new address on identity records.", None, None, ["ADDRESS_UPDATE"]),
    node("UTILITIES", "Utilities Transfer", "Transfer utilities to the new address.", None, None, ["ADDRESS_UPDATE"]),
    node("CASE_COMPLETE", "Case Complete", "All services confirmed.", None, None, ["IDENTITY_UPDATE", "UTILITIES"], system=True),
]

BUSINESS_NODES: list[Node] = [
    node("BUSINESS_REPORTED", "Business Start Reported", "Business start reported by the resident.", None, None, [], system=True),
    node("TRADE_NAME", "Trade Name Reservation", "Reserve a trade name.", None, None, ["BUSINESS_REPORTED"]),
    node("LICENSE", "Business License", "Issue the business license.", None, None, ["TRADE_NAME"]),
    node("TAX_REGISTRATION", "Tax Registration", "Register for tax.", None, None, ["LICENSE"]),
    node("CASE_COMPLETE", "Case Complete", "All services confirmed.", None, None, ["TAX_REGISTRATION"], system=True),
]

LIFE_EVENTS: list[dict[str, Any]] = [
    {"code": "BIRTH", "name": "Birth", "case_title": "New Baby", "icon": "baby", "configured": True,
     "description": "A child is born: registration, certificate, identity and health cover.", "nodes": BIRTH_NODES},
    {"code": "MARRIAGE", "name": "Marriage", "case_title": "Marriage", "icon": "heart", "configured": False,
     "description": "Workflow definition only - not connected to authorities in this prototype.", "nodes": MARRIAGE_NODES},
    {"code": "MOVE", "name": "Moving", "case_title": "Moving Home", "icon": "home", "configured": False,
     "description": "Workflow definition only - not connected to authorities in this prototype.", "nodes": MOVE_NODES},
    {"code": "BUSINESS_START", "name": "Starting a business", "case_title": "New Business", "icon": "briefcase", "configured": False,
     "description": "Workflow definition only - not connected to authorities in this prototype.", "nodes": BUSINESS_NODES},
]
