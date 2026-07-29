#!/usr/bin/env python3
"""Measure OpenAI-compatible vLLM throughput at several client concurrency levels."""

from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import subprocess
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import aiohttp


PROMPTS = [
    "Return a JSON object with the key status and value ok.",
    "Explain in one sentence why batching improves GPU throughput.",
    "Write a short JSON array containing three color names.",
    "State one practical benefit of LoRA adapters.",
]


@dataclass
class Result:
    concurrency: int
    requested: int
    completed: int
    failures: int
    elapsed_seconds: float
    completion_tokens: int
    tokens_per_second: float
    requests_per_second: float
    p50_latency_seconds: float | None
    p95_latency_seconds: float | None
    peak_gpu_memory_mib: int | None


def gpu_memory_mib() -> int | None:
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            check=True,
            capture_output=True,
            text=True,
            timeout=3,
        )
        return max(int(value.strip()) for value in result.stdout.splitlines() if value.strip())
    except Exception:
        return None


async def request_one(session: aiohttp.ClientSession, url: str, model: str, prompt: str, max_tokens: int) -> tuple[float, int, str | None]:
    started = time.perf_counter()
    try:
        async with session.post(
            url,
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0,
                "max_tokens": max_tokens,
            },
        ) as response:
            payload = await response.json(content_type=None)
            latency = time.perf_counter() - started
            if response.status >= 400:
                return latency, 0, str(payload)
            choices = payload.get("choices") or []
            if not choices:
                return latency, 0, str(payload)
            return latency, int((payload.get("usage") or {}).get("completion_tokens") or 0), None
    except Exception as error:
        return time.perf_counter() - started, 0, str(error)


async def run_level(args: argparse.Namespace, concurrency: int) -> Result:
    url = args.api_base.rstrip("/") + "/chat/completions"
    semaphore = asyncio.Semaphore(concurrency)
    peak_memory: int | None = gpu_memory_mib()

    async def bounded(index: int, session: aiohttp.ClientSession) -> tuple[float, int, str | None]:
        nonlocal peak_memory
        async with semaphore:
            memory = gpu_memory_mib()
            if memory is not None:
                peak_memory = max(peak_memory or memory, memory)
            return await request_one(session, url, args.model, PROMPTS[index % len(PROMPTS)], args.max_tokens)

    timeout = aiohttp.ClientTimeout(total=args.timeout)
    started = time.perf_counter()
    async with aiohttp.ClientSession(timeout=timeout) as session:
        responses = await asyncio.gather(*(bounded(index, session) for index in range(args.requests)))
    elapsed = time.perf_counter() - started
    successes = [(latency, tokens) for latency, tokens, error in responses if error is None]
    latencies = sorted(latency for latency, _ in successes)
    completion_tokens = sum(tokens for _, tokens in successes)
    p50 = statistics.median(latencies) if latencies else None
    p95 = latencies[min(len(latencies) - 1, int(len(latencies) * 0.95))] if latencies else None
    return Result(
        concurrency=concurrency,
        requested=args.requests,
        completed=len(successes),
        failures=args.requests - len(successes),
        elapsed_seconds=round(elapsed, 3),
        completion_tokens=completion_tokens,
        tokens_per_second=round(completion_tokens / elapsed, 3) if elapsed else 0.0,
        requests_per_second=round(len(successes) / elapsed, 3) if elapsed else 0.0,
        p50_latency_seconds=round(p50, 3) if p50 is not None else None,
        p95_latency_seconds=round(p95, 3) if p95 is not None else None,
        peak_gpu_memory_mib=peak_memory,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-base", default="http://127.0.0.1:6006/v1")
    parser.add_argument("--model", required=True)
    parser.add_argument("--concurrency", type=int, nargs="+", default=[1, 2, 4, 8, 16])
    parser.add_argument("--requests", type=int, default=64, help="Requests per concurrency level.")
    parser.add_argument("--max-tokens", type=int, default=256)
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.requests < 1 or any(value < 1 for value in args.concurrency):
        parser.error("request count and concurrency must be positive")
    results = [asyncio.run(run_level(args, level)) for level in args.concurrency]
    payload = [asdict(result) for result in results]
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
