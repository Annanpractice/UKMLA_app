# Spranki metadata audit

This audit reads the supplied APKG locally. It does **not** copy Spranki card wording or image binaries into the public repository.

- Notes: 6,697
- Cards: 8,545
- Deck entries: 598
- Media files: 953
- Images detected by file content: 953
- Condition-tag entries: 945

The earlier total of 952 came from filtering by recognised filename extensions. One additional AVIF image has no filename extension, so content inspection gives the correct total of **953 images**.

## Local-only image extraction

All 953 images can be extracted for personal local use with `tools/extract-spranki-images.py`. The extractor preserves the original filenames where possible and creates a manifest containing dimensions, format, byte size and SHA-256 hashes. Extracted image binaries are intentionally excluded from the GitHub repository.

## Safe use in the UKMLA app

The image metadata can support condition tagging, duplicate detection, image-gap analysis and search terms. Rights have not been independently verified, so the images must not be treated as approved public-app assets. Publicly deployed images should be separately licensed, public-domain, self-created or generated replacements.

The condition taxonomy can be compared with the app's condition IDs to identify missing aliases, subconditions and thin topic areas. No clinical claim should be imported without independent verification against current UK guidance.
