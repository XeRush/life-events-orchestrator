"""Parse dates the way people say them ("20 September", "September 20th", "20/09/2026", "yesterday")."""
from __future__ import annotations

import re
from datetime import date, timedelta

MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3, "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6,
    "jul": 7, "july": 7, "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "oct": 10, "october": 10, "nov": 11,
    "november": 11, "dec": 12, "december": 12,
    # Arabic / Hindi / Urdu / Malayalam / Tagalog month names commonly used in the UAE
    "يناير": 1, "فبراير": 2, "مارس": 3, "أبريل": 4, "ابريل": 4, "مايو": 5, "يونيو": 6, "يوليو": 7, "أغسطس": 8, "اغسطس": 8,
    "سبتمبر": 9, "أكتوبر": 10, "اكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12,
    "जनवरी": 1, "फरवरी": 2, "मार्च": 3, "अप्रैल": 4, "मई": 5, "जून": 6, "जुलाई": 7, "अगस्त": 8, "सितंबर": 9, "अक्टूबर": 10,
    "नवंबर": 11, "दिसंबर": 12, "جنوری": 1, "فروری": 2, "اپریل": 4, "مئی": 5, "جون": 6, "جولائی": 7, "اگست": 8, "ستمبر": 9,
    "اکتوبر": 10, "نومبر": 11, "دسمبر": 12, "ജനുവരി": 1, "ഫെബ്രുവരി": 2, "മാർച്ച്": 3, "ഏപ്രിൽ": 4, "മേയ്": 5, "ജൂൺ": 6,
    "ജൂലൈ": 7, "ഓഗസ്റ്റ്": 8, "സെപ്റ്റംബർ": 9, "ഒക്ടോബർ": 10, "നവംബർ": 11, "ഡിസംബർ": 12, "enero": 1, "pebrero": 2,
    "marso": 3, "abril": 4, "mayo": 5, "hunyo": 6, "hulyo": 7, "agosto": 8, "setyembre": 9, "oktubre": 10, "nobyembre": 11,
    "disyembre": 12,
}
RELATIVE = {"today": 0, "yesterday": 1, "اليوم": 0, "أمس": 1, "امس": 1, "आज": 0, "कल": 1, "آج": 0, "کل": 1, "ഇന്ന്": 0,
            "ഇന്നലെ": 1, "ngayon": 0, "kahapon": 1}
_ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")


def parse_spoken_date(text: str, today: date | None = None) -> date | None:
    today = today or date.today()
    raw = (text or "").translate(_ARABIC_DIGITS).lower()
    for word, days in RELATIVE.items():
        if re.search(rf"(?<!\w){re.escape(word)}(?!\w)", raw):
            if days == 0 and "day before" in raw:
                continue
            return today - timedelta(days=days)
    iso = re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", raw)
    if iso:
        return _safe(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)))
    numeric = re.search(r"\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b", raw)
    if numeric:
        year = int(numeric.group(3)) if numeric.group(3) else today.year
        year = year + 2000 if year < 100 else year
        return _past(_safe(year, int(numeric.group(2)), int(numeric.group(1))), today, bool(numeric.group(3)))
    month = next((num for name, num in sorted(MONTHS.items(), key=lambda kv: -len(kv[0])) if name in raw), None)
    day = re.search(r"\b(\d{1,2})(?:st|nd|rd|th)?\b", raw)
    year = re.search(r"\b(20\d{2})\b", raw)
    if month and day:
        return _past(_safe(int(year.group(1)) if year else today.year, month, int(day.group(1))), today, bool(year))
    return None


def _safe(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _past(value: date | None, today: date, explicit_year: bool) -> date | None:
    """A birth date without a year that lands in the future means last year."""
    if value and not explicit_year and value > today:
        return _safe(value.year - 1, value.month, value.day)
    return value
