# LastWord — Lambda: Dead Man's Switch Scanner

This directory contains the AWS Lambda function that runs on a schedule
(via EventBridge) to check user deadlines and trigger state transitions.

## Purpose

The `handler.py` function:

1. Queries all users whose `next_deadline` has passed.
2. Transitions their status through the state machine:
   - **ACTIVE → WARNED** — Sends a warning email via SNS.
   - **WARNED → GRACE** — Sends a final grace-period notice.
   - **GRACE → RELEASED** — Releases authorized vault items to recipients.
3. Logs every transition to the `audit_logs` table.

## Deployment

This function is deployed as a standalone Lambda (not part of the Docker
Compose stack). It connects directly to the RDS instance in the private
subnet via a VPC-attached Lambda configuration.

## Implementation

> **Not yet implemented.** This will be built in Phase 4 of the project.

