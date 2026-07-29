#!/usr/bin/env python3
"""Serve a Qwen level-authoring LoRA over OpenAI-compatible HTTP."""

from __future__ import annotations

import argparse
import shutil
import tempfile
import threading
import time
import uuid
import zipfile
from pathlib import Path
from typing import Any

import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from huggingface_hub import snapshot_download
from peft import PeftModel
from pydantic import BaseModel, Field
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig


SCRIPT_DIR = Path(__file__).resolve().parent
QLORA_DIR = SCRIPT_DIR if SCRIPT_DIR.name == "qlora" and SCRIPT_DIR.parent.name == "training" else SCRIPT_DIR
DEFAULT_MODEL_ID = "Qwen/Qwen3.5-9B"
DEFAULT_MODEL_DIR = QLORA_DIR / "models" / "Qwen3.5-9B"
DEFAULT_ADAPTER_ARCHIVE = QLORA_DIR / "adapters.zip"
DEFAULT_ADAPTER_DIR = QLORA_DIR / "adapters" / "vibe-level-qwen35-9b"
DEFAULT_SERVICE_MODEL_NAME = "vibe-level-qwen35-9b"


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    messages: list[ChatMessage]
    model: str | None = None
    max_tokens: int = Field(default=1024, ge=1, le=4096)
    temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    top_p: float = Field(default=1.0, gt=0.0, le=1.0)
    repetition_penalty: float = Field(default=1.0, ge=0.5, le=2.0)
    stream: bool = False


def has_adapter_files(adapter_dir: Path) -> bool:
    return (adapter_dir / "adapter_config.json").is_file() and (adapter_dir / "adapter_model.safetensors").is_file()


def extract_adapter_archive(archive: Path, adapter_dir: Path) -> None:
    """Extract one PEFT adapter directory while rejecting path traversal entries."""
    if not archive.is_file():
        raise FileNotFoundError(
            f"adapter files are missing at {adapter_dir} and archive was not found at {archive}. "
            "Copy adapters.zip to that path or pass --adapter-archive."
        )

    adapter_dir.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="adapter-unpack-", dir=adapter_dir.parent) as temporary_dir:
        unpack_dir = Path(temporary_dir)
        with zipfile.ZipFile(archive) as bundle:
            for entry in bundle.infolist():
                destination = (unpack_dir / entry.filename).resolve()
                if not destination.is_relative_to(unpack_dir.resolve()):
                    raise ValueError(f"adapter archive contains an unsafe path: {entry.filename}")
            bundle.extractall(unpack_dir)

        candidates = [
            config.parent
            for config in unpack_dir.rglob("adapter_config.json")
            if (config.parent / "adapter_model.safetensors").is_file()
        ]
        if not candidates:
            raise ValueError(
                "adapters.zip must contain an adapter directory with adapter_config.json "
                "and adapter_model.safetensors."
            )
        # A final adapter directory may include checkpoint backups below it. The
        # shallowest matching directory is the final adapter, not a checkpoint.
        shallowest_depth = min(len(candidate.relative_to(unpack_dir).parts) for candidate in candidates)
        shallowest = [
            candidate for candidate in candidates
            if len(candidate.relative_to(unpack_dir).parts) == shallowest_depth
        ]
        if len(shallowest) != 1:
            raise ValueError("adapters.zip contains multiple top-level adapter directories; keep only one.")
        shutil.copytree(shallowest[0], adapter_dir, dirs_exist_ok=True)

    if not has_adapter_files(adapter_dir):
        raise RuntimeError(f"adapter extraction completed but required files are missing from {adapter_dir}")


def ensure_model(model_id: str, model_dir: Path) -> Path:
    has_config = (model_dir / "config.json").is_file()
    has_weights = any(model_dir.glob("*.safetensors"))
    if not (has_config and has_weights):
        model_dir.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {model_id} to {model_dir} ...", flush=True)
        snapshot_download(repo_id=model_id, local_dir=str(model_dir))
    return model_dir


class AdapterService:
    def __init__(self, model_id: str, model_dir: Path, adapter_archive: Path, adapter_dir: Path, service_model_name: str) -> None:
        self.model_id = model_id
        self.model_dir = model_dir
        self.adapter_archive = adapter_archive
        self.adapter_dir = adapter_dir
        self.service_model_name = service_model_name
        self.model: Any | None = None
        self.tokenizer: Any | None = None
        self.lock = threading.Lock()

    def load(self) -> None:
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA GPU is required. Start this service on the AutoDL GPU instance.")

        if not has_adapter_files(self.adapter_dir):
            extract_adapter_archive(self.adapter_archive, self.adapter_dir)
        ensure_model(self.model_id, self.model_dir)

        compute_dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        torch.set_float32_matmul_precision("high")

        self.tokenizer = AutoTokenizer.from_pretrained(self.model_dir, trust_remote_code=True, use_fast=False)
        if self.tokenizer.pad_token_id is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        print("Loading Qwen in 4-bit NF4 and attaching the LoRA adapter ...", flush=True)
        base_model = AutoModelForCausalLM.from_pretrained(
            self.model_dir,
            trust_remote_code=True,
            device_map="auto",
            torch_dtype=compute_dtype,
            attn_implementation="sdpa",
            quantization_config=BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True,
                bnb_4bit_compute_dtype=compute_dtype,
            ),
        )
        base_model.config.pad_token_id = self.tokenizer.pad_token_id
        base_model.config.use_cache = True
        self.model = PeftModel.from_pretrained(base_model, self.adapter_dir)
        self.model.eval()
        print("Service is ready.", flush=True)

    def generate(self, request: ChatCompletionRequest) -> tuple[str, int, int, str]:
        if self.model is None or self.tokenizer is None:
            raise RuntimeError("model is not loaded")
        if request.stream:
            raise HTTPException(status_code=400, detail="stream=true is not supported by this local service")
        if not request.messages:
            raise HTTPException(status_code=400, detail="messages must not be empty")

        messages = [{"role": message.role, "content": message.content} for message in request.messages]
        prompt = self.tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        )
        inputs = self.tokenizer(prompt, return_tensors="pt", add_special_tokens=False)
        input_device = next(self.model.parameters()).device
        inputs = {name: value.to(input_device) for name, value in inputs.items()}
        prompt_tokens = int(inputs["input_ids"].shape[1])
        do_sample = request.temperature > 0.0
        generation_args: dict[str, Any] = {
            **inputs,
            "max_new_tokens": request.max_tokens,
            "do_sample": do_sample,
            "repetition_penalty": request.repetition_penalty,
            "pad_token_id": self.tokenizer.pad_token_id,
            "eos_token_id": self.tokenizer.eos_token_id,
        }
        if do_sample:
            generation_args.update({"temperature": request.temperature, "top_p": request.top_p})

        with self.lock, torch.inference_mode():
            output_ids = self.model.generate(**generation_args)

        completion_ids = output_ids[0, prompt_tokens:]
        completion_tokens = int(completion_ids.shape[0])
        text = self.tokenizer.decode(completion_ids, skip_special_tokens=True).strip()
        finish_reason = "length" if completion_tokens >= request.max_tokens else "stop"
        return text, prompt_tokens, completion_tokens, finish_reason


def build_app(service: AdapterService) -> FastAPI:
    app = FastAPI(title="Vibe Level Qwen3.5-9B Adapter", version="1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"status": "ok" if service.model is not None else "loading", "model": service.service_model_name}

    @app.get("/v1/models")
    def list_models() -> dict[str, Any]:
        return {"object": "list", "data": [{"id": service.service_model_name, "object": "model", "owned_by": "local"}]}

    @app.post("/v1/chat/completions")
    def chat_completions(request: ChatCompletionRequest) -> dict[str, Any]:
        if request.model and request.model != service.service_model_name:
            raise HTTPException(status_code=404, detail=f"only model {service.service_model_name} is available")
        text, prompt_tokens, completion_tokens, finish_reason = service.generate(request)
        return {
            "id": f"chatcmpl-{uuid.uuid4().hex}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": service.service_model_name,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": finish_reason,
            }],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
        }

    return app


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=6006)
    parser.add_argument("--model-id", default=DEFAULT_MODEL_ID)
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--adapter-archive", type=Path, default=DEFAULT_ADAPTER_ARCHIVE)
    parser.add_argument("--adapter-dir", type=Path, default=DEFAULT_ADAPTER_DIR)
    parser.add_argument("--service-model-name", default=DEFAULT_SERVICE_MODEL_NAME)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    service = AdapterService(args.model_id, args.model_dir, args.adapter_archive, args.adapter_dir, args.service_model_name)
    service.load()
    uvicorn.run(build_app(service), host=args.host, port=args.port, workers=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
