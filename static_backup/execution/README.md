# Execution Scripts

The `execution/` directory contains deterministic Python scripts that perform the actual work. These scripts should be focused, well-documented, and reliable.

## Script Guidelines

1. **Deterministic**: Given the same inputs, the script should produce the same outputs (excluding network-dependent tasks).
2. **Environment Variables**: Use `.env` for all secrets and configuration.
3. **Logging**: Provide clear logging so the Orchestrator can understand what happened.
4. **Error Handling**: Raise meaningful exceptions that the Orchestrator can parse and act upon.
5. **Output**: Prefer writing results to `.tmp/` or cloud services rather than the local file system root.

## Dependencies

Manage dependencies via a `requirements.txt` file in this directory if necessary, or rely on a global environment setup.
