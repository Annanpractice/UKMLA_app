# UKMLA Card Import Prompt

Use this file when asking ChatGPT or Claude to create cards for the UKMLA app.

Return **only valid JSON** using schema `ukmla-card-import-v1`.

```json
{
  "schemaVersion": "ukmla-card-import-v1",
  "cards": [
    {
      "topic": "Rheumatology",
      "name": "Polymyalgia rheumatica",
      "profile": "clinical",
      "fields": {
        "investigations": "...",
        "treatment": "...",
        "escalation": "...",
        "mimics": "...",
        "redFlags": "..."
      }
    }
  ]
}
```

Rules:

- Do not invent or include an `id`; the importer assigns the immutable ID.
- One card represents one coherent condition, concept, applied anatomy point, physiology concept, pharmacology topic, or professional-practice scenario.
- Keep each field concise, clinically useful and question-generating rather than encyclopaedic.
- Use the most appropriate existing topic. Do not create near-duplicate topic names.
- Avoid duplicate cards or cards that merely rename an existing concept.
- UK clinical content should use current UK practice and flag uncertainty rather than inventing specifics.

Profiles and exact five fields:

- `clinical`: `investigations`, `treatment`, `escalation`, `mimics`, `redFlags`
- `pharmacology`: `indication`, `prescribe`, `checkMonitor`, `interactionsAvoid`, `toxicityAct`
- `anatomy`: `exactAnswer`, `clinicalPattern`, `localisation`, `discriminator`, `examUse`
- `physiology`: `subsystem`, `mechanism`, `clinicalPattern`, `discriminator`, `examUse`
- `law`: `recognise`, `rule`, `act`, `record`, `avoid`

For multiple requested topics, return multiple objects inside the same `cards` array.
