"""Fixed ids of the demo dataset (docs/demo-turu.md §8.1) and the uuid5 rule for the rest.

The de-prefixed ids are a contract with the demo access stream (A) and the web
stream (C): do not change them. Every other row id is
uuid5(NAMESPACE, "v<version>:<kind>:<key>"), so a reload writes the same ids.
"""

from __future__ import annotations

import uuid

NAMESPACE = uuid.UUID("de0f0000-0000-5000-8000-000000000000")

ORG_ID = "de000000-0000-4000-8000-000000000001"
ORG_NAME = "orchadOS Demo (örnek veri)"

PARCEL_A = "de100000-0000-4000-8000-000000000001"
PARCEL_B = "de100000-0000-4000-8000-000000000002"

OWNER = "de900000-0000-4000-8000-000000000001"
VIEWER = "de900000-0000-4000-8000-000000000002"
EXPERT = "de900000-0000-4000-8000-000000000003"
FIELD = "de900000-0000-4000-8000-000000000004"
OPS = "de900000-0000-4000-8000-000000000005"

EMAIL_DOMAIN = "demo.orchados.invalid"

# (id, role, e-mail local part, display name)
PERSONAS: tuple[tuple[str, str, str, str], ...] = (
    (OWNER, "owner", "ornek-sahip", "Örnek Sahip"),
    (VIEWER, "viewer", "ornek-hissedar", "Örnek Hissedar"),
    (EXPERT, "expert", "ornek-uzman", "Örnek Uzman"),
    (FIELD, "field_staff", "ornek-saha", "Örnek Saha"),
    (OPS, "ops", "ornek-operasyon", "Örnek Operasyon"),
)

A_INVENTORY = "de200000-0000-4000-8000-000000000001"
A_SCAN_2025 = "de200000-0000-4000-8000-000000000002"
A_SCAN_2026 = "de200000-0000-4000-8000-000000000003"
B_INVENTORY = "de200000-0000-4000-8000-000000000004"
B_SCAN_2026 = "de200000-0000-4000-8000-000000000005"

FIXED_PREFIXES = ("de000000-", "de100000-", "de200000-", "de900000-")


def did(kind: str, key: str, version: int = 1) -> str:
    """Id of a non-fixed row: uuid5(NAMESPACE, 'v<version>:<kind>:<key>')."""
    return str(uuid.uuid5(NAMESPACE, f"v{version}:{kind}:{key}"))


def persona_email(local: str) -> str:
    return f"{local}@{EMAIL_DOMAIN}"
