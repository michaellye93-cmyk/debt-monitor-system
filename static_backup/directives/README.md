# Directives

Directives are Standard Operating Procedures (SOPs) written in Markdown. They define the "What" and "How" of a task for the Orchestrator (AI).

## Structure of a Directive

1. **Goal**: Clearly state what the directive is supposed to achieve.
2. **Inputs**: List all required inputs (file paths, variables, etc.).
3. **Tools/Scripts**: Reference specific scripts in `execution/` that should be used.
4. **Step-by-Step Instructions**: A logical sequence of actions for the Orchestrator to follow.
5. **Outputs**: Define what the successful outcome looks like (e.g., a file in `.tmp/`, a Google Sheet update).
6. **Edge Cases & Error Handling**: Specific instructions for when things go wrong.

## Maintenance

Directives are living documents. When the Orchestrator learns something new (e.g., an API limit or a more efficient path), it should update the corresponding directive to capture that knowledge.
