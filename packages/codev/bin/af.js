#!/usr/bin/env node

// af is shorthand for codev agent-farm
// Inject 'agent-farm' as first argument
import { run } from '../dist/cli.js';

const args = process.argv.slice(2);
run(['agent-farm', ...args]);
