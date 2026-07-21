# Vibe Command Mapping Synthesis

Generate one high-quality supervised fine-tuning sample for the assigned primary command type.

Return only one JSON object with this exact shape:

```json
{
  "intent": "a concrete Chinese game-authoring request",
  "asset_catalog": [
    {
      "id": "existing-or-virtual-resource-id",
      "type": "image|audio|animation|video",
      "path": "relative or virtual:// path",
      "origin": "existing|virtual",
      "exists": true,
      "metadata": {"status": "ready|placeholder", "role": "optional semantic role"}
    }
  ],
  "commands": [
    {"id": "stable-command-id", "type": "PRIMARY_COMMAND_TYPE", "parameters": {}}
  ]
}
```

Rules:

- The assigned primary command type must appear in `commands`.
- Respect `sample_mode` from the assigned job: `atomic` produces exactly one command; `motif` produces a tightly coupled 2-4 command block.
- Use the supplied real examples as syntax evidence, but do not copy an example verbatim.
- Vary parameter values, names, placements, conditions, and game intent across samples.
- Use an existing resource only when it appears in the supplied reference examples or asset context.
- Invented assets are allowed only as explicit `origin: "virtual"` records with `exists: false` and `metadata.status: "placeholder"`.
- Do not emit login, upload, remote-user, network-write, engine-source, or arbitrary script functionality.
- Do not include explanations, markdown, chain-of-thought, or fields outside the required JSON object.
