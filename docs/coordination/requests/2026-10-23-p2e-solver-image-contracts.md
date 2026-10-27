# Ship the solver's JSON Schemas in its Docker image

- Stream: P2E
- Streams affected: P6 (can validate seating requests the same way)
- Files: services/solver/Dockerfile

## What

Copy `services/solver/contracts/` into the image next to `src/`.

## Why

`POST /v1/timetable/solve` validates every request against
`contracts/timetable_v1.schema.json` and answers 422 with plain issues when it doesn't match.
The image only copies `src/`, so in Docker the schema file is missing and every solve fails
with a 500. (The path can also be set with `SOLVER_CONTRACTS_DIR`.)

## Exact proposed diff

```diff
 COPY src ./src
+COPY contracts ./contracts
 RUN uv sync --frozen --no-dev
```
