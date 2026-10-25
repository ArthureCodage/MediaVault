"""
Thumbnail generation and video metadata service.

- Images  → resized JPEG via Pillow
- Videos  → frame extracted via bundled FFmpeg, then resized
- Text    → preview image with first few lines on dark background
"""

import asyncio
import logging
import re
import subprocess
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.config import settings

logger = logging.getLogger(__name__)

THUMB_MAX_SIZE = (400, 400)
THUMB_QUALITY = 85


def get_ffmpeg_binary() -> str:
    """Return path to ffmpeg binary (bundled via imageio_ffmpeg, or system fallback)."""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


async def generate_thumbnail(file_path: Path, uuid: str, media_type: str) -> str | None:
    """Generate a thumbnail and return its absolute path, or None on failure."""
    thumb_dest = settings.thumbnails_path / f"{uuid}.jpg"

    try:
        if media_type == "image":
            return await _thumbnail_image(file_path, thumb_dest)
        elif media_type == "video":
            return await _thumbnail_video(file_path, thumb_dest)
        elif media_type == "text":
            return await _thumbnail_text(file_path, thumb_dest)
    except Exception:
        logger.exception("Thumbnail generation failed for %s", file_path)
    return None


# ─────────────────────────── Images ───────────────────────────

async def _thumbnail_image(src: Path, dest: Path) -> str:
    """Resize an image to THUMB_MAX_SIZE using Pillow."""

    def _generate() -> str:
        with Image.open(src) as img:
            img = img.convert("RGB")
            img.thumbnail(THUMB_MAX_SIZE, Image.LANCZOS)
            img.save(dest, "JPEG", quality=THUMB_QUALITY)
        return str(dest)

    return await asyncio.to_thread(_generate)


# ─────────────────────────── Videos ───────────────────────────

async def _thumbnail_video(src: Path, dest: Path) -> str | None:
    """Extract a frame at ~1 s with ffmpeg, then resize."""
    temp_frame = dest.with_suffix(".tmp.jpg")
    ffmpeg_bin = get_ffmpeg_binary()

    cmd = [
        ffmpeg_bin, "-y",
        "-ss", "00:00:01",
        "-i", str(src),
        "-frames:v", "1",
        "-q:v", "2",
        str(temp_frame),
    ]

    def _extract_and_resize() -> str | None:
        try:
            res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
            # If 1s failed (e.g. video shorter than 1s), try 00:00:00
            if (res.returncode != 0 or not temp_frame.exists()) and temp_frame.exists():
                temp_frame.unlink(missing_ok=True)

            if not temp_frame.exists():
                retry_cmd = [
                    ffmpeg_bin, "-y",
                    "-ss", "00:00:00",
                    "-i", str(src),
                    "-frames:v", "1",
                    "-q:v", "2",
                    str(temp_frame),
                ]
                subprocess.run(retry_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)

            if not temp_frame.exists():
                return None

            with Image.open(temp_frame) as img:
                img = img.convert("RGB")
                img.thumbnail(THUMB_MAX_SIZE, Image.LANCZOS)
                img.save(dest, "JPEG", quality=THUMB_QUALITY)

            temp_frame.unlink(missing_ok=True)
            return str(dest)
        except Exception as e:
            logger.warning("Failed to extract video thumbnail for %s: %s", src, e)
            temp_frame.unlink(missing_ok=True)
            return None

    return await asyncio.to_thread(_extract_and_resize)


# ──────────────────────────── Text ────────────────────────────

async def _thumbnail_text(src: Path, dest: Path) -> str:
    """Render the first few lines of a text file on a dark background."""

    def _generate() -> str:
        try:
            lines = []
            with open(src, "r", encoding="utf-8", errors="replace") as f:
                for _ in range(12):
                    line = f.readline()
                    if not line:
                        break
                    lines.append(line.rstrip("\r\n"))
            text = "\n".join(lines)[:300]
        except Exception:
            text = src.name

        img = Image.new("RGB", (400, 400), color=(18, 18, 18))
        draw = ImageDraw.Draw(img)

        try:
            font = ImageFont.truetype("arial.ttf", 15)
        except Exception:
            font = ImageFont.load_default()

        draw.text((20, 20), text, fill=(220, 220, 220), font=font)
        img.save(dest, "JPEG", quality=THUMB_QUALITY)
        return str(dest)

    return await asyncio.to_thread(_generate)


# ────────────────── Video metadata via FFmpeg ────────────────

async def get_video_metadata(file_path: Path) -> dict:
    """Return width, height, and duration using bundled ffmpeg."""
    ffmpeg_bin = get_ffmpeg_binary()

    def _extract_meta() -> dict:
        result: dict = {}
        try:
            proc = subprocess.run(
                [ffmpeg_bin, "-i", str(file_path)],
                capture_output=True,
                text=True,
                errors="replace",
                timeout=10,
            )
            output = proc.stderr

            # 1. Parse Duration: 00:01:23.45
            dur_match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", output)
            if dur_match:
                hours = float(dur_match.group(1))
                minutes = float(dur_match.group(2))
                seconds = float(dur_match.group(3))
                result["duration"] = round(hours * 3600 + minutes * 60 + seconds, 2)

            # 2. Parse Video resolution: Stream #... Video: ... 1920x1080
            res_match = re.search(r"Video:.*?,\s*(\d{2,5})x(\d{2,5})", output)
            if res_match:
                w, h = int(res_match.group(1)), int(res_match.group(2))
                # Phone videos are often stored landscape with a rotation flag:
                # swap so vertical clips are detected as vertical (Reels, #vertical tag).
                rot_match = re.search(r"rotation of (-?\d+(?:\.\d+)?) degrees", output) or re.search(
                    r"rotate\s*:\s*(-?\d+)", output
                )
                if rot_match and round(abs(float(rot_match.group(1)))) % 180 == 90:
                    w, h = h, w
                result["width"] = w
                result["height"] = h

        except Exception as e:
            logger.warning("Error reading video metadata for %s: %s", file_path, e)

        return result

    return await asyncio.to_thread(_extract_meta)
