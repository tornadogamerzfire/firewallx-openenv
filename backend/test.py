from env.main import FirewallEnv, Action

env = FirewallEnv(task_type="medium")

obs = env.reset()
done = False

while not done:
    print("Obs:", obs)

    if obs.anomaly_score > 0.5:
        action = Action(decision="block")
    else:
        action = Action(decision="allow")

    result = env.step(action)

    obs = result["observation"]
    print("Reward:", result["reward"])

    done = result["done"]