# Plan 0054: Generate Image Tool

## Implementation Steps

### Phase 1: Create Python Tool

1. **Copy source file**
   - Copy `../../writing/tools/generate_image.py` to `packages/codev/src/tools/generate_image.py`
   - Adjust imports if needed

2. **Update pyproject.toml**
   - Add dependencies: `google-genai`, `pillow`, `python-dotenv`
   - Add script entry point: `generate-image = "tools.generate_image:app"`

### Phase 2: Integration

3. **Wire up the command**
   - Ensure the tool is accessible via `codev generate-image` or standalone `generate-image`
   - Test with actual API key

4. **Documentation**
   - Add usage to CLI reference docs

## Files to Modify

- `packages/codev/src/tools/generate_image.py` (NEW - copy from source)
- `packages/codev/pyproject.toml` (add deps and entry point)
- `codev/docs/commands/overview.md` (add to tool list)

## Testing

- Manual test with GEMINI_API_KEY
- Test each model option
- Test reference image feature
