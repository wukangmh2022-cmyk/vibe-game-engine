#!/usr/bin/env python3
"""Single-GPU QLoRA SFT for a causal language model such as Qwen 27B."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig,
    DataCollatorForSeq2Seq, Trainer, TrainingArguments,
)


def chat_text(tokenizer, messages, add_generation_prompt: bool) -> str:
    if getattr(tokenizer, "chat_template", None):
        return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=add_generation_prompt)
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
    parser.add_argument("--resume-from-checkpoint", default=None)
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise SystemExit("CUDA is required for QLoRA training")

    compute_dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    tokenizer = AutoTokenizer.from_pretrained(args.model_name_or_path, trust_remote_code=True, use_fast=False)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(
        args.model_name_or_path,
        trust_remote_code=True,
        device_map="auto",
        torch_dtype=compute_dtype,
        quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=compute_dtype),
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    target_modules = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]
    from peft import get_peft_model
    model = get_peft_model(model, LoraConfig(r=args.lora_r, lora_alpha=args.lora_alpha, lora_dropout=0.05, bias="none", task_type="CAUSAL_LM", target_modules=target_modules))
    model.print_trainable_parameters()

    dataset = load_dataset("json", data_files={"train": str(Path(args.data_dir) / "train.jsonl"), "validation": str(Path(args.data_dir) / "validation.jsonl")})

    def tokenize(row):
        messages = row["messages"]
        prompt = chat_text(tokenizer, messages[:-1], add_generation_prompt=True)
        full = prompt + messages[-1]["content"] + (tokenizer.eos_token or "")
        encoded = tokenizer(full, truncation=True, max_length=args.max_length)
        prompt_ids = tokenizer(prompt, truncation=True, max_length=args.max_length, add_special_tokens=False)["input_ids"]
        labels = encoded["input_ids"].copy()
        labels[:len(prompt_ids)] = [-100] * min(len(prompt_ids), len(labels))
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
        logging_steps=5,
        eval_strategy="steps",
        eval_steps=25,
        save_strategy="steps",
        save_steps=25,
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        report_to="none",
        optim="paged_adamw_32bit",
        seed=42,
    )
    trainer = Trainer(model=model, args=training_args, train_dataset=tokenized["train"], eval_dataset=tokenized["validation"], data_collator=DataCollatorForSeq2Seq(tokenizer, padding=True, label_pad_token_id=-100))
    trainer.train(resume_from_checkpoint=args.resume_from_checkpoint)
    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
