"""Turns a case snapshot into calm, factual language. Only states what the backend knows."""
from typing import Any

from app.core.i18n import t

NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]


def word(n: int) -> str:
    return NUMBER_WORDS[n] if 0 <= n < len(NUMBER_WORDS) else str(n)


def cap(text: str) -> str:
    return text[:1].upper() + text[1:]


def case_summary_text(snapshot: dict[str, Any], lang: str = "en") -> str:
    total = snapshot["progress"]["total"]
    done = snapshot["progress"]["completed"]
    action = snapshot["pending_actions"][0]["action"] if snapshot["pending_actions"] else None

    if lang == "ar":
        parts = [f"ملفك يتضمن {total} مراحل، اكتمل منها {done}."]
        parts.append(t("action_needed", lang, action=action) if action else t("no_action", lang))
        return " ".join(parts)

    parts = [f"Your case has {word(total)} stage{'s' if total != 1 else ''}."]
    if done == total and total:
        parts.append("All of them are complete.")
    elif done == 0:
        parts.append("None are complete yet.")
    else:
        parts.append(f"{cap(word(done))} {'is' if done == 1 else 'are'} complete.")

    with_authority = snapshot["with_authority"]
    waiting_resident = snapshot["waiting_on_resident"]
    upcoming = snapshot["upcoming_count"]
    if with_authority:
        names = sorted({s["entity"] for s in with_authority if s["entity"]})
        n = len(with_authority)
        where = " and ".join(names) if len(names) <= 2 else ", ".join(names[:-1]) + f" and {names[-1]}"
        sentence = f"{cap(word(n))} {'is' if n == 1 else 'are'} currently with the {where}" if len(names) == 1 else (
            f"{cap(word(n))} {'is' if n == 1 else 'are'} currently with the authorities ({where})"
        )
        if upcoming:
            sentence += f", and {word(upcoming)} will begin after {'that' if n == 1 else 'those'}"
        parts.append(sentence + ".")
    elif waiting_resident:
        n = len(waiting_resident)
        sentence = f"{cap(word(n))} {'is' if n == 1 else 'are'} on hold until you provide something"
        if upcoming:
            sentence += f", and {word(upcoming)} will begin after that"
        parts.append(sentence + ".")
    elif upcoming and not done == total:
        parts.append(f"{cap(word(upcoming))} will begin shortly.")

    parts.append(t("action_needed", lang, action=action) if action else t("no_action", lang))
    return " ".join(parts)
