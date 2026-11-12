# ============================================================
# pipeline/normalizer.py
# ============================================================
#
# Unified Job Normalizer
#
# Sources:
#   - LinkedIn
#   - Naukri
#
# Responsibilities:
#   1. Clean scraper output
#   2. Normalize locations
#   3. Normalize education
#   4. Normalize experience
#   5. Normalize common fields
#   6. Create UnifiedJob objects
#   7. Prevent location-field contamination
#
# Run:
#
#   python pipeline\normalizer.py
#
# OR:
#
#   python -m pipeline.normalizer
#
# ============================================================

from __future__ import annotations

import hashlib
import html
import re
import sys

from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


# ============================================================
# PROJECT IMPORT
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from pipeline.errors import DataValidationError
from pipeline.schema import UnifiedJob


# ============================================================
# CONSTANTS
# ============================================================

NOT_SPECIFIED = "Not Specified"


# ============================================================
# INDIAN STATES / UNION TERRITORIES
# ============================================================

INDIAN_STATES = [
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
    "Delhi",
    "Jammu and Kashmir",
    "Ladakh",
    "Puducherry",
    "Chandigarh",
    "Andaman and Nicobar Islands",
    "Dadra and Nagar Haveli and Daman and Diu",
    "Lakshadweep",
]

INDIAN_CITY_TO_STATE = {
    "Ahmedabad": "Gujarat",
    "Bengaluru": "Karnataka",
    "Bangalore": "Karnataka",
    "Bhubaneswar": "Odisha",
    "Chennai": "Tamil Nadu",
    "Coimbatore": "Tamil Nadu",
    "Delhi": "Delhi",
    "Faridabad": "Haryana",
    "Gurgaon": "Haryana",
    "Gurugram": "Haryana",
    "Hyderabad": "Telangana",
    "Jaipur": "Rajasthan",
    "Kolkata": "West Bengal",
    "Lucknow": "Uttar Pradesh",
    "Mumbai": "Maharashtra",
    "Noida": "Uttar Pradesh",
    "Pune": "Maharashtra",
    "Ranchi": "Jharkhand",
    "Visakhapatnam": "Andhra Pradesh",
}

STATE_ABBR_MAP: Dict[str, str] = {
    "KA": "Karnataka",
    "TN": "Tamil Nadu",
    "MH": "Maharashtra",
    "DL": "Delhi",
    "TG": "Telangana",
    "TS": "Telangana",
    "HR": "Haryana",
    "UP": "Uttar Pradesh",
    "WB": "West Bengal",
    "GJ": "Gujarat",
    "KL": "Kerala",
    "AP": "Andhra Pradesh",
    "MP": "Madhya Pradesh",
    "RJ": "Rajasthan",
    "PB": "Punjab",
    "OR": "Odisha",
    "OD": "Odisha",
    "CH": "Chandigarh",
    "JH": "Jharkhand",
    "UT": "Uttarakhand",
    "UK": "Uttarakhand",
    "AS": "Assam",
    "BR": "Bihar",
    "GA": "Goa",
    "HP": "Himachal Pradesh",
    "JK": "Jammu and Kashmir",
    "PY": "Puducherry",
    "TR": "Tripura",
    "ML": "Meghalaya",
    "MN": "Manipur",
    "NL": "Nagaland",
    "MZ": "Mizoram",
    "AR": "Arunachal Pradesh",
    "SK": "Sikkim",
    "CG": "Chhattisgarh",
}


# ============================================================
# GENERIC CLEANING
# ============================================================

def _clean(value: Any) -> str:
    """
    Convert any value to a normalized string.
    """

    if value is None:
        return ""

    text = str(value)

    text = text.replace(
        "\xa0",
        " ",
    )

    text = re.sub(
        r"\s+",
        " ",
        text,
    )

    return text.strip()


def _strip_html(value: Any) -> str:
    text = str(value or "")
    text = re.sub(
        r"<\s*/?\s*(?:br|p|div|li|ul|ol|section|article|h[1-6])\b[^>]*>",
        " ",
        text,
        flags=re.I,
    )
    text = re.sub(
        r"<[^>]*>",
        "",
        text,
    )
    return _clean(html.unescape(text))


def _first_value(
    data: Dict[str, Any],
    *keys: str,
    default: str = "",
) -> str:
    """
    Return the first non-empty value.
    """

    for key in keys:

        value = data.get(key)

        if value is None:
            continue

        value = _clean(value)

        if value:
            return value

    return default


def _not_specified(value: Any) -> str:
    """
    Convert empty values to Not Specified.
    """

    value = _clean(value)

    if not value:
        return NOT_SPECIFIED

    return value


# ============================================================
# METADATA CLEANING
# ============================================================

def _clean_metadata_text(
    value: Any,
) -> str:
    """
    Remove scraper metadata accidentally attached to values.

    Examples:

        Mumbai 48 minutes ago
        Pune 7 minutes ago
        India 29 minutes ago 46 applicants
        See who you know
    """

    text = _clean(value)

    if not text:
        return ""

    # --------------------------------------------------------
    # Relative posted time
    # --------------------------------------------------------

    text = re.sub(
        r"\s+\d+\s*"
        r"(?:minute|minutes|min|mins|"
        r"hour|hours|day|days|week|weeks)"
        r"\s+ago.*$",
        "",
        text,
        flags=re.I,
    )

    # --------------------------------------------------------
    # Applicant count
    # --------------------------------------------------------

    text = re.sub(
        r"\s+\d+\+?\s+applicants?.*$",
        "",
        text,
        flags=re.I,
    )

    # --------------------------------------------------------
    # LinkedIn metadata
    # --------------------------------------------------------

    text = re.sub(
        r"\s+See who.*$",
        "",
        text,
        flags=re.I,
    )

    text = re.sub(
        r"\s+has hired for this role.*$",
        "",
        text,
        flags=re.I,
    )

    return _clean(text)


# ============================================================
# STATE MATCHING
# ============================================================

def _match_known_state(
    value: str,
) -> Optional[str]:
    """
    Match an exact value against a known Indian state or abbreviation.
    """

    value = _clean(value)

    if not value:
        return None

    # Check abbreviations (e.g. KA -> Karnataka, TN -> Tamil Nadu)
    val_upper = value.upper().strip()
    if val_upper in STATE_ABBR_MAP:
        return STATE_ABBR_MAP[val_upper]

    for state in sorted(
        INDIAN_STATES,
        key=len,
        reverse=True,
    ):

        if value.lower() == state.lower():
            return state

    return None


# ============================================================
# INDIA SUFFIX NORMALIZATION
# ============================================================

def _normalize_india_suffix(
    text: str,
) -> str:
    """
    Repair malformed location strings.

    Examples:

        TelanganaIndia
        KarnatakaIndia
        Hyderabad, TelanganaIndia

    into:

        Telangana, India
        Karnataka, India
        Hyderabad, Telangana, India
    """

    text = _clean(text)

    if not text:
        return ""

    # Already correct.
    if re.search(
        r",\s*India$",
        text,
        flags=re.I,
    ):
        return text

    # --------------------------------------------------------
    # Find known state immediately followed by India.
    # --------------------------------------------------------

    for state in sorted(
        INDIAN_STATES,
        key=len,
        reverse=True,
    ):

        pattern = (
            r"^(.*?)"
            r"(?:,\s*)?"
            + re.escape(state)
            + r"India$"
        )

        match = re.match(
            pattern,
            text,
            flags=re.I,
        )

        if not match:
            continue

        prefix = _clean(
            match.group(1)
        )

        prefix = prefix.rstrip(
            " ,"
        ).strip()

        if prefix:
            return (
                f"{prefix}, "
                f"{state}, India"
            )

        return f"{state}, India"

    return text


# ============================================================
# LOCATION SPLITTER
# ============================================================

def _split_location_parts(
    location: str,
) -> Tuple[str, str, str]:
    """
    Convert a complete location into:

        city
        state
        country

    Examples:

        Bengaluru, Karnataka, India

        ->
        Bengaluru
        Karnataka
        India

        Tamil Nadu, India

        ->
        Not Specified
        Tamil Nadu
        India
    """

    location = _clean_metadata_text(
        location
    )

    if not location:

        return (
            NOT_SPECIFIED,
            NOT_SPECIFIED,
            NOT_SPECIFIED,
        )

    location = _normalize_india_suffix(
        location
    )

    parts = [
        _clean(part)
        for part in location.split(",")
        if _clean(part)
    ]

    if not parts:

        return (
            NOT_SPECIFIED,
            NOT_SPECIFIED,
            NOT_SPECIFIED,
        )

    # --------------------------------------------------------
    # COUNTRY
    # --------------------------------------------------------

    country = NOT_SPECIFIED

    if (
        parts
        and parts[-1].lower() == "india"
    ):

        country = "India"

        parts = parts[:-1]

    # --------------------------------------------------------
    # STATE
    # --------------------------------------------------------

    state = NOT_SPECIFIED

    if parts:

        matched_state = _match_known_state(
            parts[-1]
        )

        if matched_state:

            state = matched_state

            parts = parts[:-1]

    # --------------------------------------------------------
    # CITY
    # --------------------------------------------------------

    city = ", ".join(
        parts
    ).strip()

    if not city:
        city = NOT_SPECIFIED

    if state == NOT_SPECIFIED and city != NOT_SPECIFIED:
        inferred_state = INDIAN_CITY_TO_STATE.get(city)
        if inferred_state:
            state = inferred_state

    if (
        country == NOT_SPECIFIED
        or country == ""
    ) and city != NOT_SPECIFIED:
        country = "India"

    return (
        city,
        state,
        country,
    )


# ============================================================
# SEPARATE LOCATION FIELD NORMALIZATION
# ============================================================

def _normalize_separate_location_fields(
    city_value: Any,
    state_value: Any,
    country_value: Any,
) -> Tuple[str, str, str]:
    """
    Normalize already-separated fields.

    Important contamination cases:

        country = "Haryana, India"

    becomes:

        state   = "Haryana"
        country = "India"

    Also:

        state = "Telangana, India"

    becomes:

        state   = "Telangana"
        country = "India"
    """

    city = _clean_metadata_text(
        city_value
    )

    state = _clean_metadata_text(
        state_value
    )

    country = _clean_metadata_text(
        country_value
    )

    # --------------------------------------------------------
    # COUNTRY FIELD
    # --------------------------------------------------------

    country_parts = [
        _clean(part)
        for part in country.split(",")
        if _clean(part)
    ]

    if country_parts:

        if (
            country_parts[-1].lower()
            == "india"
        ):

            if len(country_parts) >= 2:

                possible_state = (
                    _match_known_state(
                        country_parts[-2]
                    )
                )

                if possible_state:

                    if (
                        not state
                        or state.lower()
                        == NOT_SPECIFIED.lower()
                    ):
                        state = possible_state

            country = "India"

    # --------------------------------------------------------
    # STATE FIELD
    # --------------------------------------------------------

    state = _normalize_india_suffix(
        state
    )

    state_parts = [
        _clean(part)
        for part in state.split(",")
        if _clean(part)
    ]

    if state_parts:

        possible_state = _match_known_state(
            state_parts[0]
        )

        if possible_state:

            state = possible_state

            if any(
                part.lower() == "india"
                for part in state_parts[1:]
            ):

                country = "India"

    # --------------------------------------------------------
    # COUNTRY CANONICALIZATION
    # --------------------------------------------------------

    if re.search(
        r"\bindia\b",
        country,
        flags=re.I,
    ):

        country = "India"

    # --------------------------------------------------------
    # COUNTRY MUST NOT CONTAIN A STATE
    # --------------------------------------------------------

    if (
        country
        and country.lower() != "india"
    ):

        possible_state = _match_known_state(
            country
        )

        if possible_state:

            if (
                not state
                or state.lower()
                == NOT_SPECIFIED.lower()
            ):
                state = possible_state

            country = NOT_SPECIFIED

    # --------------------------------------------------------
    # CITY / STATE ABBREVIATION RESOLUTION
    # --------------------------------------------------------
    # If city is actually an Indian state code (e.g. KA, TN, HR) or state name
    city_as_state = _match_known_state(city)
    if city_as_state:
        if not state or state.lower() == NOT_SPECIFIED.lower():
            state = city_as_state
        city = NOT_SPECIFIED
    elif (not state or state.lower() == NOT_SPECIFIED.lower()) and city and city != NOT_SPECIFIED:
        # Check if city maps to known state (e.g. Bengaluru -> Karnataka)
        inferred_state = INDIAN_CITY_TO_STATE.get(city)
        if inferred_state:
            state = inferred_state

    # Check if state itself is an abbreviation (e.g. KA -> Karnataka)
    if state:
        matched_state = _match_known_state(state)
        if matched_state:
            state = matched_state

    # --------------------------------------------------------
    # FINAL VALUES
    # --------------------------------------------------------

    return (
        _not_specified(city),
        _not_specified(state),
        _not_specified(country),
    )


# ============================================================
# LINKEDIN METADATA CHECK
# ============================================================

def _looks_like_linkedin_metadata(
    value: str,
) -> bool:

    value = _clean(value)

    if not value:
        return False

    patterns = [

        r"\b\d+\s*minutes?\s*ago\b",

        r"\b\d+\s*hours?\s*ago\b",

        r"\b\d+\s*days?\s*ago\b",

        r"\b\d+\+?\s*applicants?\b",

        r"\bsee who\b",

        r"\bhas hired for this role\b",
    ]

    return any(
        re.search(
            pattern,
            value,
            flags=re.I,
        )
        for pattern in patterns
    )


# ============================================================
# LINKEDIN LOCATION CLEANER
# ============================================================

def _clean_linkedin_location(
    location: Any,
) -> str:

    location = _clean(location)

    if not location:
        return ""

    location = re.sub(
        r"\s+\d+\s*"
        r"(?:minute|minutes|min|mins|"
        r"hour|hours|day|days|week|weeks)"
        r"\s+ago.*$",
        "",
        location,
        flags=re.I,
    )

    location = re.sub(
        r"\s+\d+\+?\s+applicants?.*$",
        "",
        location,
        flags=re.I,
    )

    location = re.sub(
        r"\s+See who.*$",
        "",
        location,
        flags=re.I,
    )

    location = re.sub(
        r"\s+has hired for this role.*$",
        "",
        location,
        flags=re.I,
    )

    return _clean(location)


# ============================================================
# LINKEDIN LOCATION NORMALIZATION
# ============================================================

def _normalize_linkedin_location(
    raw_job: Dict[str, Any],
) -> Tuple[str, str, str]:

    # --------------------------------------------------------
    # PRIMARY LOCATION
    # --------------------------------------------------------

    location = _first_value(
        raw_job,
        "location",
        "job_location",
        "locations",
        default="",
    )

    location = _clean_linkedin_location(
        location
    )

    if location:

        if not _looks_like_linkedin_metadata(
            location
        ):

            return _split_location_parts(
                location
            )

    # --------------------------------------------------------
    # FALLBACK: SEPARATE FIELDS
    # --------------------------------------------------------

    city = _clean_metadata_text(
        raw_job.get("city")
    )

    state = _clean_metadata_text(
        raw_job.get("state")
    )

    country = _clean_metadata_text(
        raw_job.get("country")
    )

    city, state, country = (
        _normalize_separate_location_fields(
            city,
            state,
            country,
        )
    )

    # --------------------------------------------------------
    # COMPANY PREFIX PROTECTION
    # --------------------------------------------------------

    company = _first_value(
        raw_job,
        "company",
        "company_name",
        default="",
    )

    if (
        city != NOT_SPECIFIED
        and company
    ):

        company_clean = re.sub(
            r"[^A-Za-z0-9]+",
            " ",
            company,
        ).strip().lower()

        city_clean = re.sub(
            r"[^A-Za-z0-9]+",
            " ",
            city,
        ).strip()

        if city_clean.lower().startswith(
            company_clean + " "
        ):

            city = city_clean[
                len(company_clean):
            ].strip()

    return (
        _not_specified(city),
        _not_specified(state),
        _not_specified(country),
    )


# ============================================================
# NAUKRI LOCATION NORMALIZATION
# ============================================================

def _normalize_naukri_location(
    raw_job: Dict[str, Any],
) -> Tuple[str, str, str]:

    location = _first_value(
        raw_job,
        "location",
        "job_location",
        "locations",
        default="",
    )

    location = _clean(
        location
    )

    # --------------------------------------------------------
    # If complete location is unavailable,
    # reconstruct from separate fields.
    # --------------------------------------------------------

    if not location:

        city, state, country = (
            _normalize_separate_location_fields(
                raw_job.get("city"),
                raw_job.get("state"),
                raw_job.get("country"),
            )
        )

        if city != NOT_SPECIFIED:

            location = city

            if state != NOT_SPECIFIED:

                location += (
                    f", {state}"
                )

            if country != NOT_SPECIFIED:

                location += (
                    f", {country}"
                )

        elif state != NOT_SPECIFIED:

            location = state

            if country != NOT_SPECIFIED:

                location += (
                    f", {country}"
                )

        elif country != NOT_SPECIFIED:

            location = country

    location = _normalize_india_suffix(
        location
    )

    if not location:

        return (
            NOT_SPECIFIED,
            NOT_SPECIFIED,
            NOT_SPECIFIED,
        )

    return _split_location_parts(
        location
    )


# ============================================================
# EDUCATION NORMALIZATION
# ============================================================

def _normalize_education(
    value: Any,
) -> str:
    r"""
    Normalize education values.

    Examples:

        B\. ?E\., Bachelor(?:'s)?, degree

    becomes:

        B.E., Bachelor's, degree
    """

    text = _clean(value)

    if not text:
        return NOT_SPECIFIED

    # --------------------------------------------------------
    # Regex-style escaped optional dots
    # --------------------------------------------------------

    text = re.sub(
        r"\\?\.\?",
        ".",
        text,
    )

    # --------------------------------------------------------
    # Escaped dots
    # --------------------------------------------------------

    text = text.replace(
        r"\.",
        ".",
    )

    # --------------------------------------------------------
    # Optional Bachelor's / Master's regex
    # --------------------------------------------------------

    text = re.sub(
        r"Bachelor\s*\(\?:['’]s\)\?",
        "Bachelor",
        text,
        flags=re.I,
    )

    text = re.sub(
        r"Master\s*\(\?:['’]s\)\?",
        "Master",
        text,
        flags=re.I,
    )

    # --------------------------------------------------------
    # Remove remaining non-capturing groups
    # --------------------------------------------------------

    text = re.sub(
        r"\(\?:([^)]*)\)",
        r"\1",
        text,
    )

    # --------------------------------------------------------
    # Remove regex question marks
    # --------------------------------------------------------

    text = text.replace(
        "?",
        "",
    )

    # --------------------------------------------------------
    # Normalize spaces around dots
    # --------------------------------------------------------

    text = re.sub(
        r"\s*\.\s*",
        ".",
        text,
    )

    # --------------------------------------------------------
    # Common degree abbreviations
    # --------------------------------------------------------

    degree_patterns = [

        (
            r"\bB\s*\.?\s*E\s*\.?\b",
            "B.E.",
        ),

        (
            r"\bM\s*\.?\s*E\s*\.?\b",
            "M.E.",
        ),

        (
            r"\bB\s*\.?\s*Tech\s*\.?\b",
            "B.Tech",
        ),

        (
            r"\bM\s*\.?\s*Tech\s*\.?\b",
            "M.Tech",
        ),

        (
            r"\bB\s*\.?\s*Sc\s*\.?\b",
            "B.Sc.",
        ),

        (
            r"\bM\s*\.?\s*Sc\s*\.?\b",
            "M.Sc.",
        ),

        (
            r"\bB\s*\.?\s*Com\s*\.?\b",
            "B.Com.",
        ),

        (
            r"\bM\s*\.?\s*Com\s*\.?\b",
            "M.Com.",
        ),

        (
            r"\bB\s*\.?\s*A\s*\.?\b",
            "B.A.",
        ),

        (
            r"\bM\s*\.?\s*A\s*\.?\b",
            "M.A.",
        ),

        (
            r"\bPh\s*\.?\s*D\s*\.?\b",
            "Ph.D.",
        ),
    ]

    for pattern, replacement in degree_patterns:

        text = re.sub(
            pattern,
            replacement,
            text,
            flags=re.I,
        )

    # --------------------------------------------------------
    # Bachelor's / Master's
    # --------------------------------------------------------

    text = re.sub(
        r"\bBachelor(?:'s)?\b",
        "Bachelor's",
        text,
        flags=re.I,
    )

    text = re.sub(
        r"\bMaster(?:'s)?\b",
        "Master's",
        text,
        flags=re.I,
    )

    # --------------------------------------------------------
    # Cleanup punctuation
    # --------------------------------------------------------

    text = re.sub(
        r"\.{2,}",
        ".",
        text,
    )

    text = re.sub(
        r",\s*,+",
        ",",
        text,
    )

    text = re.sub(
        r"\s+",
        " ",
        text,
    )

    text = re.sub(
        r"(?:,\s*\bdegree\b\s*$|^\s*degree\s*$)",
        "",
        text,
        flags=re.I,
    )

    return _clean(
        text
    ) or NOT_SPECIFIED


# ============================================================
# EXPERIENCE NORMALIZATION
# ============================================================

def _clean_experience(
    value: Any,
) -> str:
    """
    Normalize experience values.

    Examples:

        2 years
        2+ years
        2 - 5 years
        2 to 5 years
    """

    text = _clean(value)

    if not text:
        return NOT_SPECIFIED

    # --------------------------------------------------------
    # Remove years / year
    # --------------------------------------------------------

    text = re.sub(
        r"\byears?\b",
        "",
        text,
        flags=re.I,
    )

    text = re.sub(
        r"\byrs?\b",
        "",
        text,
        flags=re.I,
    )

    text = _clean(
        text
    )

    if not re.fullmatch(
        r"\d+(?:\.\d+)?",
        text,
    ):
        return NOT_SPECIFIED

    try:
        numeric_value = float(text)
    except ValueError:
        return NOT_SPECIFIED

    if numeric_value > 100:
        return NOT_SPECIFIED

    return text or NOT_SPECIFIED


def _experience_is_non_role_context(
    text: str,
    start: int,
    end: int,
) -> bool:

    prefix = text[max(0, start - 80):start].lower()
    suffix = text[end:end + 80].lower()

    if re.search(
        r"(?:over|more than|nearly|almost)\s*$",
        prefix,
    ):
        return True

    if re.search(
        r"(?:company|organization|business|industry|founded|established)"
        r"[^.]{0,60}$",
        prefix,
    ):
        return True

    if re.match(
        r"\s+(?:in|with|using|on|of\s+education|full\s+time)\b",
        suffix,
    ):
        return True

    return False


# ============================================================
# EXPERIENCE FROM TEXT
# ============================================================

def _parse_experience_text(
    text: Any,
) -> Optional[Tuple[str, str]]:
    """
    Extract experience directly from text.

    Supported examples:

        2-5 years
        2 to 5 years
        2+ years
        minimum 3 years
        min 3 years
        at least 3 years
        3 years of experience
        3 yrs of experience
        experience: 3 years
        6 months of experience
        fresher
    """

    text = _clean(text)

    if not text:
        return None

    text_lower = text.lower()

    number = r"\d+(?:\.\d+)?"

    # --------------------------------------------------------
    # Fresher
    # --------------------------------------------------------

    if re.search(r"\bfreshers?\b", text_lower, flags=re.I) and not re.search(
        rf"\b({number})\s*(?:-|to|â€“|â€”|–|—)\s*({number})\s*(?:years?|yrs?)\b",
        text_lower,
        flags=re.I,
    ):

        return (
            "0",
            "0",
        )

    # --------------------------------------------------------
    # X - Y years
    # --------------------------------------------------------

    match = re.search(
        rf"\b({number})\s*"
        rf"(?:-|–|—|to)\s*"
        rf"({number})\s*"
        rf"(?:years?|yrs?)\b",
        text_lower,
        flags=re.I,
    )

    if match and not _experience_is_non_role_context(
        text_lower,
        match.start(1),
        match.end(0),
    ):

        return (
            match.group(1),
            match.group(2),
        )

    # --------------------------------------------------------
    # X+ years
    # --------------------------------------------------------

    match = re.search(
        rf"\b({number})\s*\+\s*"
        rf"(?:years?|yrs?)\b",
        text_lower,
        flags=re.I,
    )

    if match and not _experience_is_non_role_context(
        text_lower,
        match.start(1),
        match.end(0),
    ):

        return (
            match.group(1),
            NOT_SPECIFIED,
        )

    # --------------------------------------------------------
    # Minimum / Min / At least X years
    # --------------------------------------------------------

    match = re.search(
        rf"\b(?:minimum|min|at\s+least)\s+(?:of\s+)?"
        rf"({number})\s*"
        rf"(?:years?|yrs?)\b",
        text_lower,
        flags=re.I,
    )

    if match and not _experience_is_non_role_context(
        text_lower,
        match.start(1),
        match.end(0),
    ):

        return (
            match.group(1),
            NOT_SPECIFIED,
        )

    # --------------------------------------------------------
    # X years of experience
    # --------------------------------------------------------

    match = re.search(
        rf"\b({number})\s*"
        rf"(?:years?|yrs?)\s+"
        rf"(?:of\s+)?experience\b",
        text_lower,
        flags=re.I,
    )

    if match and not _experience_is_non_role_context(
        text_lower,
        match.start(1),
        match.end(0),
    ):

        value = match.group(1)

        if float(value) > 100:
            return None

        return (
            value,
            NOT_SPECIFIED,
        )

    # --------------------------------------------------------
    # Overall experience of X years
    # --------------------------------------------------------

    match = re.search(
        rf"\boverall\s+experience\s+(?:of\s+)?"
        rf"({number})\s*(?:years?|yrs?)\b",
        text_lower,
        flags=re.I,
    )

    if match and not _experience_is_non_role_context(
        text_lower,
        match.start(1),
        match.end(0),
    ):

        value = match.group(1)

        if float(value) <= 100:
            return (
                value,
                value,
            )

    # --------------------------------------------------------
    # Experience: X years
    # --------------------------------------------------------

    match = re.search(
        rf"\bexperience\s*"
        rf"(?:required\s*)?"
        rf"[:=-]\s*"
        rf"({number})\s*"
        rf"(?:years?|yrs?)\b",
        text_lower,
        flags=re.I,
    )

    if match and not _experience_is_non_role_context(
        text_lower,
        match.start(1),
        match.end(0),
    ):

        value = match.group(1)

        if float(value) > 100:
            return None

        return (
            value,
            NOT_SPECIFIED,
        )

    # --------------------------------------------------------
    # X months of experience
    # --------------------------------------------------------

    match = re.search(
        rf"\b({number})\s*"
        rf"(?:months?|mos?)\s+"
        rf"(?:of\s+)?experience\b",
        text_lower,
        flags=re.I,
    )

    if match and not _experience_is_non_role_context(
        text_lower,
        match.start(1),
        match.end(0),
    ):

        months = float(
            match.group(1)
        )

        years = months / 12

        years_text = (
            str(int(years))
            if years.is_integer()
            else str(round(years, 2))
        )

        return (
            years_text,
            NOT_SPECIFIED,
        )

    # --------------------------------------------------------
    # X months experience required
    # --------------------------------------------------------

    match = re.search(
        rf"\b({number})\s*"
        rf"(?:months?|mos?)\s+"
        rf"(?:experience|required|exp)\b",
        text_lower,
        flags=re.I,
    )

    if match and not _experience_is_non_role_context(
        text_lower,
        match.start(1),
        match.end(0),
    ):

        months = float(
            match.group(1)
        )

        years = months / 12

        years_text = (
            str(int(years))
            if years.is_integer()
            else str(round(years, 2))
        )

        return (
            years_text,
            NOT_SPECIFIED,
        )

    # --------------------------------------------------------
    # Standalone X years
    # --------------------------------------------------------

    match = re.search(
        rf"\b({number})\s*(?:years?|yrs?)\b"
        rf"(?!\s+(?:of\s+)?(?:relevant\s+)?experience\b)",
        text_lower,
        flags=re.I,
    )

    if match and not _experience_is_non_role_context(
        text_lower,
        match.start(1),
        match.end(0),
    ):

        value = match.group(1)

        if float(value) <= 100:
            return (
                value,
                NOT_SPECIFIED,
            )

    return None


# ============================================================
# EXPERIENCE RANGE
# ============================================================

def _extract_experience_range(
    raw_job: Dict[str, Any],
    full_description: Any = "",
) -> Tuple[str, str]:
    """
    Extract minimum and maximum experience.
    """
    # 1. NAUKRI URL RANGE (canonical recruiter specification)
    link = _first_value(raw_job, "link", "url", "job_url", default="")
    url_match = re.search(r"(?:-|/)(\d+)-to-(\d+)-years?(?:-|/|$)", link, flags=re.I)
    if url_match:
        return (url_match.group(1), url_match.group(2))

    # 2. CLEAR OVERALL EXPERIENCE IN DESCRIPTION
    description_result = _parse_experience_text(full_description)
    if description_result:
        return description_result

    # 3. EXPLICIT STRUCTURED/SOURCE EXPERIENCE
    minimum = _first_value(
        raw_job,
        "min_experience_years",
        "min_experience",
        "experience_min",
        default="",
    )
    maximum = _first_value(
        raw_job,
        "max_experience_years",
        "max_experience",
        "experience_max",
        default="",
    )
    if minimum or maximum:
        cleaned_minimum = _clean_experience(minimum)
        cleaned_maximum = _clean_experience(maximum)
        if (
            cleaned_minimum != NOT_SPECIFIED
            or cleaned_maximum != NOT_SPECIFIED
        ):
            return (cleaned_minimum, cleaned_maximum)

    # 4. COMBINED FIELD (experience)
    combined = _first_value(
        raw_job,
        "experience",
        "experience_required",
        default="",
    )
    if combined:
        single_m = re.match(
            r"^\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\s*$",
            combined,
            flags=re.I,
        )
        if single_m:
            return (single_m.group(1), single_m.group(1))

        combined_result = _parse_experience_text(combined)
        if combined_result:
            return combined_result

        if combined.strip().lower() not in {"not specified", "none", "n/a", ""}:
            return (combined.strip(), combined.strip())

    return (NOT_SPECIFIED, NOT_SPECIFIED)


def _experience_review_reason(
    raw_job: Dict[str, Any],
    description: str,
    minimum: str,
    maximum: str,
) -> str:
    """Return a review note when experience wording is unclear or conflicts."""
    text = _clean(description).lower()
    if not text:
        return ""

    # Multiple experience figures often mix overall requirements with
    # skill-specific or preferred requirements; avoid silently choosing one.
    mentions = list(re.finditer(
        r"\b\d+(?:\.\d+)?\s*(?:\+\s*)?(?:years?|yrs?|months?)\b",
        text,
        flags=re.I,
    ))
    if len(mentions) > 1:
        return "Review: multiple experience figures in description"

    # A bare duration does not say whether it is an exact range or minimum.
    if mentions and not re.search(
        r"(?:\d+(?:\.\d+)?\s*\+|\d+(?:\.\d+)?\s*(?:-|to|–|—)\s*\d+|\b(?:at\s+least|minimum|min\.?)\b)",
        text,
        flags=re.I,
    ):
        return "Review: experience duration has no explicit bound"

    source_min = _clean_experience(_first_value(
        raw_job, "min_experience_years", "min_experience", "experience_min", default=""
    ))
    source_max = _clean_experience(_first_value(
        raw_job, "max_experience_years", "max_experience", "experience_max", default=""
    ))
    if source_min != NOT_SPECIFIED and source_max != NOT_SPECIFIED:
        try:
            if float(source_min) > float(source_max):
                return "Review: minimum experience exceeds maximum"
        except ValueError:
            return "Review: malformed structured experience range"

    description_range = _parse_experience_text(description)
    link = _first_value(raw_job, "link", "url", "job_url", default="")
    url_match = re.search(
        r"(?:-|/)(\d+)-to-(\d+)-years?(?:-|/|$)", link, flags=re.I
    )
    if description_range and url_match and description_range != url_match.groups():
        return "Review: URL experience range conflicts with description"

    if description_range and source_min != NOT_SPECIFIED:
        if source_min != description_range[0] or (
            source_max != NOT_SPECIFIED and source_max != description_range[1]
        ):
            return "Review: structured experience conflicts with description"

    return ""


# ============================================================
# JOB ID FALLBACK
# ============================================================

def _fallback_job_id(
    source: str,
    raw_job: Dict[str, Any],
) -> str:
    """
    Generate deterministic job ID when scraper did not provide one.
    """

    source_clean = _clean(
        source
    ).lower()

    title = _first_value(
        raw_job,
        "title",
        "job_title",
        default="",
    )

    company = _first_value(
        raw_job,
        "company",
        "company_name",
        default="",
    )

    location = _first_value(
        raw_job,
        "location",
        "job_location",
        default="",
    )

    link = _first_value(
        raw_job,
        "link",
        "url",
        "job_url",
        default="",
    )

    # Strip transient tracking query params from URLs for deterministic stable IDs across runs
    clean_link = link.split("?")[0].rstrip("/").lower() if link else ""
    if clean_link:
        base = f"{source_clean}|{clean_link}"
    else:
        base = "|".join(
            [
                source_clean,
                title.strip().lower(),
                company.strip().lower(),
                location.strip().lower(),
            ]
        )

    digest = hashlib.sha256(
        base.encode(
            "utf-8"
        )
    ).hexdigest()[:16]

    prefix = (
        "linkedin"
        if "linkedin" in source_clean
        else
        "naukri"
        if "naukri" in source_clean
        else
        source_clean or "job"
    )

    return (
        f"{prefix}_{digest}"
    )


# ============================================================
# SKILLS FROM FREE TEXT
# ============================================================

_SKILLS_LABEL_PATTERN = re.compile(
    r"(?:preferred|required|key|desired|must[\s-]?have)?"
    r"\s*skills?\s*[:\-]\s*(.+)",
    re.IGNORECASE,
)


def _extract_skills_from_text(
    text: str,
) -> str:
    """
    Best-effort fallback: pull a skills list out of free text
    like "Preferred Skills: Python, SQL, Power BI" when the
    scraper couldn't find a dedicated skills element on the
    job card.
    """

    text = _clean(text)

    if not text:
        return NOT_SPECIFIED

    match = _SKILLS_LABEL_PATTERN.search(
        text
    )

    if not match:
        return NOT_SPECIFIED

    extracted = match.group(1).strip()

    # Stop at the first line break or sentence-ending period
    # followed by a capital letter, so we don't swallow the
    # rest of an unrelated paragraph.
    extracted = re.split(
        r"[\n\r]|\.\s+(?=[A-Z])",
        extracted,
        maxsplit=1,
    )[0].strip(" .")

    return extracted or NOT_SPECIFIED


# ============================================================
# COMMON FIELD EXTRACTION
# ============================================================

def _extract_common_fields(
    raw_job: Dict[str, Any],
) -> Dict[str, str]:
    """
    Extract common fields before creating UnifiedJob.

    search_keyword carries the keyword that was searched for
    when this job was found (e.g. "data analyst"), so the
    unified dataset can be filtered/grouped by search term.

    Experience is extracted primarily from full_description.
    """

    source = _first_value(
        raw_job,
        "source",
        default="Unknown",
    )

    title = _first_value(
        raw_job,
        "title",
        "job_title",
        "Job Title",
        default=NOT_SPECIFIED,
    )

    company = _first_value(
        raw_job,
        "company",
        "company_name",
        "Company Name",
        default=NOT_SPECIFIED,
    )

    # --------------------------------------------------------
    # SEARCH KEYWORD
    #
    # The keyword that produced this job (e.g. "data analyst"),
    # attached by the scraper/orchestrator adaptation step.
    # --------------------------------------------------------

    search_keyword = _first_value(
        raw_job,
        "search_keyword",
        "search_keywords",
        "keyword",
        "query",
        default=NOT_SPECIFIED,
    )

    job_id = _first_value(
        raw_job,
        "job_id",
        "id",
        "jobId",
        default="",
    )

    if not job_id:

        job_id = _fallback_job_id(
            source,
            raw_job,
        )

    skills = _first_value(
        raw_job,
        "skills",
        "skill",
        "required_skills",
        default=NOT_SPECIFIED,
    )

    degree_required = _normalize_education(
        _first_value(
            raw_job,
            "degree_required",
            "education",
            "qualification",
            "Education",
            "qualifications_education_required",
            default="",
        )
    )

    specialization_required = _first_value(
        raw_job,
        "specialization_required",
        "specialization",
        default=NOT_SPECIFIED,
    )

    collected_at = _first_value(
        raw_job,
        "collected_at",
        default="",
    )

    if not collected_at:

        collected_at = (
            datetime.now(
                timezone.utc
            ).isoformat()
        )

    link = _first_value(
        raw_job,
        "link",
        "url",
        "job_url",
        "Job URL",
        default=NOT_SPECIFIED,
    )

    # --------------------------------------------------------
    # FULL DESCRIPTION
    # --------------------------------------------------------

    full_description = _first_value(
        raw_job,
        "full_description",
        "description",
        "job_description",
        "Job Description",
        default=NOT_SPECIFIED,
    )

    full_description = _strip_html(
        full_description
    )

    # --------------------------------------------------------
    # EXPERIENCE FROM FULL DESCRIPTION
    # --------------------------------------------------------

    minimum, maximum = (
        _extract_experience_range(
            raw_job,
            full_description,
        )
    )
    experience_review = _experience_review_reason(
        raw_job,
        full_description,
        minimum,
        maximum,
    )

    # --------------------------------------------------------
    # SKILLS FALLBACK
    #
    # The scraper reads skills from dedicated "skill chip"
    # elements on the job card. Not every posting renders
    # skills that way — some only mention them inline in the
    # description (e.g. "Preferred Skills: Python, SQL").
    # When the structured extraction found nothing, fall back
    # to pulling them out of the description text.
    # --------------------------------------------------------

    if skills == NOT_SPECIFIED:

        skills = _extract_skills_from_text(
            full_description
        )

    return {
        "job_id": job_id,
        "source": _not_specified(source),
        "title": _not_specified(title),
        "company": _not_specified(company),
        "search_keyword": _not_specified(
            search_keyword
        ),
        "min_experience_years": minimum,
        "max_experience_years": maximum,
        "experience_review": experience_review,
        "skills": _not_specified(skills),
        "degree_required": degree_required,
        "specialization_required": (
            _not_specified(
                specialization_required
            )
        ),
        "collected_at": _not_specified(
            collected_at
        ),
        "link": _not_specified(link),
        "full_description": (
            _not_specified(
                full_description
            )
        ),
    }


# ============================================================
# LINKEDIN NORMALIZER
# ============================================================

def normalize_linkedin_job(
    raw_job: Dict[str, Any],
) -> UnifiedJob:

    if "link" in raw_job and not _clean(raw_job["link"]):
        raise DataValidationError("LinkedIn", "link", "missing job link")

    if "title" in raw_job and not _clean(raw_job["title"]):
        raise DataValidationError("LinkedIn", "title", "missing job title")

    if "source" not in raw_job:
        raw_job = dict(raw_job, source="LinkedIn")

    fields = _extract_common_fields(
        raw_job
    )

    city, state, country = (
        _normalize_linkedin_location(
            raw_job
        )
    )

    return UnifiedJob(

        job_id=fields[
            "job_id"
        ],

        source="LinkedIn",

        title=fields[
            "title"
        ],

        company=fields[
            "company"
        ],

        search_keyword=fields[
            "search_keyword"
        ],

        city=city,

        state=state,

        country=country,

        min_experience_years=fields[
            "min_experience_years"
        ],

        max_experience_years=fields[
            "max_experience_years"
        ],

        experience_review=fields["experience_review"],

        skills=fields[
            "skills"
        ],

        degree_required=fields[
            "degree_required"
        ],

        specialization_required=fields[
            "specialization_required"
        ],

        collected_at=fields[
            "collected_at"
        ],

        link=fields[
            "link"
        ],

        full_description=fields[
            "full_description"
        ],
    )


# ============================================================
# NAUKRI NORMALIZER
# ============================================================

def normalize_naukri_job(
    raw_job: Dict[str, Any],
) -> UnifiedJob:

    if "url" in raw_job and not _clean(raw_job["url"]):
        raise DataValidationError("Naukri", "url", "missing job url")

    if "title" in raw_job and not _clean(raw_job["title"]):
        raise DataValidationError("Naukri", "title", "missing job title")

    if "source" not in raw_job:
        raw_job = dict(raw_job, source="Naukri")

    fields = _extract_common_fields(
        raw_job
    )

    if fields["title"].strip().lower() in {
        "",
        "not specified",
        "job description",
        "job details",
        "about the role",
        "about the job",
        "job summary",
        "key responsibilities",
    }:

        link = fields["link"]
        slug = link.split("?", 1)[0].rstrip("/").rsplit("/", 1)[-1]
        slug = re.sub(
            r"^job-listings-",
            "",
            slug,
            flags=re.I,
        )
        slug = re.sub(
            r"-\d+-to-\d+-years?-\d+$",
            "",
            slug,
            flags=re.I,
        )
        company_slug = re.sub(
            r"[^a-z0-9]+",
            "-",
            fields["company"].lower(),
        ).strip("-")
        title_slug = slug

        if company_slug:
            company_match = re.search(
                rf"(?:^|-){re.escape(company_slug)}(?:-|$)",
                slug,
            )
            if company_match:
                title_slug = slug[:company_match.start()].strip("-")

        if title_slug == slug:
            locations = re.split(
                r"[,/]",
                _first_value(
                    raw_job,
                    "location",
                    "job_location",
                    "locations",
                    default="",
                ),
            )
            for location in locations:
                location_slug = re.sub(
                    r"[^a-z0-9]+",
                    "-",
                    location.lower(),
                ).strip("-")
                if not location_slug:
                    continue
                location_match = re.search(
                    rf"(?:^|-){re.escape(location_slug)}(?:-|$)",
                    slug,
                )
                if location_match:
                    title_slug = slug[:location_match.start()].strip("-")
                    break

        fields["title"] = title_slug.replace("-", " ").strip() or NOT_SPECIFIED

    city, state, country = (
        _normalize_naukri_location(
            raw_job
        )
    )

    return UnifiedJob(

        job_id=fields[
            "job_id"
        ],

        source="Naukri",

        title=fields[
            "title"
        ],

        company=fields[
            "company"
        ],

        search_keyword=fields[
            "search_keyword"
        ],

        city=city,

        state=state,

        country=country,

        min_experience_years=fields[
            "min_experience_years"
        ],

        max_experience_years=fields[
            "max_experience_years"
        ],

        experience_review=fields["experience_review"],

        skills=fields[
            "skills"
        ],

        degree_required=fields[
            "degree_required"
        ],

        specialization_required=fields[
            "specialization_required"
        ],

        collected_at=fields[
            "collected_at"
        ],

        link=fields[
            "link"
        ],

        full_description=fields[
            "full_description"
        ],
    )


# ============================================================
# GENERIC NORMALIZATION
# ============================================================

def normalize(
    source_or_raw: Any,
    raw_job: Optional[Dict[str, Any]] = None,
) -> UnifiedJob:
    if raw_job is not None:
        source_name = str(source_or_raw).strip()
        data = dict(raw_job)
        data["source"] = source_name
        source_clean = source_name.lower()
        if "linkedin" in source_clean:
            return normalize_linkedin_job(data)
        if "naukri" in source_clean:
            return normalize_naukri_job(data)
        raise DataValidationError(source_name, "source", f"Unsupported source '{source_name}'")

    data = dict(source_or_raw)
    source = _first_value(data, "source", default="").lower()

    if "linkedin" in source:
        return normalize_linkedin_job(data)

    if "naukri" in source:
        return normalize_naukri_job(data)

    if "indeed" in source:
        fields = _extract_common_fields(data)
        city, state, country = _normalize_linkedin_location(data)
        return UnifiedJob(
            job_id=fields["job_id"],
            source="Indeed",
            title=fields["title"],
            company=fields["company"],
            search_keyword=fields["search_keyword"],
            city=city,
            state=state,
            country=country,
            min_experience_years=fields["min_experience_years"],
            max_experience_years=fields["max_experience_years"],
            experience_review=fields["experience_review"],
            skills=fields["skills"],
            degree_required=fields["degree_required"],
            specialization_required=fields["specialization_required"],
            collected_at=fields["collected_at"],
            link=fields["link"],
            full_description=fields["full_description"],
        )

    raise DataValidationError(source or "unknown", "source", f"Unsupported source '{source}'")


# ============================================================
# BATCH NORMALIZATION
# ============================================================

def normalize_batch(
    raw_jobs: Iterable[Dict[str, Any]],
) -> List[UnifiedJob]:

    normalized = []

    for raw_job in raw_jobs:

        try:

            normalized.append(
                normalize(
                    raw_job
                )
            )

        except Exception as exc:

            print(
                "[NORMALIZER WARNING] "
                f"Failed to normalize job: {exc}"
            )

    return normalized


# ============================================================
# CSV ROW
# ============================================================

def to_csv_row(
    job: UnifiedJob,
) -> Dict[str, Any]:

    data = asdict(
        job
    )

    return {
        key: (
            NOT_SPECIFIED
            if value is None
            or str(value).strip() == ""
            else value
        )
        for key, value in data.items()
    }


# ============================================================
# TEST ASSERTION
# ============================================================

def _assert_equal(
    actual,
    expected,
    label: str,
):

    if actual != expected:

        raise AssertionError(
            f"{label}\n"
            f"Expected: {expected}\n"
            f"Actual  : {actual}"
        )


# ============================================================
# LOCATION TESTS
# ============================================================

def _run_location_tests():

    print()
    print("-" * 70)
    print("LOCATION TESTS")
    print("-" * 70)

    tests = [

        (
            "Bengaluru, Karnataka, India",
            (
                "Bengaluru",
                "Karnataka",
                "India",
            ),
        ),

        (
            "Hyderabad, Telangana, India",
            (
                "Hyderabad",
                "Telangana",
                "India",
            ),
        ),

        (
            "Kolkata, West Bengal, India",
            (
                "Kolkata",
                "West Bengal",
                "India",
            ),
        ),

        (
            "Tamil Nadu, India",
            (
                NOT_SPECIFIED,
                "Tamil Nadu",
                "India",
            ),
        ),

        (
            "Gujarat, India",
            (
                NOT_SPECIFIED,
                "Gujarat",
                "India",
            ),
        ),

        (
            "Delhi, India",
            (
                NOT_SPECIFIED,
                "Delhi",
                "India",
            ),
        ),

        (
            "Hyderabad, TelanganaIndia",
            (
                "Hyderabad",
                "Telangana",
                "India",
            ),
        ),

        (
            "TelanganaIndia",
            (
                NOT_SPECIFIED,
                "Telangana",
                "India",
            ),
        ),

        (
            "Mumbai Metropolitan Region 48 minutes ago",
            (
                "Mumbai Metropolitan Region",
                NOT_SPECIFIED,
                "India",
            ),
        ),

        (
            "Apollo Global Management Inc. Mumbai Metropolitan Region",
            (
                "Apollo Global Management Inc. Mumbai Metropolitan Region",
                NOT_SPECIFIED,
                "India",
            ),
        ),
    ]

    for raw, expected in tests:

        actual = _split_location_parts(
            raw
        )

        print(
            f"LinkedIn | {raw!r} -> {actual}"
        )

        _assert_equal(
            actual,
            expected,
            f"Location failed: {raw}",
        )

    print(
        "[PASS] Location tests"
    )


# ============================================================
# SEPARATE FIELD LOCATION TESTS
# ============================================================

def _run_separate_location_tests():

    print()
    print("-" * 70)
    print("SEPARATE LOCATION FIELD TESTS")
    print("-" * 70)

    tests = [

        (
            (
                "Not Specified",
                "Not Specified",
                "Haryana, India",
            ),
            (
                "Not Specified",
                "Haryana",
                "India",
            ),
        ),

        (
            (
                "Not Specified",
                "Telangana, India",
                "Not Specified",
            ),
            (
                "Not Specified",
                "Telangana",
                "India",
            ),
        ),

        (
            (
                "",
                "",
                "Karnataka, India",
            ),
            (
                "Not Specified",
                "Karnataka",
                "India",
            ),
        ),

        (
            (
                "Hyderabad",
                "Telangana",
                "India",
            ),
            (
                "Hyderabad",
                "Telangana",
                "India",
            ),
        ),

        (
            (
                "",
                "Haryana",
                "India",
            ),
            (
                "Not Specified",
                "Haryana",
                "India",
            ),
        ),
    ]

    for raw, expected in tests:

        actual = (
            _normalize_separate_location_fields(
                raw[0],
                raw[1],
                raw[2],
            )
        )

        print(
            f"{raw} -> {actual}"
        )

        _assert_equal(
            actual,
            expected,
            f"Separate location failed: {raw}",
        )

    print(
        "[PASS] Separate location field tests"
    )


# ============================================================
# EDUCATION TESTS
# ============================================================

def _run_education_tests():

    print()
    print("-" * 70)
    print("EDUCATION TESTS")
    print("-" * 70)

    tests = [

        (
            r"B\.?E\., Bachelor(?:'s)?, degree",
            "B.E., Bachelor's",
        ),

        (
            r"Bachelor(?:'s)?, degree",
            "Bachelor's",
        ),

        (
            r"B\.?E\.",
            "B.E.",
        ),

        (
            r"M\.?E\.",
            "M.E.",
        ),

        (
            r"B\.?Tech",
            "B.Tech",
        ),

        (
            r"M\.?Tech",
            "M.Tech",
        ),

        (
            r"B\.?Sc\.",
            "B.Sc.",
        ),

        (
            r"M\.?Sc\.",
            "M.Sc.",
        ),

        (
            r"B\.?Com\.",
            "B.Com.",
        ),

        (
            r"M\.?Com\.",
            "M.Com.",
        ),

        (
            r"B\.?A\.",
            "B.A.",
        ),

        (
            r"M\.?A\.",
            "M.A.",
        ),

        (
            "Bachelor",
            "Bachelor's",
        ),

        (
            "Bachelor's",
            "Bachelor's",
        ),

        (
            "Master",
            "Master's",
        ),

        (
            "Master's",
            "Master's",
        ),
    ]

    for raw, expected in tests:

        actual = _normalize_education(
            raw
        )

        print(
            f"{raw!r:<50} -> {actual}"
        )

        _assert_equal(
            actual,
            expected,
            f"Education failed: {raw}",
        )

    print(
        "[PASS] Education tests"
    )


# ============================================================
# EXPERIENCE TESTS
# ============================================================

def _run_experience_tests():

    print()
    print("-" * 70)
    print("EXPERIENCE FROM FULL DESCRIPTION TESTS")
    print("-" * 70)

    # --------------------------------------------------------
    # 3-5 years
    # --------------------------------------------------------

    job_1 = normalize_linkedin_job(
        {
            "source": "LinkedIn",
            "title": "Data Analyst",
            "company": "Test Company",
            "location": "Chennai, Tamil Nadu, India",
            "full_description": (
                "We are looking for a Data Analyst "
                "with 3-5 years of experience "
                "in SQL and Power BI."
            ),
        }
    )

    print()
    print("Test 1: 3-5 years")
    print(
        f"  Min Exp : {job_1.min_experience_years}"
    )
    print(
        f"  Max Exp : {job_1.max_experience_years}"
    )

    _assert_equal(
        (
            job_1.min_experience_years,
            job_1.max_experience_years,
        ),
        (
            "3",
            "5",
        ),
        "Experience 3-5 years",
    )

    # --------------------------------------------------------
    # Minimum 4 years
    # --------------------------------------------------------

    job_2 = normalize_linkedin_job(
        {
            "source": "LinkedIn",
            "title": "Data Analyst",
            "company": "Test Company",
            "location": "Bengaluru, Karnataka, India",
            "full_description": (
                "Minimum 4 years of experience "
                "in data analytics."
            ),
        }
    )

    print()
    print("Test 2: Minimum 4 years")
    print(
        f"  Min Exp : {job_2.min_experience_years}"
    )
    print(
        f"  Max Exp : {job_2.max_experience_years}"
    )

    _assert_equal(
        (
            job_2.min_experience_years,
            job_2.max_experience_years,
        ),
        (
            "4",
            NOT_SPECIFIED,
        ),
        "Experience minimum 4 years",
    )

    # --------------------------------------------------------
    # 2+ years
    # --------------------------------------------------------

    job_3 = normalize_naukri_job(
        {
            "source": "Naukri",
            "title": "Data Engineer",
            "company": "Test Company",
            "location": "Hyderabad, Telangana, India",
            "full_description": (
                "Candidates should have 2+ years "
                "of experience with Python and SQL."
            ),
        }
    )

    print()
    print("Test 3: 2+ years")
    print(
        f"  Min Exp : {job_3.min_experience_years}"
    )
    print(
        f"  Max Exp : {job_3.max_experience_years}"
    )

    _assert_equal(
        (
            job_3.min_experience_years,
            job_3.max_experience_years,
        ),
        (
            "2",
            NOT_SPECIFIED,
        ),
        "Experience 2+ years",
    )

    # --------------------------------------------------------
    # 6 months
    # --------------------------------------------------------

    job_4 = normalize_naukri_job(
        {
            "source": "Naukri",
            "title": "Data Analyst",
            "company": "Test Company",
            "location": "Chennai, Tamil Nadu, India",
            "full_description": (
                "Candidates with 6 months "
                "of experience are eligible."
            ),
        }
    )

    print()
    print("Test 4: 6 months")
    print(
        f"  Min Exp : {job_4.min_experience_years}"
    )
    print(
        f"  Max Exp : {job_4.max_experience_years}"
    )

    _assert_equal(
        (
            job_4.min_experience_years,
            job_4.max_experience_years,
        ),
        (
            "0.5",
            NOT_SPECIFIED,
        ),
        "Experience 6 months",
    )
    _assert_equal(
        job_4.experience_review,
        "Review: experience duration has no explicit bound",
        "Ambiguous duration is flagged for review",
    )

    # --------------------------------------------------------
    # Description must override old structured value
    # --------------------------------------------------------

    job_5 = normalize_linkedin_job(
        {
            "source": "LinkedIn",
            "title": "Data Analyst",
            "company": "Test Company",
            "location": "Mumbai, Maharashtra, India",
            "min_experience_years": "1",
            "max_experience_years": "2",
            "full_description": (
                "The candidate should have "
                "5-7 years of experience "
                "working with SQL and Power BI."
            ),
        }
    )

    print()
    print(
        "Test 5: Full description overrides "
        "structured experience"
    )

    print(
        f"  Min Exp : {job_5.min_experience_years}"
    )

    print(
        f"  Max Exp : {job_5.max_experience_years}"
    )

    _assert_equal(
        (
            job_5.min_experience_years,
            job_5.max_experience_years,
        ),
        (
            "5",
            "7",
        ),
        "Full description experience priority",
    )

    # --------------------------------------------------------
    # Fresher
    # --------------------------------------------------------

    job_6 = normalize_linkedin_job(
        {
            "source": "LinkedIn",
            "title": "Junior Data Analyst",
            "company": "Test Company",
            "location": "Coimbatore, Tamil Nadu, India",
            "full_description": (
                "Freshers are welcome to apply "
                "for this position."
            ),
        }
    )

    print()
    print("Test 6: Fresher")

    print(
        f"  Min Exp : {job_6.min_experience_years}"
    )

    print(
        f"  Max Exp : {job_6.max_experience_years}"
    )

    _assert_equal(
        (
            job_6.min_experience_years,
            job_6.max_experience_years,
        ),
        (
            "0",
            "0",
        ),
        "Fresher experience",
    )

    print()
    print(
        "[PASS] Experience from full description tests"
    )


# ============================================================
# FULL NORMALIZER TESTS
# ============================================================

def _run_full_tests():

    print()
    print("-" * 70)
    print("FULL NORMALIZER TESTS")
    print("-" * 70)

    # --------------------------------------------------------
    # LinkedIn standard
    # --------------------------------------------------------

    linkedin_job = {

        "source": "LinkedIn",

        "job_id": "test_linkedin_001",

        "title": "Data Analyst",

        "company": "Test Company",

        "location":
            "Hyderabad, Telangana, India",

        "degree_required":
            r"B\.?E\., Bachelor(?:'s)?, degree",

        "min_experience_years":
            "2",

        "max_experience_years":
            "5",
    }

    job = normalize_linkedin_job(
        linkedin_job
    )

    print()
    print("LinkedIn standard test:")

    print(
        f"  City    : {job.city}"
    )

    print(
        f"  State   : {job.state}"
    )

    print(
        f"  Country : {job.country}"
    )

    print(
        f"  Degree  : {job.degree_required}"
    )

    print(
        f"  Min Exp : {job.min_experience_years}"
    )

    print(
        f"  Max Exp : {job.max_experience_years}"
    )

    print(
        f"  Keyword : {job.search_keyword}"
    )

    _assert_equal(
        (
            job.city,
            job.state,
            job.country,
        ),
        (
            "Hyderabad",
            "Telangana",
            "India",
        ),
        "LinkedIn standard location",
    )

    _assert_equal(
        job.degree_required,
        "B.E., Bachelor's",
        "LinkedIn education",
    )

    _assert_equal(
        job.min_experience_years,
        "2",
        "LinkedIn minimum experience fallback",
    )

    _assert_equal(
        job.max_experience_years,
        "5",
        "LinkedIn maximum experience fallback",
    )

    _assert_equal(
        job.search_keyword,
        NOT_SPECIFIED,
        "LinkedIn search_keyword defaults to Not Specified when absent",
    )

    # --------------------------------------------------------
    # LinkedIn state only
    # --------------------------------------------------------

    state_only = normalize_linkedin_job(
        {
            "source": "LinkedIn",
            "title": "Data Analyst",
            "company": "Test Company",
            "location": "Tamil Nadu, India",
        }
    )

    print()
    print("LinkedIn state-only test:")

    print(
        f"  City    : {state_only.city}"
    )

    print(
        f"  State   : {state_only.state}"
    )

    print(
        f"  Country : {state_only.country}"
    )

    _assert_equal(
        (
            state_only.city,
            state_only.state,
            state_only.country,
        ),
        (
            NOT_SPECIFIED,
            "Tamil Nadu",
            "India",
        ),
        "LinkedIn state-only location",
    )

    # --------------------------------------------------------
    # LinkedIn malformed India suffix
    # --------------------------------------------------------

    malformed = normalize_linkedin_job(
        {
            "source": "LinkedIn",
            "title": "Data Analyst",
            "company": "Test Company",
            "location":
                "Hyderabad, TelanganaIndia",
        }
    )

    print()
    print("LinkedIn malformed India suffix:")

    print(
        f"  City    : {malformed.city}"
    )

    print(
        f"  State   : {malformed.state}"
    )

    print(
        f"  Country : {malformed.country}"
    )

    _assert_equal(
        (
            malformed.city,
            malformed.state,
            malformed.country,
        ),
        (
            "Hyderabad",
            "Telangana",
            "India",
        ),
        "Malformed India suffix",
    )

    # --------------------------------------------------------
    # LinkedIn separate polluted country
    # --------------------------------------------------------

    polluted_country = normalize_linkedin_job(
        {
            "source": "LinkedIn",
            "title": "Data Analyst",
            "company": "Test Company",
            "city": "Not Specified",
            "state": "Not Specified",
            "country": "Haryana, India",
        }
    )

    print()
    print("LinkedIn polluted country test:")

    print(
        f"  City    : {polluted_country.city}"
    )

    print(
        f"  State   : {polluted_country.state}"
    )

    print(
        f"  Country : {polluted_country.country}"
    )

    _assert_equal(
        (
            polluted_country.city,
            polluted_country.state,
            polluted_country.country,
        ),
        (
            NOT_SPECIFIED,
            "Haryana",
            "India",
        ),
        "Polluted country repair",
    )

    # --------------------------------------------------------
    # Naukri standard
    # --------------------------------------------------------

    naukri_job = normalize_naukri_job(
        {
            "source": "Naukri",
            "title": "Data Analyst",
            "company": "Test Company",
            "location":
                "Gurugram, Haryana, India",
            "degree_required":
                r"B\.?E\., Bachelor(?:'s)?, degree",
        }
    )

    print()
    print("Naukri standard test:")

    print(
        f"  City    : {naukri_job.city}"
    )

    print(
        f"  State   : {naukri_job.state}"
    )

    print(
        f"  Country : {naukri_job.country}"
    )

    print(
        f"  Degree  : {naukri_job.degree_required}"
    )

    print(
        f"  Keyword : {naukri_job.search_keyword}"
    )

    _assert_equal(
        (
            naukri_job.city,
            naukri_job.state,
            naukri_job.country,
        ),
        (
            "Gurugram",
            "Haryana",
            "India",
        ),
        "Naukri standard location",
    )

    _assert_equal(
        naukri_job.degree_required,
        "B.E., Bachelor's",
        "Naukri education",
    )

    _assert_equal(
        naukri_job.search_keyword,
        NOT_SPECIFIED,
        "Naukri search_keyword defaults to Not Specified when absent",
    )

    # --------------------------------------------------------
    # Naukri multi-location
    # --------------------------------------------------------

    naukri_multi = normalize_naukri_job(
        {
            "source": "Naukri",
            "title": "Data Analyst",
            "company": "Test Company",
            "location":
                "Hybrid - Hyderabad, Chennai, Bengaluru",
        }
    )

    print()
    print("Naukri multi-location test:")

    print(
        f"  City    : {naukri_multi.city}"
    )

    print(
        f"  State   : {naukri_multi.state}"
    )

    print(
        f"  Country : {naukri_multi.country}"
    )

    _assert_equal(
        (
            naukri_multi.city,
            naukri_multi.state,
            naukri_multi.country,
        ),
        (
            "Hybrid - Hyderabad, Chennai, Bengaluru",
            NOT_SPECIFIED,
            "India",
        ),
        "Naukri multi-location",
    )

    # --------------------------------------------------------
    # Job ID fallback
    # --------------------------------------------------------

    fallback_job = normalize(
        {
            "source": "LinkedIn",
            "title": "Data Analyst",
            "company": "Test Company",
            "location":
                "Bengaluru, Karnataka, India",
        }
    )

    print()
    print("Job ID fallback test:")

    print(
        f"  Job ID: {fallback_job.job_id}"
    )

    _assert_equal(
        bool(
            fallback_job.job_id
        ),
        True,
        "Fallback job ID",
    )

    print()
    print(
        "All full normalizer tests passed."
    )


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":

    print("=" * 70)
    print("NORMALIZER MODULE TEST")
    print("=" * 70)

    _run_location_tests()

    _run_separate_location_tests()

    _run_education_tests()

    _run_experience_tests()

    _run_full_tests()

    print()
    print("=" * 70)
    print(
        "NORMALIZER MODULE TEST COMPLETE"
    )
    print("=" * 70)
