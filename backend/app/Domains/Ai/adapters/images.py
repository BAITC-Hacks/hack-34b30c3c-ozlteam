from base64 import b64encode

from app.Domains.Ai.contracts import UnsupportedImage

# Both providers accept exactly these four formats; sniff the bytes instead of trusting callers.
SIGNATURES: tuple[tuple[bytes, str], ...] = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
)


def media_type(image: bytes) -> str:
    for signature, name in SIGNATURES:
        if image.startswith(signature):
            return name
    if image[:4] == b"RIFF" and image[8:12] == b"WEBP":
        return "image/webp"
    raise UnsupportedImage("Image must be PNG, JPEG, GIF or WEBP")


def encode(image: bytes) -> tuple[str, str]:
    """Return the media type and the base64 payload of an image."""
    return media_type(image), b64encode(image).decode()


def data_uri(image: bytes) -> str:
    name, payload = encode(image)
    return f"data:{name};base64,{payload}"
