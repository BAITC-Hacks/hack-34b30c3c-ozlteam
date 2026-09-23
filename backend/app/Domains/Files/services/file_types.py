import re
import unicodedata
from dataclasses import dataclass
from pathlib import PurePosixPath

from app.Domains.Files.contracts import UnsupportedFileType

IMAGE = "image"
PDF = "pdf"
DOC = "doc"
SHEET = "sheet"
OTHER = "other"

MAX_FILENAME_LENGTH = 255
MAX_STORAGE_NAME_LENGTH = 100
FALLBACK_NAME = "file"
_UNSAFE_CHARACTERS = set('\\/:*?"<>|')
_ASCII_ALLOWED = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-")


@dataclass(frozen=True, slots=True)
class AllowedType:
    kind: str
    content_types: frozenset[str]


ALLOWED_TYPES: dict[str, AllowedType] = {
    ".csv": AllowedType(SHEET, frozenset({"text/csv", "application/csv", "text/plain"})),
    ".png": AllowedType(IMAGE, frozenset({"image/png"})),
    ".jpg": AllowedType(IMAGE, frozenset({"image/jpeg"})),
    ".jpeg": AllowedType(IMAGE, frozenset({"image/jpeg"})),
    ".webp": AllowedType(IMAGE, frozenset({"image/webp"})),
    ".pdf": AllowedType(PDF, frozenset({"application/pdf"})),
    ".docx": AllowedType(
        DOC,
        frozenset({"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}),
    ),
    ".xlsx": AllowedType(
        SHEET,
        frozenset({"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),
    ),
}


def base_name(filename: str) -> str:
    """Strip any client supplied path; never trust the browser with a location."""
    candidate = unicodedata.normalize("NFC", filename or "").replace("\\", "/")
    candidate = PurePosixPath(candidate).name
    cleaned = "".join(
        character
        for character in candidate
        if character.isprintable() and character not in _UNSAFE_CHARACTERS
    )
    return cleaned.strip(" .")


def display_name(filename: str) -> str:
    name = base_name(filename)[:MAX_FILENAME_LENGTH].strip(" .")
    return name or FALLBACK_NAME


def storage_name(filename: str) -> str:
    """An ASCII-only name for the object key: portable across filesystems."""
    name = base_name(filename)
    suffix = PurePosixPath(name).suffix.lower()
    stem = name[: len(name) - len(suffix)] if suffix else name
    replaced = "".join(character if character in _ASCII_ALLOWED else "_" for character in stem)
    safe_stem = re.sub(r"_+", "_", replaced).strip("._-")[:MAX_STORAGE_NAME_LENGTH]
    safe_suffix = "".join(character for character in suffix if character in _ASCII_ALLOWED)
    return f"{safe_stem or FALLBACK_NAME}{safe_suffix}"


def extension_of(filename: str) -> str:
    return PurePosixPath(base_name(filename)).suffix.lower()


def normalize_content_type(content_type: str | None) -> str:
    return (content_type or "").split(";", 1)[0].strip().lower()


def resolve_type(filename: str, content_type: str | None) -> AllowedType:
    """Both the extension and the declared content type must be on the allowlist."""
    allowed = ALLOWED_TYPES.get(extension_of(filename))
    if allowed is None:
        raise UnsupportedFileType(f"Extension is not allowed: {extension_of(filename) or '(none)'}")
    normalized = normalize_content_type(content_type)
    if normalized not in allowed.content_types:
        raise UnsupportedFileType(f"Content type is not allowed: {normalized or '(none)'}")
    return allowed
