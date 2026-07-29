#!/usr/bin/env python3
"""Single-GPU QLoRA SFT for a causal language model such as Qwen 27B."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig,
    DataCollatorForSeq2Seq, Trainer, TrainingArguments,
)

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from training.qlora.data_contract import validate_dsl_dataset


def chat_text(tokenizer, messages, add_generation_prompt: bool) -> str:
    if getattr(tokenizer, "chat_template", None):
        return tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=add_generation_prompt,
            enable_thinking=False,
        )
    parts = []
    for message in messages:
        parts.append(f"<{message['role']}>\n{message['content']}")
    if add_generation_prompt:
        parts.append("<assistant>\n")
    return "\n".join(parts)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-name-or-path", required=True)
    parser.add_argument("--data-dir", default="training/qlora/data/command-sft-v1")
    parser.add_argument("--output-dir", default="training/qlora/outputs/vibe-command-qlora")
    parser.add_argument("--max-length", type=int, default=3072)
    parser.add_argument("--epochs", type=float, default=3)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--gradient-accumulation", type=int, default=16)
    parser.add_argument("--lora-r", type=int, default=32)
    parser.add_argument("--lora-alpha", type=int, default=64)
    parser.add_argument("--lora-dropout", type=float, default=0.05)
    parser.add_argument("--warmup-ratio", type=float, default=0.03)
    parser.add_argument("--logging-steps", type=int, default=5)
    parser.add_argument("--eval-steps", type=int, default=25)
    parser.add_argument("--save-steps", type=int, default=25)
    parser.add_argument("--save-total-limit", type=int, default=2)
    parser.add_argument("--dataloader-num-workers", type=int, default=2)
    parser.add_argument("--resume-from-checkpoint", default=None)
    args = parser.parse_args()
    try:
        validate_dsl_dataset(args.data_dir)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Dataset preflight failed: {error}") from error
    if not torch.cuda.is_available():
        raise SystemExit("CUDA is required for QLoRA training")

    compute_dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    # RTX 4090-class GPUs can use TF32 for remaining FP32 operations safely.
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
    torch.set_float32_matmul_precision("high")

    tokenizer = AutoTokenizer.from_pretrained(args.model_name_or_path, trust_remote_code=True, use_fast=False)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(
        args.model_name_or_path,
        trust_remote_code=True,
        device_map="auto",
        torch_dtype=compute_dtype,
        attn_implementation="sdpa",
        quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=compute_dtype),
    )
    model.config.use_cache = False
    model.config.pad_token_id = tokenizer.pad_token_id
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    target_modules = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]
    from peft import get_peft_model
    model = get_peft_model(model, LoraConfig(r=args.lora_r, lora_alpha=args.lora_alpha, lora_dropout=args.lora_dropout, bias="none", task_type="CAUSAL_LM", target_modules=target_modules))
    model.print_trainable_parameters()

    dataset = load_dataset("json", data_files={"train": str(Path(args.data_dir) / "train.jsonl"), "validation": str(Path(args.data_dir) / "validation.jsonl")})

    def tokenize(row):
        messages = row["messages"]
        prompt = chat_text(tokenizer, messages[:-1], add_generation_prompt=True)
        full = prompt + messages[-1]["content"] + (tokenizer.eos_token or "")
        # The chat template already includes its control tokens. Adding special
        # tokens again can misalign labels and wastes the limited context budget.
        encoded = tokenizer(full, truncation=False, add_special_tokens=False)
        prompt_ids = tokenizer(prompt, truncation=False, add_special_tokens=False)["input_ids"]
        if len(encoded["input_ids"]) > args.max_length:
            raise ValueError(
                f"sample {row.get('id', '<unknown>')} has {len(encoded['input_ids'])} tokens, "
                f"exceeding --max-length {args.max_length}; silent truncation is forbidden"
            )
        labels = encoded["input_ids"].copy()
        labels[:len(prompt_ids)] = [-100] * min(len(prompt_ids), len(labels))
        if not any(label != -100 for label in labels):
            raise ValueError(f"sample {row.get('id', '<unknown>')} has no supervised assistant tokens")
        encoded["labels"] = labels
        return encoded

    tokenized = dataset.map(tokenize, remove_columns=dataset["train"].column_names, desc="Tokenizing")
    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=args.gradient_accumulation,
        gradient_checkpointing=True,
        bf16=compute_dtype is torch.bfloat16,
        fp16=compute_dtype is torch.float16,
        warmup_ratio=args.warmup_ratio,
        logging_steps=args.logging_steps,
        eval_strategy="steps",
        eval_steps=args.eval_steps,
        save_strategy="steps",
        save_steps=args.save_steps,
        save_total_limit=args.save_total_limit,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        dataloader_num_workers=args.dataloader_num_workers,
        dataloader_persistent_workers=args.dataloader_num_workers > 0,
        report_to="none",
        optim="paged_adamw_32bit",
        seed=42,
    )
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["validation"],
        # Padding to a multiple of 8 keeps Tensor Core kernels efficient.
        data_collator=DataCollatorForSeq2Seq(tokenizer, padding=True, pad_to_multiple_of=8, label_pad_token_id=-100),
    )
    trainer.train(resume_from_checkpoint=args.resume_from_checkpoint)
    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
