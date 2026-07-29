"""Pure helpers for an auditable, blinded LLM semantic judge."""

from __future__ import annotations

import hashlib
import json
import re
import statistics
from typing import Any


DIMENSION_WEIGHTS = {
    "requirement_coverage": 0.25,
    "behavioral_correctness": 0.25,
    "resource_grounding": 0.15,
    "interaction_feedback": 0.15,
    "layout_presentation": 0.10,
    "scope_control": 0.10,
}

JUDGE_SYSTEM = """你是独立的 2D 游戏关卡编辑结果评审员。候选身份已盲化；不得猜测它来自 Base、微调模型或哪次实验。只根据用户需求、可用资源、候选关卡 JSON 和 runtime evidence 评判，不得要求参考答案中的特定 ID、变量名、信号名、命令顺序或实现写法。

先把用户需求拆成所有实质要求，再逐项给出 met/unmet/unclear 和候选中的简短证据。runtime evidence 是事实：失败或缺失不能被臆测为成功；但 runtime 通过也不代表语义完整。不要因为命令更多而加分，不要奖励题面没有要求的功能。没有截图时，只能根据坐标、尺寸、层级、皮肤和反馈参数判断呈现是否合理；使用引擎默认皮肤或省略非必要样式本身不扣分。

六个固定维度均给 0-10 分和简短证据：
1. requirement_coverage：用户的显式目标、状态变化和限制是否完整。
2. behavioral_correctness：交互、时序、条件分支和跨流程因果是否真的连通。
3. resource_grounding：只使用给定且类型正确的资源，引用与用途合理。
4. interaction_feedback：可操作对象、阻塞关系、选中/成功/失败反馈是否符合需求。
5. layout_presentation：在给定画布内的位置、尺寸、层级和可读性是否合理。
6. scope_control：没有资源幻觉、无关行为、擅自数值或绕开真实需求。

只返回一个 JSON 对象，不要 Markdown：
{"requirements":[{"requirement":"简短中文要求","verdict":"met|unmet|unclear","evidence":"简短证据"}],"dimensions":{"requirement_coverage":{"score":0,"evidence":""},"behavioral_correctness":{"score":0,"evidence":""},"resource_grounding":{"score":0,"evidence":""},"interaction_feedback":{"score":0,"evidence":""},"layout_presentation":{"score":0,"evidence":""},"scope_control":{"score":0,"evidence":""}},"decision":"pass|review|fail","confidence":0.0,"rationale":"简短中文结论"}

pass 仅用于全部实质要求均 met 且整体达到生产可用；任一实质要求 unmet 为 fail；证据不足或存在 unclear 为 review。"""


def canonical_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def parse_json_object(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
        text = re.sub(r"\s*```$", "", text)
    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("judge response did not contain a JSON object")
        result = json.loads(text[start : end + 1])
    if not isinstance(result, dict):
        raise ValueError("judge response must be an object")
    return result


def normalize_judgment(value: dict[str, Any]) -> dict[str, Any]:
    raw_decision = str(value.get("decision") or "").lower()
    confidence = value.get("confidence")
    requirements = value.get("requirements")
    dimensions = value.get("dimensions")
    if raw_decision not in {"pass", "review", "fail"}:
        raise ValueError("judge decision must be pass, review, or fail")
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
        raise ValueError("judge confidence must be numeric from 0 to 1")
    if not isinstance(requirements, list) or not requirements:
        raise ValueError("judge requirements must be a non-empty array")
    if not isinstance(dimensions, dict) or set(dimensions) != set(DIMENSION_WEIGHTS):
        raise ValueError("judge dimensions must contain exactly the six scoring dimensions")
    normalized = []
    for item in requirements:
        verdict = str(item.get("verdict") or "") if isinstance(item, dict) else ""
        if verdict not in {"met", "unmet", "unclear"}:
            raise ValueError("every judge requirement needs verdict met, unmet, or unclear")
        requirement = str(item.get("requirement") or "").strip()
        evidence = str(item.get("evidence") or "").strip()
        if not requirement or not evidence:
            raise ValueError("every judge requirement needs non-empty requirement and evidence")
        normalized.append({"requirement": requirement, "verdict": verdict, "evidence": evidence})

    normalized_dimensions: dict[str, dict[str, Any]] = {}
    for name in DIMENSION_WEIGHTS:
        item = dimensions[name]
        score = item.get("score") if isinstance(item, dict) else None
        evidence = str(item.get("evidence") or "").strip() if isinstance(item, dict) else ""
        if isinstance(score, bool) or not isinstance(score, (int, float)) or not 0 <= score <= 10:
            raise ValueError(f"judge dimension {name} score must be numeric from 0 to 10")
        if not evidence:
            raise ValueError(f"judge dimension {name} needs evidence")
        normalized_dimensions[name] = {"score": round(float(score), 3), "evidence": evidence}

    semantic_score = round(sum(normalized_dimensions[name]["score"] * weight for name, weight in DIMENSION_WEIGHTS.items()), 3)
    verdicts = {item["verdict"] for item in normalized}
    coverage = normalized_dimensions["requirement_coverage"]["score"]
    behavior = normalized_dimensions["behavioral_correctness"]["score"]
    if "unmet" in verdicts or semantic_score < 4 or min(coverage, behavior) < 4:
        decision = "fail"
    elif verdicts == {"met"} and semantic_score >= 8 and min(coverage, behavior) >= 8:
        decision = "pass"
    else:
        decision = "review"
    return {
        "requirements": normalized, "dimensions": normalized_dimensions,
        "semantic_score": semantic_score, "decision": decision,
        "judge_decision_raw": raw_decision, "decision_consistent": raw_decision == decision,
        "confidence": round(float(confidence), 3), "rationale": str(value.get("rationale") or "").strip(),
    }


def aggregate_judgments(records: list[dict[str, Any]], expected_passes: int) -> dict[str, Any]:
    valid = [record["judgment"] for record in records if isinstance(record.get("judgment"), dict)]
    scores = [item["semantic_score"] for item in valid]
    votes = {name: sum(item["decision"] == name for item in valid) for name in ("pass", "review", "fail")}
    deviation = statistics.pstdev(scores) if len(scores) >= 2 else 0.0
    inconsistent_decisions = sum(not item.get("decision_consistent", False) for item in valid)
    if len(valid) != expected_passes or inconsistent_decisions:
        decision = "review"
    elif votes["pass"] == expected_passes and deviation <= 1.0:
        decision = "pass"
    elif votes["fail"] == expected_passes and deviation <= 1.0:
        decision = "fail"
    else:
        decision = "review"
    dimension_means = {
        name: round(statistics.mean(item["dimensions"][name]["score"] for item in valid), 3)
        for name in DIMENSION_WEIGHTS
    } if valid else {name: None for name in DIMENSION_WEIGHTS}
    return {"valid_passes": len(valid), "expected_passes": expected_passes, "inconsistent_raw_decisions": inconsistent_decisions, "semantic_score_mean": round(statistics.mean(scores), 3) if scores else None, "semantic_score_stdev": round(deviation, 3) if scores else None, "dimension_score_means": dimension_means, "decision_votes": votes, "aggregate_decision": decision, "needs_human_review": decision == "review"}
