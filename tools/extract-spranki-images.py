#!/usr/bin/env python3
"""Extract all image media from a user-supplied Spranki APKG for local use.

This script does not upload anything. It writes original media files plus a
manifest containing filenames, hashes and dimensions. Image rights are not
verified; do not publish or redistribute the output without permission or an
independently verified licence.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from io import BytesIO
from pathlib import Path

from PIL import Image

FORMAT_EXT = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "WEBP": ".webp",
    "GIF": ".gif",
    "AVIF": ".avif",
}


def extract(apkg: Path, output: Path) -> dict:
    if output.exists():
        raise FileExistsError(f"Output already exists: {output}")
    images_dir = output / "images"
    images_dir.mkdir(parents=True)
    seen: dict[str, int] = {}
    records: list[dict] = []

    with zipfile.ZipFile(apkg) as archive:
        media = json.loads(archive.read("media"))
        for archive_key, original_name in sorted(media.items(), key=lambda row: int(row[0])):
            data = archive.read(archive_key)
            try:
                with Image.open(BytesIO(data)) as image:
                    image_format = image.format or "UNKNOWN"
                    width, height = image.size
                    frames = getattr(image, "n_frames", 1)
                    mode = image.mode
                    mime = Image.MIME.get(image_format, "application/octet-stream")
            except Exception:
                image_format = "UNKNOWN"
                width = height = frames = mode = None
                mime = "application/octet-stream"

            safe_name = Path(original_name).name
            duplicate_number = seen.get(safe_name, 0)
            seen[safe_name] = duplicate_number + 1
            if duplicate_number:
                source = Path(safe_name)
                safe_name = f"{source.stem}__duplicate_{duplicate_number}{source.suffix}"
            if not Path(safe_name).suffix:
                safe_name += FORMAT_EXT.get(image_format, "")

            (images_dir / safe_name).write_bytes(data)
            records.append({
                "archiveKey": archive_key,
                "originalFilename": original_name,
                "extractedFilename": safe_name,
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
                "format": image_format,
                "mime": mime,
                "width": width,
                "height": height,
                "frames": frames,
                "mode": mode,
            })

    manifest = {
        "schemaVersion": "spranki-local-image-pack-v1",
        "source": apkg.name,
        "mediaCount": len(records),
        "notice": (
            "Extracted for personal local educational use. Image rights are not "
            "verified. Do not publish or redistribute without permission or "
            "independent licence verification."
        ),
        "images": records,
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("apkg", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    result = extract(args.apkg, args.output)
    print(f"Extracted {result['mediaCount']} media files to {args.output}")


if __name__ == "__main__":
    main()
