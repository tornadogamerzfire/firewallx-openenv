from env.main import FirewallEnv, Action

def smart_agent(obs):
    # better decision logic
    if obs.anomaly_score > 0.7:
        return Action(decision="block")
    elif obs.anomaly_score > 0.4:
        return Action(decision="sandbox")
    else:
        return Action(decision="allow")


def run_episode(task_type, runs=5):
    total_scores = []

    for _ in range(runs):
        env = FirewallEnv(task_type=task_type)
        obs = env.reset()

        total_reward = 0
        max_reward = env.max_steps

        done = False

        while not done:
            action = smart_agent(obs)
            obs, reward, done, _ = env.step(action)
            total_reward += reward

        normalized_score = (total_reward + max_reward) / (2 * max_reward)
        total_scores.append(normalized_score)

    # average score across runs
    return sum(total_scores) / len(total_scores)