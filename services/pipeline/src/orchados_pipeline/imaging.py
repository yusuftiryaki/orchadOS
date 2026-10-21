"""Image encoding helpers."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from .hashing import sha256_bytes
from .models import FileRef


def encode(image: np.ndarray, ext: str, quality: int) -> bytes:
    flag = {".webp": cv2.IMWRITE_WEBP_QUALITY, ".jpg": cv2.IMWRITE_JPEG_QUALITY}[ext]
    ok, buf = cv2.imencode(ext, image, [flag, int(quality)])
    if not ok:
        raise RuntimeError(f"cannot encode {ext}")
    return buf.tobytes()


def write_image(image: np.ndarray, run_dir: Path, rel: str, quality: int) -> FileRef:
    path = run_dir / rel
    ext = path.suffix.lower()
    data = encode(image, ext, quality)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    media = {".webp": "image/webp", ".jpg": "image/jpeg"}[ext]
    return FileRef(
        path=rel,
        sha256=sha256_bytes(data),
        size=len(data),
        media_type=media,
        width=image.shape[1],
        height=image.shape[0],
    )


def write_json_file(text: str, run_dir: Path, rel: str) -> FileRef:
    data = text.encode("utf-8")
    path = run_dir / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return FileRef(
        path=rel, sha256=sha256_bytes(data), size=len(data), media_type="application/json"
    )


def resize(image: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    w, h = size
    if image.shape[1] == w and image.shape[0] == h:
        return image
    interp = cv2.INTER_AREA if w < image.shape[1] else cv2.INTER_CUBIC
    return cv2.resize(image, (w, h), interpolation=interp)
