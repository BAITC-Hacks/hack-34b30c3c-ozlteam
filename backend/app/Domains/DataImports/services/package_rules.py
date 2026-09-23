from app.core.errors import DomainError


def validate_profile_manifest(files):
    """A profile has one authoritative workbook; dict collapse must not hide overlap."""
    profiles = {}
    for file in files:
        profile = file.get("profile")
        if not profile:
            continue  # A byte-identical duplicate may have been skipped by the parser.
        fingerprint = file["sha256"]
        previous = profiles.setdefault(profile, fingerprint)
        if previous != fingerprint:
            raise DomainError(
                f"В пакете несколько разных книг одного профиля ({profile}). "
                "Загрузите одну согласованную книгу каждого вида; "
                "пересекающиеся выгрузки нельзя объединять автоматически.",
                422,
                "duplicate_workbook_profile",
            )
