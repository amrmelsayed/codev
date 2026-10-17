/**
 * Playwright configuration for the Decisions tab suite (Spec 1819) alone.
 *
 * The suite writes files, so it never touches the repository workspace: it runs without the
 * default config's global setup (which activates the repository workspace on the test Tower and
 * starts an architect shell there) and drives only throwaway `mkdtemp` workspaces, which need
 * no activation. The default config ignores the suite, so it runs only through this file.
 *
 * Run (the Tower it starts must not share the live Tower's state dir — its owner lock refuses):
 *   TOWER_TEST_PORT=14100 CODEV_AGENT_FARM_DIR="$(mktemp -d)" \
 *     npx playwright test --config playwright.decisions.config.ts
 */

import { defineConfig } from '@playwright/test';
import base, { DECISIONS_SUITE } from './playwright.config.js';

export default defineConfig({
  ...base,
  testMatch: DECISIONS_SUITE,
  testIgnore: [],
  globalSetup: undefined,
});
