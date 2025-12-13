# Spec 0054: Generate Image Tool

## Summary

Add a `generate-image` CLI tool to codev for AI-powered image generation using Google's Nano Banana models (Gemini native image generation).

## Background

We have an existing Python implementation at `../../writing/tools/generate_image.py` that works well. Port to TypeScript for consistency with the codev package.

## Requirements

1. **CLI Interface** - TypeScript CLI (Commander.js) with:
   - Prompt argument (text or .txt file path)
   - Output path option (-o/--output)
   - Resolution option (-r/--resolution): 1K, 2K, 4K
   - Aspect ratio option (-a/--aspect): 1:1, 16:9, 9:16, 3:2, 2:3, etc.
   - Model option (-m/--model): gemini-3-pro-image-preview (default), gemini-2.5-flash-image
   - Reference image option (--ref): for image-to-image generation

2. **API Integration** - Use `@google/genai` npm package with GEMINI_API_KEY from environment

3. **Package Integration** - Add as `generate-image` command to @cluesmith/codev package

## Source Reference

Port from: `../../writing/tools/generate_image.py` (6.5KB Python, working implementation)

## Acceptance Criteria

- [ ] `generate-image "prompt" -o out.png` generates an image
- [ ] Resolution and aspect ratio options work
- [ ] Reference image support works
- [ ] Helpful error messages for missing API key
