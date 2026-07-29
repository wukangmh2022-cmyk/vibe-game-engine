#!/usr/bin/env python3
"""测试 vLLM 服务的并发能力 + 显存监控 + TPS"""

import asyncio
import aiohttp
import time
import json
import subprocess
import re
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

# 配置
API_URL = "http://127.0.0.1:6006/v1/chat/completions"
MODEL_NAME = "vibe-level-qwen35-9b"
TEST_PROMPTS = [
    "介绍一下人工智能的发展历程，包括深度学习和大语言模型",
    "深度学习和机器学习有什么区别，各自的应用场景是什么",
    "什么是大语言模型，它的工作原理是什么",
    "写一段关于春天的散文诗，描绘大自然的美丽",
    "解释一下量子计算的基本原理，以及它和经典计算的区别",
]

def get_gpu_info():
    """获取 GPU 显存和利用率"""
    try:
        result = subprocess.run(
            ['nvidia-smi', '--query-gpu=memory.used,memory.total,utilization.gpu,temperature.gpu',
             '--format=csv,noheader,nounits'],
            capture_output=True, text=True, timeout=5
        )
        used, total, util, temp = result.stdout.strip().split(', ')
        return {
            'used': int(used),
            'total': int(total),
            'util': int(util),
            'temp': int(temp)
        }
    except:
        return None

async def send_request(session, prompt, request_id):
    """发送单个请求并记录耗时和 token 数"""
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "max_tokens": 512,
        "temperature": 0.7
    }

    start = time.time()
    try:
        async with session.post(API_URL, json=payload, timeout=aiohttp.ClientTimeout(total=180)) as resp:
            data = await resp.json()
            elapsed = time.time() - start

            if "error" in data:
                return {
                    "id": request_id,
                    "success": False,
                    "error": data["error"].get("message", "Unknown error"),
                    "elapsed": elapsed
                }

            usage = data.get("usage", {})
            content = data["choices"][0]["message"]["content"]
            return {
                "id": request_id,
                "success": True,
                "elapsed": elapsed,
                "prompt_tokens": usage.get("prompt_tokens", 0),
                "completion_tokens": usage.get("completion_tokens", 0),
                "total_tokens": usage.get("total_tokens", 0),
                "content_length": len(content)
            }
    except asyncio.TimeoutError:
        return {"id": request_id, "success": False, "error": "Timeout", "elapsed": 180}
    except Exception as e:
        return {"id": request_id, "success": False, "error": str(e), "elapsed": time.time() - start}

async def test_concurrency(concurrency, prompts, duration=30):
    """测试指定并发数，持续 duration 秒"""
    print(f"\n{'='*70}")
    print(f"🧪 测试并发数: {concurrency} (持续 {duration}s)")
    print(f"{'='*70}")

    # 记录初始显存
    gpu_start = get_gpu_info()
    if gpu_start:
        print(f"📊 初始显存: {gpu_start['used']:.0f}MB / {gpu_start['total']:.0f}MB (利用率: {gpu_start['util']}%)")

    # 准备请求队列
    request_prompts = []
    for i in range(concurrency * 5):  # 准备足够的请求
        request_prompts.append(prompts[i % len(prompts)])

    # 显存采样
    gpu_samples = []
    start_time = time.time()

    async with aiohttp.ClientSession() as session:
        # 启动并发请求
        tasks = [send_request(session, request_prompts[i % len(request_prompts)], i)
                 for i in range(concurrency)]

        # 持续发送请求直到时间到
        all_results = []
        while time.time() - start_time < duration:
            # 采样显存
            gpu_info = get_gpu_info()
            if gpu_info:
                gpu_samples.append(gpu_info)

            # 发送一批请求
            batch_start = time.time()
            results = await asyncio.gather(*tasks)
            all_results.extend(results)

            # 如果这批请求全部完成，启动下一批
            elapsed = time.time() - batch_start
            if elapsed < 2:  # 避免请求太密集
                await asyncio.sleep(0.5)

            # 重新创建任务
            tasks = [send_request(session, request_prompts[i % len(request_prompts)], len(all_results) + i)
                     for i in range(concurrency)]

    total_time = time.time() - start_time

    # 统计结果
    success = [r for r in all_results if r.get("success", False)]
    failed = [r for r in all_results if not r.get("success", False)]

    # 计算 TPS (Token Per Second)
    total_completion_tokens = sum(r.get("completion_tokens", 0) for r in success)
    total_prompt_tokens = sum(r.get("prompt_tokens", 0) for r in success)
    tps = total_completion_tokens / total_time if total_time > 0 else 0

    # 显存统计
    if gpu_samples:
        avg_used = sum(s['used'] for s in gpu_samples) / len(gpu_samples)
        max_used = max(s['used'] for s in gpu_samples)
        avg_util = sum(s['util'] for s in gpu_samples) / len(gpu_samples)
        avg_temp = sum(s['temp'] for s in gpu_samples) / len(gpu_samples)

    # 输出结果
    print(f"\n📊 请求统计:")
    print(f"   总请求数: {len(all_results)}")
    print(f"   成功: {len(success)}")
    print(f"   失败: {len(failed)}")
    print(f"   测试时长: {total_time:.1f}s")

    if success:
        elapsed_times = [r["elapsed"] for r in success]
        print(f"\n⏱️  延迟统计:")
        print(f"   最小: {min(elapsed_times):.2f}s")
        print(f"   平均: {sum(elapsed_times)/len(elapsed_times):.2f}s")
        print(f"   最大: {max(elapsed_times):.2f}s")
        print(f"   P95: {sorted(elapsed_times)[int(len(elapsed_times)*0.95)]:.2f}s")

        print(f"\n📝 Token 统计:")
        print(f"   Prompt Tokens 总计: {total_prompt_tokens}")
        print(f"   Completion Tokens 总计: {total_completion_tokens}")
        print(f"   平均生成 tokens/请求: {total_completion_tokens/len(success):.0f}")
        print(f"   🔥 生成速度 (TPS): {tps:.1f} tokens/s")
        print(f"   📈 吞吐量: {len(success)/total_time:.2f} req/s")

    if gpu_samples:
        print(f"\n🎮 显存统计 (采样 {len(gpu_samples)} 次):")
        print(f"   平均使用: {avg_used:.0f}MB / {gpu_start['total']:.0f}MB ({avg_used/gpu_start['total']*100:.1f}%)")
        print(f"   峰值使用: {max_used:.0f}MB ({max_used/gpu_start['total']*100:.1f}%)")
        print(f"   平均 GPU 利用率: {avg_util:.1f}%")
        print(f"   平均温度: {avg_temp:.1f}°C")

    if failed:
        print(f"\n❌ 失败详情 (前5个):")
        for r in failed[:5]:
            print(f"   #{r.get('id', '?')}: {r.get('error', 'Unknown')}")
        if len(failed) > 5:
            print(f"   ... 还有 {len(failed)-5} 个失败")

    return {
        'concurrency': concurrency,
        'total_requests': len(all_results),
        'success': len(success),
        'failed': len(failed),
        'total_time': total_time,
        'tps': tps,
        'throughput': len(success)/total_time,
        'avg_latency': sum(r["elapsed"] for r in success)/len(success) if success else 0,
        'max_latency': max((r["elapsed"] for r in success), default=0),
        'avg_memory': avg_used if gpu_samples else 0,
        'max_memory': max_used if gpu_samples else 0,
        'avg_gpu_util': avg_util if gpu_samples else 0
    }

async def main():
    """逐步增加并发测试"""
    print("🚀 vLLM 并发 + 显存监控测试工具")
    print(f"📡 API: {API_URL}")
    print(f"📦 模型: {MODEL_NAME}")

    # 先测试服务是否活着
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("http://127.0.0.1:6006/health", timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status != 200:
                    print("❌ 服务未就绪，请先启动服务")
                    return
                print("✅ 服务已就绪")
    except Exception as e:
        print(f"❌ 无法连接到服务: {e}")
        return

    # 测试不同的并发数
    results = []
    # 根据显存情况调整测试档位
    test_levels = [1, 2, 3, 4, 6, 8, 10, 12, 16]

    for concurrency in test_levels:
        result = await test_concurrency(concurrency, TEST_PROMPTS, duration=15)
        results.append(result)

        # 如果失败率超过 30%，停止测试
        if result['failed'] > result['total_requests'] * 0.3:
            print(f"\n⚠️ 失败率过高 ({result['failed']}/{result['total_requests']})，停止测试")
            break

        # 如果显存使用超过 95%，停止测试
        if result['max_memory'] > 0 and result['max_memory'] / result.get('total_memory', 12288) > 0.95:
            print(f"\n⚠️ 显存峰值超过 95%，停止测试")
            break

        # 等待释放
        await asyncio.sleep(5)

    # 总结报告
    print(f"\n{'='*70}")
    print("📋 测试总结报告")
    print(f"{'='*70}")
    print(f"{'并发数':<8} {'请求数':<8} {'成功率':<10} {'TPS':<10} {'吞吐(req/s)':<15} {'延迟(avg)':<12} {'显存峰值':<12}")
    print("-" * 70)
    for r in results:
        success_rate = f"{r['success']/r['total_requests']*100:.1f}%" if r['total_requests'] > 0 else "0%"
        print(f"{r['concurrency']:<8} {r['total_requests']:<8} {success_rate:<10} {r['tps']:<10.1f} {r['throughput']:<15.2f} {r['avg_latency']:<12.2f} {r['max_memory']:<12.0f}MB")

    # 推荐并发数
    best = max(results, key=lambda x: x['throughput'] if x['failed'] < x['total_requests'] * 0.1 else 0)
    print(f"\n💡 推荐并发数: {best['concurrency']} (吞吐量 {best['throughput']:.2f} req/s, TPS {best['tps']:.1f})")

if __name__ == "__main__":
    asyncio.run(main())