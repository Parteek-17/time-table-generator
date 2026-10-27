"""solver-timetable.v1 JSON Schema (services/solver/contracts/timetable_v1.schema.json)."""

from __future__ import annotations

import json
import os
from functools import cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

VERSION = "solver-timetable.v1"


def _schema_path() -> Path:
    base = os.environ.get("SOLVER_CONTRACTS_DIR")
    root = Path(base) if base else Path(__file__).resolve().parents[3] / "contracts"
    return root / "timetable_v1.schema.json"


@cache
def _validator(name: str) -> Draft202012Validator:
    schema = json.loads(_schema_path().read_text(encoding="utf-8"))
    return Draft202012Validator({"$defs": schema["$defs"], "$ref": f"#/$defs/{name}"})


def _issues(name: str, doc: Any) -> list[str]:
    errors = sorted(_validator(name).iter_errors(doc), key=lambda e: list(e.absolute_path))
    return [f"{'/'.join(str(p) for p in e.absolute_path) or '(root)'}: {e.message}" for e in errors]


def request_issues(doc: Any) -> list[str]:
    return _issues("SolverTimetableRequestV1", doc)


def response_issues(doc: Any) -> list[str]:
    return _issues("SolverTimetableResponseV1", doc)
