# Spec 0054: Generate Image Tool

## Summary

Add a `generate-image` CLI tool to codev for AI-powered image generation using Google's Gemini/Imagen models.

## Background

We have an existing implementation at `../../writing/tools/generate_image.py` that works well. Import and adapt it for the codev package.

## Requirements

1. **CLI Interface** - Typer-based command with:
   - Prompt argument (text or .txt file path)
   - Output path option (-o/--output)
   - Resolution option (-r/--resolution): 1K, 2K, 4K
   - Aspect ratio option (-a/--aspect): 1:1, 16:9, 9:16, 3:2, 2:3, etc.
   - Model option (-m/--model): gemini-3-pro-image-preview, gemini-2.5-flash-image, imagen-4.0-generate-001
   - Reference image option (--ref): for image-to-image generation

2. **API Integration** - Use `google-genai` SDK with GEMINI_API_KEY from environment

3. **Package Integration** - Add as `generate-image` command to @cluesmith/codev package

## Source Reference

Import from: `../../writing/tools/generate_image.py` (6.5KB, working implementation)

## Acceptance Criteria

- [ ] `codev generate-image "prompt" -o out.png` generates an image
- [ ] Resolution and aspect ratio options work
- [ ] Reference image support works
- [ ] Helpful error messages for missing API key
