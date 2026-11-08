## S-LLM - Gemini structured scoring

### Question
Does Gemini return schema-valid structured scores for the job photos with the shared Zod rubric, how fast, and how repeatable are its scores on the same photos?

### Method
Script `scripts/spikes/llm/run.ts` on 2026-11-08, fixture mode `placeholder` (generated placeholder images, so scores say nothing about real work quality). Gemini model chosen `gemini-3.7-flash` (answered `none`; surface `interactions.create`) from the `models.list` result (61 models, flash/gemini-4 ids: gemini-2.5-flash, gemini-2.5-flash-preview-tts, gemini-flash-latest, gemini-flash-lite-latest, gemini-2.5-flash-lite, gemini-2.5-flash-image, gemini-3-flash-preview, gemini-3.1-flash-lite-preview, gemini-3.1-flash-lite, gemini-3.1-flash-image-preview, gemini-3.1-flash-image, gemini-3.1-flash-lite-image, gemini-3.5-flash, gemini-3.5-flash-lite, gemini-omni-flash-preview, gemini-omni-1.1-flash, gemini-omni-1.2-flash, gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash, gemini-4-argon, gemini-3.1-flash-tts-preview, gemini-3.8-flash-tts, gemini-3.8-flash-lite-tts, gemini-2.5-flash-native-audio-latest, gemini-2.5-flash-native-audio-preview-09-2025, gemini-2.5-flash-native-audio-preview-12-2025, gemini-3.1-flash-live-preview). Three rounds, 120 s timeout each, 4 before/after images per call (plus the sign image in round 3). Rounds 1 and 2 use identical images. Every output was re-validated with the full Zod schema. Gemini is the only judge (owner decision 2026-11-08).

### What happened
- Schema-valid runs: 0/3.
- Latency: 34433-159574 ms.
- Outages:
- round 1: InternalServerError: 503 gemini-3.7-flash is currently experiencing high demand, spikes in demand are usually temporary. Please try again later.
- round 2: RateLimitError: 429 Rate limit exceeded for model gemini-3.8-flash (limit: 20 requests per day on Free Tier). Please retry in 16h23m30s or upgrade your tier at https://ai.dev/rate-limit.
- round 3: RateLimitError: 429 Rate limit exceeded for model gemini-3.8-flash (limit: 20 requests per day on Free Tier). Please retry in 16h22m56s or upgrade your tier at https://ai.dev/rate-limit.
- Score gap between rounds 1 and 2 (same photos): no valid scores in both rounds 1 and 2.
- Auto-release bar (avg >= 8, no criterion < 6) met by 0/0 valid outputs (indicator only, not a calibration).
- Sign image (round 3) set `instructional_text_in_media`: no valid round-3 output.
- No sampling parameters were sent.

### Evidence
- `spike-evidence/s-llm/fixtures.json` (hashes and sizes only)
- `spike-evidence/s-llm/runs.json` (all calls, usage, finish reasons, raw text, scores, model list)

### Design impact
- AI-04 / AI-05: pin the answered model id above in `GEMINI_MODEL` and write the response model id into every verdict-log row; the outages above show the outage path (route to the customer) must be exercised.
- AI-06: keep `Rubric.parse` on every output; Gemini ignores some JSON Schema constraints. The repeat gap above shows how much one judge's score moves on identical photos.
- AI-08: the sign probe result above is the baseline for injection handling; the prompt tells the model to flag instruction-like text, and Phase 5 still needs the code-level guard.
- Phase 5 timeouts: use at least the observed maximum latency (34433-159574 ms) plus margin; the spike used 120 s.

### Status
BLOCKED (gemini never answered: InternalServerError: 503 gemini-3.7-flash is currently experiencing high demand, spikes in demand are usually temporary. Please try again later.) - schema and timing only
