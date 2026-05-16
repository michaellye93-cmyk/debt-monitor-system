---
name: using-superpowers
description: Leverage Gemini's "superpowers" to build premium, multi-modal, and WOW-inducing applications. This includes using native video/image reasoning, rich UI generation via StitchMCP, and ensuring a premium aesthetic that exceeds standard MVPs. Use this skill when the user asks for "premium", "WOW", "stunning", or "complex" web features.
---

# Using Superpowers

This skill defines the process for leveraging Gemini's most advanced capabilities to deliver high-end, agentic results.

## The Superpowers

### 1. Multi-modal Mastery
Gemini can see, hear, and understand video. Don't just work with text.
- **Visual Audits**: Use the `browser_subagent` to take screenshots and audit UI/UX.
- **Image Generation**: Use `generate_image` to create custom, premium assets instead of using placeholders.
- **Video Reasoning**: If a video is provided, analyze it frame-by-frame for structural insights (e.g., script extraction).

### 2. Premium UI/UX (StitchMCP)
Use `StitchMCP` to bridge the gap between prompt and production-grade UI.
- **Generate Screen**: Use `generate_screen_from_text` to bootstrap beautiful components.
- **Iterative Edit**: Use `edit_screens` to polish and refine the design based on visual feedback.
- **Design Systems**: Apply consistent tokens using `apply_design_system`.

### 3. Agentic Orchestration (3-Layer)
Always align with the `AGENTS.md` structure:
- **Directives**: Clear SOPs for complex multi-modal tasks.
- **Execution**: Python scripts that handle heavy data lifting or API integrations.

## Aesthetic Guidelines
1. **Glassmorphism & Vibrancy**: Use smooth gradients, blurs, and vibrant (but harmonious) colors.
2. **Micro-animations**: Add CSS transitions for every hover and state change.
3. **Modern Typography**: Use Google Fonts (Inter, Outfit, etc.).
4. **No Placeholders**: Every image should be a purpose-built asset.

## Workflow
1. **Vision**: Identify the "WOW" factor.
2. **Blueprint**: Map out the multi-modal assets needed.
3. **Execution**: Call `generate_image`, `StitchMCP`, and `browser_subagent` to build the components.
4. **Polish**: Final pass for responsiveness and accessibility.
