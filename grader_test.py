from env.grader import run_episode

for task in ["easy", "medium", "hard"]:
    score = run_episode(task)
    print(f"{task.upper()} SCORE: {score:.2f}")