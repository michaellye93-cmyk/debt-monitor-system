# Gemini Tooling Reference

This document catalogs the specific tools and MCPs that constitute Gemini's "Superpowers" in this environment.

## 🛠️ Core Tools

### `generate_image`
- **Purpose**: Text-to-image generation for premium UI assets.
- **Best Practice**: Use descriptive prompts focusing on lighting, texture (glass, frost, metal), and modern UI trends.

### `browser_subagent`
- **Purpose**: Autonomous web navigation and visual feedback.
- **Best Practice**: Use for competitor research, accessibility audits, and verifying UI rendering.

## 🧵 StitchMCP Tools

### `generate_screen_from_text`
- **Purpose**: Creating entire React/HTML components from high-level descriptions.

### `edit_screens`
- **Purpose**: Targeted modifications to existing screens. Use for polishing the "WOW" factor.

### `create_design_system`
- **Purpose**: Establishing the global tokens (colors, fonts, roundness) that ensure a "Premium" feel.

## 🐍 Execution Layer Scripts

### `execution/`
- Standard Python scripts for deterministic tasks (data processing, scraping, API calls).
- Use `run_command` to execute.

## 📡 Multimodal Inputs
- Gemini natively supports Image and Video inputs.
- When referencing a file (e.g., `@[screenshot.png]`), use its visual context to inform design decisions.
