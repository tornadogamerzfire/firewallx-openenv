from pydantic import BaseModel
from fastapi import FastAPI
import random

class Observation(BaseModel):
    traffic_type: str
    anomaly_score: float
    step_count: int
    task_type: str

class Action(BaseModel):
    decision: str

class FirewallEnv:
    def __init__(self, task_type="easy"):
        self.task_type = task_type
        self.state_data = None
        self.step_count = 0
        self.max_steps = 5

    def generate_traffic(self):
        if self.task_type == "easy":
            if random.random() > 0.5:
                return "attack", random.uniform(0.7, 1.0)
            else:
                return "normal", random.uniform(0.0, 0.3)

        elif self.task_type == "medium":
            if random.random() > 0.5:
                return "attack", random.uniform(0.4, 1.0)
            else:
                return "normal", random.uniform(0.0, 0.6)

        else:
            if random.random() > 0.5:
                return "attack", random.uniform(0.2, 0.6)
            else:
                return "normal", random.uniform(0.0, 0.8)

    def reset(self):
        self.step_count = 0
        traffic, score = self.generate_traffic()

        self.state_data = Observation(
            traffic_type=traffic,
            anomaly_score=score,
            step_count=self.step_count,
            task_type=self.task_type
        )

        return self.state_data

    def step(self, action: Action):
        self.step_count += 1

        if self.state_data.traffic_type == "attack":
            if action.decision == "block":
                reward = 1.0
            elif action.decision == "sandbox":
                reward = 0.5
            else:
                reward = -1.0
        else:
            if action.decision == "allow":
                reward = 1.0
            elif action.decision == "sandbox":
                reward = 0.2
            else:
                reward = -1.0

        done = self.step_count >= self.max_steps

        traffic, score = self.generate_traffic()

        self.state_data = Observation(
            traffic_type=traffic,
            anomaly_score=score,
            step_count=self.step_count,
            task_type=self.task_type
        )

        return {
            "observation": self.state_data,
            "reward": reward,
            "done": done,
            "info": {}
        }

    def state(self):
        return self.state_data

        from fastapi import FastAPI
from typing import Dict

app = FastAPI()

env_instance = FirewallEnv(task_type="medium")


@app.post("/reset")
def reset():
    obs = env_instance.reset()
    return {"observation": obs}


@app.post("/step")
def step(action: Dict):
    action_obj = Action(**action)
    result = env_instance.step(action_obj)

    return {
        "observation": result["observation"],
        "reward": result["reward"],
        "done": result["done"],
        "info": result["info"]
    }


@app.get("/state")
def state():
    return {"state": env_instance.state()}