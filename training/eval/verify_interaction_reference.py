#!/usr/bin/env python3
"""Prove the v2 interaction benchmark accepts its known-good implementations."""

from __future__ import annotations

import json
import concurrent.futures
from pathlib import Path
from typing import Any

try:
    from .run_interaction_eval import DEFAULT_CASES, load_benchmark, run_runtime, validate_output
except ImportError:
    from run_interaction_eval import DEFAULT_CASES, load_benchmark, run_runtime, validate_output


HERE = Path(__file__).resolve().parent
DEFAULT_REFERENCES = DEFAULT_CASES


def verify(cases_path: Path = DEFAULT_CASES, references_path: Path = DEFAULT_REFERENCES) -> dict[str, Any]:
    cases_document = load_benchmark(cases_path)
    cases = {case["id"]: case for case in cases_document["cases"]}
    references = {case_id: case.get("reference_output") for case_id, case in cases.items()}
    def verify_case(case_id: str, case: dict[str, Any]) -> dict[str, Any]:
        output = references.get(case_id)
        if output is None:
            return {"case_id": case_id, "passed": False, "error": "reference output is missing"}
        validation = validate_output(output, case)
        runtime = run_runtime(output, case, timeout=10) if validation["valid"] else None
        passed = bool(validation["valid"]) and bool(runtime and runtime.get("valid")) and bool((runtime.get("interaction") or {}).get("passed"))
        return {
            "case_id": case_id, "passed": passed,
            "structural_passed": bool(validation["valid"]),
            "runtime_passed": bool(runtime and runtime.get("valid")),
            "oracle_passed": bool((runtime or {}).get("interaction", {}).get("passed")),
            **({"errors": validation["errors"]} if not validation["valid"] else {}),
            **({"runtime_errors": runtime.get("errors")} if runtime and not runtime.get("valid") else {}),
        }

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda item: verify_case(*item), cases.items()))
    for case_id in sorted(set(references) - set(cases)):
        results.append({"case_id": case_id, "passed": False, "error": "reference has no matching benchmark case"})
    return {"total": len(results), "passed": sum(bool(row["passed"]) for row in results), "failed": sum(not bool(row["passed"]) for row in results), "results": results}


def main() -> int:
    result = verify()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
