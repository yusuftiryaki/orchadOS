"""Four-direction mosaic of a tree's crops, built locally (one image per visit in a request).

Layout (fixed, the prompt describes it):

    +-----+-----+
    |  N  |  E  |
    +-----+-----+
    |  S  |  W  |
    +-----+-----+

N means the camera stood north of the tree (docs/arayuzler.md, asset pose
`direction`). Each crop is fitted into its tile without distortion; a direction
without a crop is a grey tile. Every tile carries its direction letter.
"""

from __future__ import annotations

import io

from PIL import Image, ImageDraw, ImageFont

DIRECTIONS = ("N", "E", "S", "W")
DEFAULT_SIZE = 1024
_BACKGROUND = (40, 40, 40)
_EMPTY = (128, 128, 128)


def _font(size: int) -> ImageFont.ImageFont | ImageFont.FreeTypeFont:
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow without FreeType support
        return ImageFont.load_default()


def build_mosaic(
    crops: dict[str, bytes], size: int = DEFAULT_SIZE, jpeg_quality: int = 85
) -> bytes:
    """JPEG bytes of a size x size mosaic from {direction: image bytes}."""
    unknown = set(crops) - set(DIRECTIONS)
    if unknown:
        raise ValueError(f"unknown directions: {sorted(unknown)}")
    if size % 2:
        raise ValueError("mosaic size must be even")
    tile = size // 2
    canvas = Image.new("RGB", (size, size), _BACKGROUND)
    draw = ImageDraw.Draw(canvas)
    font = _font(max(12, tile // 12))
    for i, d in enumerate(DIRECTIONS):
        x0, y0 = (i % 2) * tile, (i // 2) * tile
        data = crops.get(d)
        if data is None:
            draw.rectangle([x0, y0, x0 + tile - 1, y0 + tile - 1], fill=_EMPTY)
            draw.text((x0 + tile // 2, y0 + tile // 2), "-", fill=(0, 0, 0), font=font)
        else:
            with Image.open(io.BytesIO(data)) as img:
                img = img.convert("RGB")
                img.thumbnail((tile, tile), Image.Resampling.LANCZOS)
                canvas.paste(img, (x0 + (tile - img.width) // 2, y0 + (tile - img.height) // 2))
        # Direction label on a dark box, top-left of the tile.
        pad = max(4, tile // 64)
        box = draw.textbbox((x0 + pad, y0 + pad), d, font=font)
        draw.rectangle([box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad], fill=(0, 0, 0))
        draw.text((x0 + pad, y0 + pad), d, fill=(255, 255, 255), font=font)
    out = io.BytesIO()
    canvas.save(out, format="JPEG", quality=jpeg_quality, optimize=True)
    return out.getvalue()
