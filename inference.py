import requests

BASE_URL = "http://127.0.0.1:8000"


def run_episode():
    total_reward = 0

    # reset environment
    res = requests.post(f"{BASE_URL}/reset")
    obs = res.json()["observation"]

    for _ in range(5):
        # simple logic (baseline AI)
        if obs["traffic_type"] == "attack":
            decision = "block"
        else:
            decision = "allow"

        res = requests.post(f"{BASE_URL}/step", json={
            "decision": decision
        })

        data = res.json()

        obs = data["observation"]
        reward = data["reward"]
        total_reward += reward

    return total_reward


if __name__ == "__main__":
    score = run_episode()
    print("Final Score:", score)