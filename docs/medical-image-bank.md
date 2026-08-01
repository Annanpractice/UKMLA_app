# Medical image bank

## Scope

The image bank remains a curated pilot. It adds at most one medical image to a generated ten-question UKMLA set and only when the selected condition and question type are suitable for visual interpretation.

The current approved manifest contains 14 images mapped to pneumothorax, haemothorax, melanoma, pneumonia, STEMI, diabetic retinopathy, basal-cell carcinoma, erythema migrans, Bell's palsy, hip fracture, psoriasis, scabies, pleural effusion and acute appendicitis.

## Approved manifest

`data/image-bank.json` is the only source that may be used in live questions. A record must have:

- an explicit CC0 1.0 or CC BY 4.0 licence;
- a stable HTTPS image URL and source page;
- complete attribution and licence links;
- a neutral pre-answer alt description;
- a reviewed condition mapping and post-answer teaching finding;
- `approved: true`.

Public availability alone is not sufficient. MedPix, the Indiana chest X-ray collection, Radiology Masterclass and ordinary web-search results are excluded from the approved manifest unless separate permission and an explicit compatible reuse basis are documented later.

## Open-i catalogue workflow

The manual **Medical image bank validation** workflow can query the NLM Open-i API using the terms in `scripts/image-search-seeds.json`. It creates an artifact for review only.

The harvester:

- downloads metadata, not image files;
- blocks MedPix and Indiana chest X-ray collections;
- rejects results without an explicit allow-listed licence;
- marks every remaining candidate `pending-human-review`;
- sets `mayPublish: false` on every candidate;
- never changes the approved manifest.

Promotion from a candidate artifact into the approved manifest is a separate human-reviewed code change.

## Question generation

When image questions are enabled:

1. the normal answered-coverage scheduler selects ten conditions;
2. a compatible selected condition receives an approved image where available;
3. **Prefer one** may replace a condition only with an image-backed condition from the same topic;
4. **Require exactly one** first tries a direct match, then a compatible-slot move and same-topic replacement; in all-topic builds it may finally select another image-backed condition while preserving topic diversity;
5. the approved image is sent to the OpenAI Responses request as an `input_image`;
6. every model checkpoint receives the same image and locked target metadata;
7. deterministic validation requires the stem to refer to the image or modality, prohibits writing the target diagnosis in the stem, and restores immutable image metadata after every model call;
8. the rendered question shows the image, attribution and licence; the teaching finding appears only after an answer.

The image does not bypass any existing generation, audit, distractor, repair, shuffle or final-validation checkpoint.

## Failure behaviour

If the manifest or an image cannot be loaded, **Prefer one** can continue as text-only generation. **Require exactly one** stops before the OpenAI request when no approved image can be placed. The question renderer provides a source link when an externally hosted image fails. No progress data or API key is stored by this feature.
