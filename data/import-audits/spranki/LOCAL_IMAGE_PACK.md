# Local Spranki image pack

The extracted image binaries are deliberately not committed to this repository.

## Create the pack locally

Install Pillow, then run:

```bash
python -m pip install Pillow
python tools/extract-spranki-images.py \
  "!Spranki Clinical V1 12.9.25.apkg" \
  private-media/spranki
```

The output contains:

- `private-media/spranki/images/` — all 953 extracted image files;
- `private-media/spranki/manifest.json` — original filename, extracted filename, dimensions, format, byte size and SHA-256 hash.

## Repository rule

Do not commit `private-media/`, the APKG, or an extracted image archive. The image rights are not independently verified. The metadata audit can be committed, but image binaries should remain local unless a source licence or written permission specifically permits deployment.

## App integration direction

The safe design is a local image-pack importer that stores selected image blobs in browser IndexedDB. The public image bank should continue accepting only independently verified CC0 or CC BY assets. This keeps personal study material separate from the publicly deployed GitHub Pages bundle.
