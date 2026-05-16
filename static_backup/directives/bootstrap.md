# Bootstrap Directive

## Goal
Establish the working environment and verify that all layers of the 3-layer architecture are functional.

## Inputs
- `AGENTS.md`: The system definition.
- `.env`: (Required) Environment variables.

## Tools/Scripts
- `execution/check_env.py`: (To be created) A script to verify environment variables and connectivity.

## Steps
1. **Environment Setup**: Ensure `.env` is created from `.env.example`.
2. **Connectivity Check**: Run `execution/check_env.py` to verify access to required APIs (Google Sheets, etc.).
3. **Task Identification**: Review the backlog or user request to identify the next priority directive to create.

## Outputs
- Success report in `.tmp/bootstrap_report.txt`.

## Edge Cases
- If `.env` is missing, prompt the user to create it.
- If API checks fail, identify which specific service is unreachable.
