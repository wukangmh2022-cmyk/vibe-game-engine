#!/usr/bin/env python3
"""Run an auditable semantic judge over existing interaction evaluation results.

This never changes the real runtime pass/fail result.  It sends no hidden oracle,
reference implementation, run name, or candidate model name to the judge.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import statistics
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from .eval_config import DEFAULT_ENV_FILE, endpoint_from_profile, load_settings
    from .run_interaction_eval import DEFAULT_CASES, load_benchmark
    from .semantic_judge import JUDGE_SYSTEM, aggregate_judgments, canonical_hash, normalize_judgment, parse_json_object
except ImportError:
    from eval_config import DEFAULT_ENV_FILE, endpoint_from_profile, load_settings
    from run_interaction_eval import DEFAULT_CASES, load_benchmark
    from semantic_judge import JUDGE_SYSTEM, aggregate_judgments, canonical_hash, normalize_judgment, parse_json_object


def load_rows(path: Path) -> list[dict[str, Any]]:
    rows = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"{path}:{number} is not an object")
        rows.append(value)
    return rows


def runtime_evidence(row: dict[str, Any]) -> dict[str, Any]:
    runtime = row.get("runtime") if isinstance(row.get("runtime"), dict) else {}
    return {"runtime_valid": runtime.get("valid"), "runtime_errors": runtime.get("errors") or [], "main_results": runtime.get("mainResults") or [], "event_executions": runtime.get("eventExecutions") or [], "final_state": runtime.get("state") or {}}


def messages(case: dict[str, Any], row: dict[str, Any]) -> list[dict[str, str]]:
    candidate = row.get("sample") if isinstance(row.get("sample"), dict) else {"raw_output": row.get("raw_output", "")}
    prompt = {"user_request": case["intent"], "asset_catalog": case.get("asset_catalog", []), "candidate_level_json": candidate, "runtime_evidence": runtime_evidence(row)}
    return [{"role": "system", "content": JUDGE_SYSTEM}, {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)}]


def call_judge(config: dict[str, Any], prompt: list[dict[str, str]]) -> tuple[dict[str, Any], dict[str, Any], float]:
    started = time.monotonic()
    request = urllib.request.Request(
        config["api_base"].rstrip("/") + "/chat/completions",
        data=json.dumps({"model": config["model"], "messages": prompt, "temperature": 0, "max_tokens": 1400}).encode(),
        method="POST", headers={"Content-Type": "application/json", "Authorization": f"Bearer {config['api_key']}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=config["timeout"]) as response:
            payload = json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"HTTP {error.code}: {error.read().decode(errors='replace')[-500:]}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"connection failed: {error.reason}") from error
    choices = payload.get("choices") or []
    if not choices:
        raise RuntimeError("judge response has no choices")
    content = str(choices[0].get("message", {}).get("content") or "")
    return normalize_judgment(parse_json_object(content)), payload.get("usage") or {}, time.monotonic() - started


def evaluate_row(row: dict[str, Any], case: dict[str, Any], config: dict[str, Any], passes: int) -> dict[str, Any]:
    candidate = row.get("sample") if isinstance(row.get("sample"), dict) else row.get("raw_output", "")
    result: dict[str, Any] = {"case_id": case["id"], "run": str(row.get("run") or row.get("run_label") or "unlabeled"), "candidate_hash": canonical_hash(candidate), "hard_runtime_passed": bool(row.get("passed")), "judgments": []}
    prompt = messages(case, row)
    for index in range(passes):
        try:
            judgment, usage, latency = call_judge(config, prompt)
            result["judgments"].append({"pass_index": index + 1, "judgment": judgment, "usage": usage, "latency_seconds": round(latency, 3)})
        except Exception as error:
            result["judgments"].append({"pass_index": index + 1, "error": str(error)})
    result["aggregate"] = aggregate_judgments(result["judgments"], passes)
    result["combined_passed"] = result["hard_runtime_passed"] and result["aggregate"]["aggregate_decision"] == "pass"
    return result


def make_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    groups = {"runtime_passed": [], "runtime_failed": []}
    for record in records:
        groups["runtime_passed" if record["hard_runtime_passed"] else "runtime_failed"].append(record)
    result: dict[str, Any] = {"total": len(records), "by_runtime_gate": {}}
    for name, group in groups.items():
        scores = [item["aggregate"]["semantic_score_mean"] for item in group if item["aggregate"]["semantic_score_mean"] is not None]
        dimension_names = next((item["aggregate"]["dimension_score_means"].keys() for item in group if item["aggregate"].get("dimension_score_means")), [])
        dimension_means = {
            dimension: round(statistics.mean(values), 3) if (values := [item["aggregate"]["dimension_score_means"].get(dimension) for item in group if item["aggregate"]["dimension_score_means"].get(dimension) is not None]) else None
            for dimension in dimension_names
        }
        result["by_runtime_gate"][name] = {"total": len(group), "combined_passed": sum(bool(item.get("combined_passed")) for item in group), "semantic_pass": sum(item["aggregate"]["aggregate_decision"] == "pass" for item in group), "semantic_fail": sum(item["aggregate"]["aggregate_decision"] == "fail" for item in group), "human_review": sum(item["aggregate"]["needs_human_review"] for item in group), "mean_semantic_score": round(statistics.mean(scores), 3) if scores else None, "mean_dimension_scores": dimension_means}
    result["by_run"] = {}
    for run in sorted({record["run"] for record in records}):
        group = [record for record in records if record["run"] == run]
        scores = [item["aggregate"]["semantic_score_mean"] for item in group if item["aggregate"]["semantic_score_mean"] is not None]
        dimension_names = next((item["aggregate"]["dimension_score_means"].keys() for item in group if item["aggregate"].get("dimension_score_means")), [])
        dimension_means = {
            dimension: round(statistics.mean(values), 3) if (values := [item["aggregate"]["dimension_score_means"].get(dimension) for item in group if item["aggregate"]["dimension_score_means"].get(dimension) is not None]) else None
            for dimension in dimension_names
        }
        result["by_run"][run] = {
            "total": len(group),
            "hard_runtime_passed": sum(item["hard_runtime_passed"] for item in group),
            "semantic_passed": sum(item["aggregate"]["aggregate_decision"] == "pass" for item in group),
            "combined_passed": sum(item["combined_passed"] for item in group),
            "human_review": sum(item["aggregate"]["needs_human_review"] for item in group),
            "mean_semantic_score": round(statistics.mean(scores), 3) if scores else None,
            "mean_dimension_scores": dimension_means,
        }
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit semantic fidelity without changing runtime pass/fail")
    parser.add_argument("results", type=Path, help="results.jsonl from run_interaction_eval.py")
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--passes", type=int, default=3)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--output-dir", type=Path, default=None)
    args = parser.parse_args()
    if not 2 <= args.passes <= 5:
        parser.error("--passes must be from 2 to 5")
    if not 1 <= args.workers <= 8:
        parser.error("--workers must be from 1 to 8")
    config = {**endpoint_from_profile("judge", load_settings(args.env_file)), "timeout": args.timeout}
    cases = {case["id"]: case for case in load_benchmark(args.cases).get("cases", [])}
    rows = load_rows(args.results)
    unknown = sorted({str(row.get("case_id")) for row in rows if row.get("case_id") not in cases})
    if unknown:
        raise SystemExit("results contain unknown case IDs: " + ", ".join(unknown[:10]))
    output_dir = args.output_dir or args.results.parent / f"semantic-judge-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    output_dir.mkdir(parents=True, exist_ok=False)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(evaluate_row, row, cases[row["case_id"]], config, args.passes) for row in rows]
        records = [future.result() for future in concurrent.futures.as_completed(futures)]
    records.sort(key=lambda item: (item["case_id"], item["candidate_hash"]))
    (output_dir / "judgments.jsonl").write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in records), encoding="utf-8")
    audit = {"schema_version": "vge-semantic-judge-v2", "created_at": datetime.now(timezone.utc).isoformat(), "judge_model": config["model"], "temperature": 0, "passes_per_candidate": args.passes, "source_results": str(args.results), "cases": str(args.cases), "candidate_identity_blinded": True, "reference_output_shared": False, "hidden_oracle_shared": False, "summary": make_summary(records), "policy": "Production pass requires both hard runtime success and a blind semantic pass; neither result overwrites the other."}
    (output_dir / "summary.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output_dir": str(output_dir), "summary": audit["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
