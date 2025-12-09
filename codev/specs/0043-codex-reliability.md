# Specification: Codex CLI Reliability and Performance Optimization

## Metadata
- **ID**: 0043-codex-reliability
- **Status**: spec-draft
- **Created**: 2025-12-08

## Clarifying Questions Asked

**Q: What specific performance issues are we experiencing with Codex CLI?**
A: From projectlist.md - "Codex takes 200-250s vs Gemini's 120-150s for consultations. Codex runs sequential shell commands which is slower."

**Q: What is our current Codex usage pattern?**
A: We use `codex exec --full-auto` as shown in the consult tool (line 152 of codev/bin/consult). We also set CODEX_SYSTEM_MESSAGE environment variable (line 153).

**Q: Are we optimizing for speed, thoroughness, or both?**
A: Need to balance both - consultations should be fast enough for practical use (~120s target like Gemini) while maintaining thorough code review quality.

## Problem Statement

The Codex CLI is currently used in Codev's consultation workflow but exhibits reliability and performance issues:

1. **Slow response times**: 200-250 seconds for consultations, ~40-100% slower than Gemini (120-150s)
2. **Sequential execution**: Codex runs shell commands sequentially with reasoning between each step, increasing latency
3. **Uncertainty about options**: The `CODEX_SYSTEM_MESSAGE` environment variable we use is undocumented in official OpenAI documentation
4. **Limited configuration knowledge**: We don't know what CLI flags and config.toml settings could improve performance
5. **Model selection unclear**: We use default model but don't know if faster alternatives exist

This affects the effectiveness of our 3-way consultation workflow (Gemini, Codex, Claude) where Codex is the slowest contributor.

## Current State

**Current Implementation** (from `/Users/mwk/Development/cluesmith/codev/codev/bin/consult`):

```python
elif resolved == "codex":
    if not shutil.which("codex"):
        return "Error: codex not found", 1, 0.0
    cmd = ["codex", "exec", "--full-auto", query]
    env = {"CODEX_SYSTEM_MESSAGE": role}
```

**Observed Behavior**:
- Takes 200-250 seconds for PR reviews
- Runs 10-15 sequential shell commands (`git show`, `rg -n`, etc.)
- More thorough than Gemini's text-only analysis but significantly slower
- CODEX_SYSTEM_MESSAGE environment variable usage is undocumented

**Performance Baseline**:
| Model | Typical Time | Approach |
|-------|--------------|----------|
| Gemini | ~120-150s | Pure text analysis, no shell commands |
| Codex | ~200-250s | Sequential shell commands with reasoning |
| Claude | ~60-120s | Balanced analysis with targeted tool use |

## Desired State

1. **Faster consultations**: Reduce Codex time to ~120-180s range (closer to Gemini's performance)
2. **Reliable configuration**: Use only documented CLI options and environment variables
3. **Optimal model selection**: Use the fastest appropriate model for consultations
4. **Configurable trade-offs**: Ability to choose between speed and thoroughness via profiles
5. **Consistent behavior**: Predictable response times without sporadic slowdowns

## Stakeholders
- **Primary Users**: Codev developers running consultations via `./codev/bin/consult`
- **Secondary Users**: Any projects using Codev's consultation workflow
- **Technical Team**: Codev maintainers
- **Business Owners**: Project owner (Waleed)

## Success Criteria
- [x] Document all available Codex CLI options relevant to performance
- [x] Identify fastest model option for consultations
- [x] Determine optimal --full-auto alternatives or supplementary flags
- [x] Create recommended configuration for different use cases (fast vs thorough)
- [ ] Reduce average consultation time by 20-40% (target: 120-180s)
- [ ] Eliminate use of undocumented environment variables
- [ ] All tests pass with >90% coverage
- [ ] Documentation updated in consult tool and CLAUDE.md

## Constraints
### Technical Constraints
- Must maintain compatibility with existing `consult` tool architecture
- Must preserve consultation quality (code review thoroughness)
- Limited to options available in current Codex CLI version (v0.65.0+)
- Must work on both macOS and Linux

### Business Constraints
- Cannot increase API costs significantly (prefer efficiency over brute force)
- Must maintain 3-way consultation workflow (Gemini, Codex, Claude)
- Changes should be backward compatible or clearly versioned

## Assumptions
- Codex CLI is already installed (`npm i -g @openai/codex`)
- User has ChatGPT Plus/Pro/Business/Edu/Enterprise OR API key with credits
- The `--full-auto` mode is necessary for autonomous consultation
- Performance issues are client-side configuration, not OpenAI server-side

## Solution Approaches

### Approach 1: Model Optimization (Primary Recommendation)

**Description**: Switch from default model to faster alternatives while maintaining quality.

**Implementation**:
```python
# Current (implicit default: gpt-5-codex)
cmd = ["codex", "exec", "--full-auto", query]

# Proposed: Explicit fast model
cmd = ["codex", "exec", "--model", "gpt-4.1", "--full-auto", query]
# OR for even faster (if acceptable quality)
cmd = ["codex", "exec", "--model", "o4-mini", "--full-auto", query]
```

**Key Findings from Research**:
- **o4-mini**: Fastest performance for common coding tasks (optimized for CLI)
- **gpt-4.1**: Balance of speed and capability
- **gpt-5-codex**: Default, best results but slowest
- **codex-mini-latest**: Optimized for CLI with lower latency

**Pros**:
- Simple one-line change
- Can reduce response time by 30-50% based on model differences
- No architecture changes needed
- Can configure per use case (fast for quick checks, thorough for final review)

**Cons**:
- May reduce analysis quality with faster models
- Need to test each model's quality for our use case
- Model names may change over time

**Estimated Complexity**: Low
**Risk Level**: Low
**Expected Impact**: 30-50% reduction in response time

### Approach 2: Reasoning Effort Tuning

**Description**: Adjust reasoning effort settings to reduce computational overhead.

**Implementation**:
```python
# Add reasoning effort flag
cmd = ["codex", "exec", "--full-auto", "-c", "model_reasoning_effort=low", query]
```

**Key Findings**:
- `model_reasoning_effort` options: "minimal" | "low" | "medium" | "high" | "none"
- Can set via `-c` flag or in `~/.codex/config.toml`
- Higher reasoning = more thorough but slower
- For consultations, "low" or "medium" may suffice

**Pros**:
- Fine-grained control over speed/quality trade-off
- Can combine with model selection
- No code architecture changes

**Cons**:
- Only works with Responses API models
- May reduce analysis depth
- Requires testing to find optimal setting

**Estimated Complexity**: Low
**Risk Level**: Low
**Expected Impact**: 10-20% reduction in response time

### Approach 3: Timeout and Streaming Optimization

**Description**: Configure timeout and streaming settings for faster perceived response.

**Implementation via config.toml**:
```toml
stream_idle_timeout_ms = 120000  # Reduce from default 300000 (5 min)
hide_agent_reasoning = true      # Suppress reasoning overhead
show_raw_agent_reasoning = false # Disable raw reasoning content
```

**Key Findings**:
- `stream_idle_timeout_ms` defaults to 300,000ms (5 min)
- Can reduce for faster failure detection
- Hiding reasoning can reduce processing overhead
- Token delay optimization shows 40% improvement in wall-clock time

**Pros**:
- Reduces overhead from unnecessary output
- Faster timeout prevents hanging sessions
- Can be combined with other approaches

**Cons**:
- Doesn't fundamentally speed up computation
- May hide useful debugging information
- Requires config file management

**Estimated Complexity**: Low
**Risk Level**: Low
**Expected Impact**: 5-15% reduction in response time

### Approach 4: Replace --full-auto with Targeted Tools

**Description**: Instead of `--full-auto`, use sandbox modes that limit exploration.

**Implementation**:
```python
# Current: Full autonomy
cmd = ["codex", "exec", "--full-auto", query]

# Proposed: Limited sandbox
cmd = ["codex", "exec", "--sandbox", "workspace-read", query]
```

**Key Findings**:
- `--full-auto` = workspace-write sandbox + approvals on failure
- Sandbox options: read-only (default), workspace-write, danger-full-access
- Read-only allows file reads but blocks writes and network
- Less autonomy = less tool invocation = faster execution

**Pros**:
- Prevents unnecessary tool exploration
- Forces focus on provided context
- More predictable execution paths

**Cons**:
- May reduce analysis quality significantly
- Codex's strength is exploration - limiting it defeats the purpose
- Would need to pre-fetch more context like Gemini approach

**Estimated Complexity**: Medium
**Risk Level**: High (may degrade quality)
**Expected Impact**: 30-60% reduction (but at quality cost)

### Approach 5: System Message via Instructions.md (Fix Undocumented Variable)

**Description**: Replace undocumented `CODEX_SYSTEM_MESSAGE` with official instructions.md approach.

**Implementation**:
```python
# Current (undocumented)
env = {"CODEX_SYSTEM_MESSAGE": role}

# Proposed: Create temp instructions file
import tempfile
with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False, dir=os.getcwd()) as f:
    f.write(role)
    instructions_file = f.name
os.rename(instructions_file, "codex.md")
try:
    result = subprocess.run(cmd, cwd=temp_dir, ...)
finally:
    os.unlink("codex.md")
```

**Key Findings**:
- Codex officially uses Markdown instruction files, not environment variables
- Layered approach: `~/.codex/instructions.md` (global), `codex.md` (project root), `codex.md` (cwd)
- CODEX_SYSTEM_MESSAGE is not documented in official OpenAI documentation
- Using undocumented features risks breakage in future versions

**Pros**:
- Uses documented, supported approach
- More future-proof
- Follows Codex best practices

**Cons**:
- More complex implementation (file management)
- Requires temp directory or cleanup logic
- No performance benefit, just correctness

**Estimated Complexity**: Medium
**Risk Level**: Low
**Expected Impact**: 0% performance (but improves reliability)

### Approach 6: Profile-Based Configuration

**Description**: Create speed-optimized profiles in config.toml for different use cases.

**Implementation**:
```toml
# ~/.codex/config.toml
[profiles.codev-fast]
model = "o4-mini"
model_reasoning_effort = "low"
approval_policy = "never"
hide_agent_reasoning = true

[profiles.codev-thorough]
model = "gpt-5-codex"
model_reasoning_effort = "medium"
approval_policy = "on-failure"
```

```python
# In consult tool
cmd = ["codex", "exec", "--profile", "codev-fast", query]
```

**Pros**:
- Clean separation of fast vs thorough workflows
- Easy to switch modes
- All settings in one place
- Can share profiles across team

**Cons**:
- Requires config file management
- User must create profiles before use
- Profile names may not be intuitive

**Estimated Complexity**: Medium
**Risk Level**: Low
**Expected Impact**: 30-50% (combines multiple optimizations)

## Recommended Approach

**Hybrid: Combine Approach 1 (Model), Approach 2 (Reasoning), and Approach 5 (Instructions.md)**

1. **Immediate (Low-Hanging Fruit)**:
   - Switch to `o4-mini` or `gpt-4.1` model explicitly
   - Set `model_reasoning_effort=low` for consultations
   - Expected improvement: 30-40% faster (200s → 120-140s)

2. **Short-Term (Reliability)**:
   - Replace `CODEX_SYSTEM_MESSAGE` with `codex.md` instructions file
   - Add timeout configuration
   - Expected benefit: More reliable, future-proof

3. **Medium-Term (Flexibility)**:
   - Create `codev-fast` and `codev-thorough` profiles
   - Allow user to choose via --fast flag in consult tool
   - Expected benefit: User control over speed/quality trade-off

4. **Future (If Still Slow)**:
   - Consider architect-mediated mode (similar to Gemini approach)
   - Pre-fetch context and disable tool use
   - Only if above approaches don't reach <150s target

## Open Questions

### Critical (Blocks Progress)
- [x] Is `CODEX_SYSTEM_MESSAGE` environment variable actually supported? **Answer: Not documented, should use instructions.md**
- [ ] What is the actual quality difference between o4-mini and gpt-5-codex for code reviews?
- [ ] Will changing models affect API billing significantly?

### Important (Affects Design)
- [ ] Should we expose model selection to users, or always use fastest?
- [ ] Can we cache consultations to avoid re-running expensive queries?
- [ ] Should consultation speed be a config option in codev/config.json?

### Nice-to-Know (Optimization)
- [ ] Can we run multiple consultations in parallel more efficiently?
- [ ] Is there a batch mode for multiple queries?
- [ ] Can we measure token delay optimization impact?

## Performance Requirements
- **Response Time**: <150s p95 for PR consultations (down from 200-250s)
- **Consistency**: <20% variance between runs (avoid sporadic slowdowns)
- **Quality**: Maintain >90% agreement with current Codex output
- **Reliability**: Zero failures due to undocumented features

## Security Considerations
- Avoid exposing system prompts in temp files (use secure temp directories)
- Ensure temp `codex.md` files are cleaned up even on failure
- Validate that profile configs don't leak sensitive information
- Consider implications of different approval policies

## Test Scenarios

### Functional Tests
1. **Happy Path**: Run consultation with fast profile, verify output quality
2. **Model Selection**: Test o4-mini vs gpt-4.1 vs gpt-5-codex, compare results
3. **Instructions.md**: Verify system message works via codex.md instead of env var
4. **Error Handling**: Ensure temp files cleaned up on failure

### Non-Functional Tests
1. **Performance**: Measure baseline (200-250s) vs optimized (target <150s)
2. **Consistency**: Run 10 consultations, measure variance
3. **Quality**: Compare fast vs thorough output for same PR (human evaluation)

### Benchmarking Plan
```bash
# Baseline
time ./codev/bin/consult --model codex pr 33  # Expected: 200-250s

# With optimizations
time ./codev/bin/consult --model codex pr 33  # Target: <150s

# Quality check (manual)
diff baseline-output.txt optimized-output.txt
# Measure: Are critical issues still caught?
```

## Dependencies
- **External Services**: OpenAI API (Codex CLI)
- **Internal Systems**: consult tool (`codev/bin/consult`)
- **Libraries/Frameworks**:
  - Codex CLI v0.65.0+
  - Python 3.x (for consult tool)

## References
- [Codex CLI Official Documentation](https://developers.openai.com/codex/cli/)
- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference/)
- [Configuring Codex](https://developers.openai.com/codex/local-config/)
- [Codex Models Documentation](https://developers.openai.com/codex/models/)
- [Top 10 Codex CLI Tips](https://dev.to/therealmrmumba/top-10-codex-cli-tips-every-developer-should-know-2340)
- [Codex Performance Tips](https://www.nathanonn.com/the-latest-codex-cli-commands-that-will-save-your-sanity-and-your-rate-limits/)
- [Codex Config Documentation (GitHub)](https://github.com/openai/codex/blob/main/docs/config.md)
- Current implementation: `/Users/mwk/Development/cluesmith/codev/codev/bin/consult`

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|-------------------|
| Faster models reduce review quality | High | High | Benchmark quality before switching; create thorough mode fallback |
| CODEX_SYSTEM_MESSAGE breaks in future version | Medium | Medium | Migrate to instructions.md approach immediately |
| Model names/APIs change | Low | Medium | Use config.toml profiles, easy to update in one place |
| Performance gains don't materialize | Low | Medium | Implement incrementally, measure after each change |
| API costs increase with faster models | Low | Low | Monitor usage; o4-mini is cheaper than gpt-5-codex |
| Undocumented features cause reliability issues | High | High | Replace all undocumented usage with official approaches |

## Expert Consultation
**Status**: Not yet conducted
**Planned Models**: GPT-5 and Gemini Pro
**Focus Areas**:
- Validate recommended model selection (o4-mini vs gpt-4.1)
- Review reasoning effort settings for code review use case
- Assess quality vs speed trade-offs
- Identify any Codex CLI options we missed

## Key Findings from Research

### CLI Options Documented
1. **--model, -m**: Override model (e.g., `gpt-5-codex`, `o4-mini`, `gpt-4.1`)
2. **--full-auto**: Unattended local work with workspace-write sandbox + approvals on failure
3. **--sandbox**: Policy for model commands (read-only, workspace-write, danger-full-access)
4. **--profile**: Load config profile from ~/.codex/config.toml
5. **-c key=value**: Override config settings inline (e.g., `-c model_reasoning_effort=low`)
6. **--json**: Output JSONL events instead of formatted text
7. **--output-last-message**: Save final message to file
8. **--dangerously-bypass-approvals-and-sandbox** (--yolo): Skip approvals and sandbox (DANGEROUS)

### Config.toml Settings
```toml
model = "gpt-5-codex"              # Model to use
model_reasoning_effort = "medium"  # minimal|low|medium|high|none
model_context_window = N           # Tokens available
model_max_output_tokens = N        # Max output tokens
stream_idle_timeout_ms = 300000    # Stream timeout (5 min default)
hide_agent_reasoning = false       # Suppress reasoning events
show_raw_agent_reasoning = false   # Show raw chain-of-thought
model_reasoning_summary = "auto"   # Reasoning summary detail
approval_policy = "on-failure"     # When to ask for approval
```

### Model Recommendations from Research
- **o4-mini**: Fastest for common coding tasks (recommended for speed)
- **gpt-4.1**: Balanced speed and capability
- **gpt-5-codex**: Default, best results but slowest (macOS/Linux)
- **gpt-5**: Default on Windows
- **codex-mini-latest**: CLI-optimized with lower latency

### Performance Tips Discovered
1. **Use fast tools**: Prefer `rg` over `grep` for searching
2. **Aliases**: Create shell aliases for common configs
3. **Context management**: Use `/compact` to shrink conversation history
4. **Token delay**: Adaptive delay shows 40% wall-clock improvement (potential future optimization)
5. **Profile configs**: Pre-configure common workflows

### Undocumented/Unclear
- `CODEX_SYSTEM_MESSAGE` environment variable: **Not found in official docs**
- Should use `instructions.md` files instead (official approach)
- Token delay optimization is a GitHub issue proposal, not yet merged

## Implementation Notes

### Quick Win: One-Line Change Test
```python
# In codev/bin/consult, line 152:
# Before:
cmd = ["codex", "exec", "--full-auto", query]

# After (quick test):
cmd = ["codex", "exec", "--model", "o4-mini", "-c", "model_reasoning_effort=low", "--full-auto", query]
```

This single change could reduce time from 200s to ~120-140s based on research findings.

### Quality Validation Process
1. Run consultation with current settings, save output
2. Run consultation with optimized settings, save output
3. Compare outputs manually:
   - Are all critical issues still identified?
   - Is the verdict (APPROVE/REQUEST_CHANGES) the same?
   - Are the key concerns similar?
4. If quality is acceptable, proceed with implementation
5. If quality degrades, try gpt-4.1 instead of o4-mini

## Approval
- [ ] Technical Lead Review
- [ ] Product Owner Review (Waleed)
- [ ] Stakeholder Sign-off
- [ ] Expert AI Consultation Complete (GPT-5 + Gemini Pro)

## Notes

### Context from projectlist.md
Project 0043 was conceived with the note: "Codex takes 200-250s vs Gemini's 120-150s. Sequential shell commands. Need to investigate optimization opportunities."

This spec addresses that by:
1. Documenting all available optimization options
2. Providing concrete recommendations (model + reasoning effort)
3. Fixing the undocumented CODEX_SYSTEM_MESSAGE usage
4. Creating a path to <150s consultations

### Implementation Priority
**Immediate**: Model + reasoning effort changes (one-line fix, big impact)
**Short-term**: Replace CODEX_SYSTEM_MESSAGE with instructions.md
**Medium-term**: Profile-based configuration
**Future**: Consider mediated mode if still too slow

### Success Metric
If we achieve <150s consultations with maintained quality, we've met the goal. The spec provides multiple levers to pull if the first approach doesn't fully solve the problem.
