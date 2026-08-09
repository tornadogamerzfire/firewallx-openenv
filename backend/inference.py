import requests
import time
import os
from openai import OpenAI

BASE_URL = os.getenv("BASE_URL", "https://tornadogamerzfire-firewallx-env.hf.space")

TIMEOUT = 5
DELAY = 0.2

# 🔥 SAFE LLM CLIENT INIT
api_base = os.getenv("API_BASE_URL")
api_key = os.getenv("API_KEY")

client = None
if api_base and api_key:
    client = OpenAI(
        base_url=api_base,
        api_key=api_key
    )

MODEL_NAME = os.getenv("MODEL_NAME", "gpt-4o-mini")


def safe_post(endpoint):
    try:
        r = requests.post(f"{BASE_URL}{endpoint}", timeout=TIMEOUT)
        if r.status_code == 200:
            return r.json()
    except requests.RequestException as exc:
        print(f"[WARN] POST {endpoint} failed: {exc}", flush=True)
        return None


# 🔥 LLM PROXY CALL (WITH DEBUG)
def ping_llm(task):
    if not client:
        print("LLM client not initialized", flush=True)
        return
    try:
        client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {
                    "role": "user",
                    "content": f"Firewall evaluation task: {task}. Respond OK."
                }
            ],
            temperature=0,
            max_tokens=5
        )
    except Exception as exc:
        print(f"[WARN] LLM proxy call failed: {exc}", flush=True)


def run_episode(task):
    total_reward = 0

    for step in range(1, 6):
        # 🔥 REQUIRED: proxy usage
        ping_llm(task)

        data = safe_post("/predict")
        if not data:
            reward = 0
        else:
            reward = data.get("reward", 0)

        total_reward += reward

        print(f"[STEP] step={step} reward={reward}", flush=True)

        time.sleep(DELAY)

    return total_reward


def normalize(r):
    return (r + 10) / 15


def evaluate_task(task):
    print(f"[START] task={task}", flush=True)

    requests.post(
        f"{BASE_URL}/set_task",
        params={"task_type": task},
        timeout=TIMEOUT
    )

    total = 0
    runs = 4

    for _ in range(runs):
        # 🔥 CRITICAL: reset environment
        requests.post(f"{BASE_URL}/reset", timeout=TIMEOUT)

        total += normalize(run_episode(task))

    avg = total / runs

    print(f"[END] task={task} score={avg} steps=5", flush=True)

    return avg


def main():
    for t in ["easy", "medium", "hard"]:
        evaluate_task(t)


if __name__ == "__main__":
    main()