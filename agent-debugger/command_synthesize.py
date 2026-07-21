#!/usr/bin/env python3
"""Parallel native tool-call synthesis for command-mapping SFT data."""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import subprocess
import threading
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

from build_command_db import ROOT as REPO_ROOT
from command_db import CommandDatabase, build_command_database, resource_refs
from command_validator import CommandSampleValidator

DEBUGGER = REPO_ROOT / "agent-debugger"
MOTIF_TYPES = {
    "SHOW_IMAGE", "SHOW_CHOICES", "SET_CLICKABLE", "SET_DRAGGABLE",
    "CREATE_DROP_ZONE", "CHECK_IN_AREA", "FLIP_CARD", "SET_VARIABLE",
    "IF_CONDITION", "SCENE_REDIRECT", "NEXT_LEVEL", "UPDATE_TEXT",
}


DECISION_SCHEMA = {
    "type": "object",
    "properties": {
        "goal": {"type": "string", "maxLength": 240},
        "evidence": {"type": "string", "maxLength": 400},
        "hypothesis": {"type": "string", "maxLength": 240},
        "verification": {"type": "string", "maxLength": 240},
    },
    "required": ["goal", "evidence", "hypothesis", "verification"],
    "additionalProperties": False,
}


def tool(name: str, description: str, properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": {"decision": DECISION_SCHEMA, **properties},
                "required": ["decision", *required],
                "additionalProperties": False,
            },
        },
    }


TOOLS = [
    tool("find_command_examples", "Find compact real examples by command type or semantic term.", {"command_type": {"type": "string"}, "query": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 10}}, []),
    tool("get_command_context", "Get one command and up to ten nearby commands from its original command stream.", {"command_key": {"type": "string"}, "before": {"type": "integer", "minimum": 0, "maximum": 10}, "after": {"type": "integer", "minimum": 0, "maximum": 10}}, ["command_key"]),
    tool("get_level_metadata", "Get compact level metadata without loading full scene JSON.", {"level_key": {"type": "string"}}, ["level_key"]),
    tool("validate_sample", "Validate a candidate command mapping sample. Fix returned errors before finishing.", {"sample": {"type": "object"}}, ["sample"]),
    tool("finish", "Finish with a sample only after validate_sample returned valid=true.", {"sample": {"type": "object"}}, ["sample"]),
]


def compact(value: Any, limit: int = 3000) -> str:
    return json.dumps(value, ensure_ascii=False)[-limit:]


def decision(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ValueError("decision is required")
    keys = ("goal", "evidence", "hypothesis", "verification")
    if any(not isinstance(value.get(key), str) or not value[key].strip() for key in keys):
        raise ValueError("decision requires non-empty goal, evidence, hypothesis, verification")
    return {key: value[key][:400] for key in keys}


def call_teacher(config: dict[str, Any], messages: list[dict[str, Any]], use_tools: bool = True) -> dict[str, Any]:
    endpoint = config["api_base"].rstrip("/") + "/chat/completions"
    payload: dict[str, Any] = {
        "model": config["model"],
        "messages": messages,
        "temperature": config["temperature"],
        "max_tokens": config["max_tokens"],
    }
    if use_tools:
        payload["tools"] = TOOLS
        payload["tool_choice"] = "auto"
    request = urllib.request.Request(endpoint, data=json.dumps(payload).encode("utf-8"), method="POST", headers={"Content-Type": "application/json"})
    if config["api_key"]:
        request.add_header("Authorization", f"Bearer {config['api_key']}")
    try:
        with urllib.request.urlopen(request, timeout=config["timeout"]) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"teacher API HTTP {error.code}: {error.read().decode('utf-8', errors='replace')[-800:]}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"teacher API connection failed: {error.reason}") from error


def fallback_tool_call(content: str) -> list[dict[str, Any]]:
    """Allow local APIs without native tool_call serialization to use JSON envelopes."""
    try:
        value = parse_json_object(content)
        if isinstance(value, dict) and isinstance(value.get("tool"), str) and isinstance(value.get("arguments"), dict):
            return [{"id": "json-envelope", "type": "function", "function": {"name": value["tool"], "arguments": json.dumps(value["arguments"], ensure_ascii=False)}}]
    except Exception:
        pass
    return []


def parse_json_object(content: str) -> dict[str, Any]:
    """Extract the single JSON object required by the compatibility protocol."""
    value = json.loads(content.strip())
    if not isinstance(value, dict):
        raise ValueError("response must be one JSON object")
    return value


class CommandToolOperator:
    def __init__(self, database: CommandDatabase, primary_type: str, sample_mode: str):
        self.database = database
        self.primary_type = primary_type
        self.sample_mode = sample_mode
        self.validator = CommandSampleValidator(database)
        self.exposed_assets: set[str] = set()
        self.source_examples: list[str] = []
        self.last_validation: dict[str, Any] = {"valid": False, "errors": ["validate_sample has not run"], "warnings": []}

    def _expose(self, examples: list[dict[str, Any]]) -> None:
        for example in examples:
            self.source_examples.append(example["command_key"])
            for _, resource_id in resource_refs(example["command"].get("parameters", {})):
                self.exposed_assets.add(resource_id)

    def find_command_examples(self, command_type: str = "", query: str = "", limit: int = 5) -> dict[str, Any]:
        examples = self.database.find_commands(command_type, query, limit)
        self._expose(examples)
        return {"examples": examples}

    def get_command_context(self, command_key: str, before: int = 5, after: int = 5) -> dict[str, Any]:
        result = self.database.command_context(command_key, before, after)
        self._expose([{**item, "level_key": result["target"]["level_key"], "scene_path": result["target"]["scene_path"], "level_name": result["target"]["level_name"]} for item in result["commands"]])
        return result

    def get_level_metadata(self, level_key: str) -> dict[str, Any]:
        return self.database.level_metadata(level_key)

    def validate_sample(self, sample: dict[str, Any]) -> dict[str, Any]:
        minimum = 2 if self.sample_mode == "motif" else 1
        self.last_validation = self.validator.validate(sample, self.primary_type, minimum, self.exposed_assets)
        return self.last_validation

    def finish(self, sample: dict[str, Any]) -> dict[str, Any]:
        validation = self.validate_sample(sample)
        if not validation["valid"]:
            return {"accepted": False, "validation": validation}
        return {"accepted": True, "sample": sample, "validation": validation}


def static_prompt(tool_protocol: str) -> str:
    prompt = "\n\n".join([
        (DEBUGGER / "prompts" / "command-synthesis.md").read_text(encoding="utf-8"),
        "Authoritative DSL sources: level-editor/src/guides/promptGuideInline.ts; level-editor/src/utils/commandTemplates.ts; src/commands/factory.ts. The database tools expose only real project examples and compact context.",
    ])
    if tool_protocol == "json-envelope":
        prompt += "\n\nTransport protocol: this local endpoint does not reliably serialize OpenAI tool_calls. For every tool action, reply with ONLY one JSON object: {\"tool\": \"tool_name\", \"arguments\": {\"decision\": {\"goal\": \"...\", \"evidence\": \"...\", \"hypothesis\": \"...\", \"verification\": \"...\"}, ...tool arguments...}}. Do not use Markdown or YAML. After every tool result, decide the next single tool yourself."
    return prompt


def make_jobs(database: CommandDatabase, samples: int | None, per_command: int | None) -> list[dict[str, Any]]:
    command_types = [item["command_type"] for item in database.stats()["command_types"]]
    def job(command_type: str, variant: int) -> dict[str, Any]:
        mode = "motif" if command_type in MOTIF_TYPES and variant % 4 != 0 else "atomic"
        return {"command_type": command_type, "variant": variant, "sample_mode": mode}
    if per_command is not None:
        return [job(command_type, variant) for command_type in command_types for variant in range(per_command)]
    assert samples is not None
    return [job(command_types[index % len(command_types)], index // len(command_types)) for index in range(samples)]


def accepted_record(job_id: int, job: dict[str, Any], sample: dict[str, Any], validation: dict[str, Any], trace: list[dict[str, Any]], operator: CommandToolOperator) -> tuple[dict[str, Any], dict[str, Any]]:
    record = {
        "schema_version": "command-agent-sft-v1",
        "sample_id": f"cmd-{job_id:05d}",
        "primary_command_type": job["command_type"],
        "sample_mode": job["sample_mode"],
        "input": {"intent": sample["intent"], "asset_catalog": sample.get("asset_catalog", [])},
        "output": {"commands": sample["commands"]},
        "tool_trace": trace,
        "source_examples": sorted(set(operator.source_examples)),
        "validation": validation,
    }
    return record, {"sample_id": record["sample_id"], "status": "success", "tool_calls": len(trace)}


def run_job(job_id: int, job: dict[str, Any], database_path: Path, config: dict[str, Any], system: str) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    operator = CommandToolOperator(CommandDatabase(database_path), job["command_type"], job["sample_mode"])
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps({"assigned_primary_command_type": job["command_type"], "sample_mode": job["sample_mode"], "variant_number": job["variant"]}, ensure_ascii=False)},
    ]
    trace: list[dict[str, Any]] = []
    try:
        while len(trace) < config["max_actions"]:
            json_envelope = config["tool_protocol"] == "json-envelope"
            response = call_teacher(config, messages, use_tools=not json_envelope)
            choices = response.get("choices") if isinstance(response, dict) else None
            if not isinstance(choices, list) or not choices:
                raise RuntimeError("teacher response has no choices")
            message = choices[0].get("message", {})
            content = message.get("content") or ""
            calls = message.get("tool_calls") or fallback_tool_call(content)
            if not calls:
                raise RuntimeError(f"teacher returned no tool call: {str(content)[:800]}")
            # One completion may contain several calls; execute only one so the cap is
            # measured in actual tool actions and every action gets fresh evidence.
            calls = calls[:1]
            if json_envelope:
                messages.append({"role": "assistant", "content": content})
            else:
                messages.append({"role": "assistant", "content": content, "tool_calls": calls})
            for call in calls:
                function = call.get("function", {})
                name = function.get("name")
                arguments: dict[str, Any] = {}
                tool_decision: dict[str, str] = {}
                try:
                    arguments = json.loads(function.get("arguments", "{}"))
                    tool_decision = decision(arguments.pop("decision"))
                    if name == "find_command_examples":
                        observation = operator.find_command_examples(arguments.get("command_type", ""), arguments.get("query", ""), int(arguments.get("limit", 5)))
                    elif name == "get_command_context":
                        observation = operator.get_command_context(arguments["command_key"], int(arguments.get("before", 5)), int(arguments.get("after", 5)))
                    elif name == "get_level_metadata":
                        observation = operator.get_level_metadata(arguments["level_key"])
                    elif name == "validate_sample":
                        observation = operator.validate_sample(arguments["sample"])
                    elif name == "finish":
                        observation = operator.finish(arguments["sample"])
                    else:
                        raise ValueError(f"unknown tool: {name}")
                    status = "ok"
                except Exception as error:
                    observation = {"error": str(error)}
                    status = "error"
                trace.append({"turn": len(trace) + 1, "decision": tool_decision, "tool": name, "arguments": arguments, "observation": {"status": status, "summary": compact(observation)}})
                if json_envelope:
                    messages.append({"role": "user", "content": json.dumps({"tool_result": {"tool": name, "result": observation}}, ensure_ascii=False)})
                else:
                    messages.append({"role": "tool", "tool_call_id": call.get("id", f"call-{len(trace)}"), "content": json.dumps(observation, ensure_ascii=False)})
                if status == "error":
                    continue
                if name == "finish" and observation.get("accepted"):
                    sample = observation["sample"]
                    return accepted_record(job_id, job, sample, observation["validation"], trace, operator)

        messages.append({
            "role": "user",
            "content": "Tool-action cap reached. Using the complete conversation and tool results above, now produce the best final sample. Do not call tools. Reply with ONLY the final sample JSON object matching the required schema; no Markdown, explanation, or wrapper.",
        })
        response = call_teacher(config, messages, use_tools=False)
        choices = response.get("choices") if isinstance(response, dict) else None
        if not isinstance(choices, list) or not choices:
            raise RuntimeError("teacher final response has no choices")
        final_content = choices[0].get("message", {}).get("content") or ""
        sample = parse_json_object(final_content)
        observation = operator.finish(sample)
        trace.append({
            "turn": len(trace) + 1,
            "decision": {},
            "tool": "forced_final_validation",
            "arguments": {"sample": sample},
            "observation": {"status": "ok", "summary": compact(observation)},
        })
        if observation.get("accepted"):
            return accepted_record(job_id, job, observation["sample"], observation["validation"], trace, operator)
        raise RuntimeError(f"max_actions={config['max_actions']} reached and forced final sample failed validation: {compact(observation, 800)}")
    except Exception as error:
        return None, {"sample_id": f"cmd-{job_id:05d}", "status": "failed", "error": str(error), "tool_calls": len(trace)}


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Parallel tool-call synthesis of Vibe command mappings")
    sample_group = parser.add_mutually_exclusive_group(required=True)
    sample_group.add_argument("--samples", type=int, help="Total samples, distributed across command types")
    sample_group.add_argument("--per-command", type=int, help="Samples for every indexed command type")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--project", default=str(REPO_ROOT / "customer-demo"))
    parser.add_argument("--api-base", default=os.getenv("VIBE_TEACHER_API_BASE", ""))
    parser.add_argument("--api-key", default=os.getenv("VIBE_TEACHER_API_KEY", ""))
    parser.add_argument("--model", default=os.getenv("VIBE_TEACHER_MODEL", ""))
    parser.add_argument("--max-tokens", type=int, default=int(os.getenv("VIBE_TEACHER_MAX_TOKENS", "1200")))
    parser.add_argument("--max-actions", type=int, default=int(os.getenv("VIBE_TEACHER_MAX_ACTIONS", "20")))
    parser.add_argument("--tool-protocol", choices=("openai", "json-envelope"), default=os.getenv("VIBE_TEACHER_TOOL_PROTOCOL", "openai"), help="Use json-envelope for endpoints that return tool calls as plain text")
    parser.add_argument("--temperature", type=float, default=0.2)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.workers < 1 or args.max_actions < 1 or (args.samples is not None and args.samples < 1) or (args.per_command is not None and args.per_command < 1):
        parser.error("workers, max-actions, and sample counts must be positive")
    if not args.dry_run and (not args.api_base or not args.model):
        parser.error("set API/model through arguments or VIBE_TEACHER_API_BASE/VIBE_TEACHER_MODEL")

    database_path = DEBUGGER / "state" / "command-index.sqlite"
    build_command_database(Path(args.project), database_path)
    jobs = make_jobs(CommandDatabase(database_path), args.samples, args.per_command)
    run_id = datetime.now().strftime("command-agent-%Y%m%d-%H%M%S")
    run_dir = DEBUGGER / "runs" / "command-agent" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    if args.dry_run:
        write_json(run_dir / "manifest.json", {"run_id": run_id, "status": "dry_run", "workers": args.workers, "job_count": len(jobs), "jobs": jobs})
        print(json.dumps({"run_dir": str(run_dir), "status": "dry_run", "job_count": len(jobs), "workers": args.workers}, ensure_ascii=False))
        return 0

    config = {key: getattr(args, key) for key in ("api_base", "api_key", "model", "max_tokens", "max_actions", "temperature", "timeout", "tool_protocol")}
    system = static_prompt(args.tool_protocol)
    records: list[dict[str, Any]] = []
    states: list[dict[str, Any]] = []
    lock = threading.Lock()

    def worker(worker_id: int, indexed_jobs: list[tuple[int, dict[str, Any]]]) -> None:
        local_states: list[dict[str, Any]] = []
        for job_id, job in indexed_jobs:
            record, state = run_job(job_id, job, database_path, config, system)
            local_states.append(state)
            write_json(run_dir / f"worker-{worker_id:02d}.json", {"worker_id": worker_id, "updated_at": datetime.now().isoformat(), "samples": local_states})
            with lock:
                states.append(state)
                if record:
                    records.append(record)

    indexed = list(enumerate(jobs, 1))
    buckets = [indexed[index::args.workers] for index in range(args.workers)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(worker, index, bucket) for index, bucket in enumerate(buckets)]
        for future in futures:
            future.result()

    records.sort(key=lambda item: item["sample_id"])
    output = REPO_ROOT / "training-data" / "command-agent-sft" / f"{run_id}.jsonl"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records), encoding="utf-8")
    manifest = {
        "run_id": run_id,
        "workers": args.workers,
        "requested_samples": len(jobs),
        "accepted_samples": len(records),
        "failed_samples": len([state for state in states if state["status"] == "failed"]),
        "output": str(output.relative_to(REPO_ROOT)),
        "states": states,
    }
    write_json(run_dir / "manifest.json", manifest)
    print(json.dumps({"run_dir": str(run_dir), **{key: manifest[key] for key in ("requested_samples", "accepted_samples", "failed_samples", "output")}}, ensure_ascii=False))
    return 0 if manifest["accepted_samples"] == manifest["requested_samples"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
