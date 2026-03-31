# FirewallX Environment

## Overview
FirewallX is a real-world AI training environment simulating an adaptive firewall system.

Agents must analyze incoming traffic and decide:
- allow
- block
- sandbox

## Observation Space
- traffic_type (normal / attack)
- anomaly_score (0–1)
- step_count
- task_type (easy / medium / hard)

## Action Space
- decision: allow | block | sandbox

## Tasks
- Easy: clear attacks
- Medium: mixed signals
- Hard: subtle anomalies

## Reward
+1 → correct decision  
-1 → incorrect decision  

## Setup

```bash
pip install -r requirements.txt
uvicorn env.main:app --reload