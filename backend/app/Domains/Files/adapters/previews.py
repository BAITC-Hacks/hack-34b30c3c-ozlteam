from asyncio import to_thread
from io import BytesIO

import pypdfium2
from PIL import Image, UnidentifiedImageError

from app.Domains.Files.contracts import PreviewUnavailable
from app.Domains.Files.services.file_types import IMAGE, PDF

MAX_PREVIEW_SIDE = 1200
PREVIEW_CONTENT_TYPE = "image/png"
MAX_PDF_RENDER_SCALE = 4.0
_DECODE_ERRORS = (
    OSError,
    ValueError,
    SyntaxError,
    UnidentifiedImageError,
    Image.DecompressionBombError,
)


class PillowImageValidator:
    """Confirms an upload really decodes as an image instead of trusting its name."""

    async def is_valid(self, data: bytes) -> bool:
        return await to_thread(self._is_valid, data)

    def _is_valid(self, data: bytes) -> bool:
        try:
            with Image.open(BytesIO(data)) as image:
                image.verify()
            # verify() leaves the file unusable, so decode once more for real.
            with Image.open(BytesIO(data)) as image:
                image.load()
        except _DECODE_ERRORS:
            return False
        return True


class PillowPreviewRenderer:
    """PNG previews: Pillow for images, pypdfium2 for the first page of a PDF."""

    def __init__(self, max_side: int = MAX_PREVIEW_SIDE):
        self._max_side = max_side

    def supports(self, kind: str) -> bool:
        return kind in {IMAGE, PDF}

    async def render(self, kind: str, data: bytes) -> bytes:
        # Decoding and rasterising are CPU bound; keep them off the event loop.
        return await to_thread(self._render, kind, data)

    def _render(self, kind: str, data: bytes) -> bytes:
        if kind == IMAGE:
            return self._render_image(data)
        if kind == PDF:
            return self._render_pdf(data)
        raise PreviewUnavailable(f"No preview for kind: {kind}")

    def _render_image(self, data: bytes) -> bytes:
        try:
            with Image.open(BytesIO(data)) as image:
                image.load()
                converted = image.convert("RGBA" if self._has_alpha(image) else "RGB")
            try:
                converted.thumbnail((self._max_side, self._max_side))
                return self._to_png(converted)
            finally:
                converted.close()
        except _DECODE_ERRORS as error:
            raise PreviewUnavailable("Image could not be decoded") from error

    def _render_pdf(self, data: bytes) -> bytes:
        try:
            with pypdfium2.PdfDocument(data) as document:
                if len(document) == 0:
                    raise PreviewUnavailable("PDF has no pages")
                page = document[0]
                width, height = page.get_size()
                longest = max(width, height)
                scale = self._max_side / longest if longest > 0 else 1.0
                # to_pil() may share the bitmap buffer, so encode before the document closes.
                image = page.render(scale=min(scale, MAX_PDF_RENDER_SCALE)).to_pil()
                try:
                    return self._to_png(image)
                finally:
                    image.close()
        except pypdfium2.PdfiumError as error:
            raise PreviewUnavailable("PDF could not be rendered") from error

    @staticmethod
    def _has_alpha(image: Image.Image) -> bool:
        return image.mode in {"RGBA", "LA", "PA"} or "transparency" in image.info

    @staticmethod
    def _to_png(image: Image.Image) -> bytes:
        buffer = BytesIO()
        image.save(buffer, format="PNG", optimize=True)
        return buffer.getvalue()
