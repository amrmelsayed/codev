#!/usr/bin/env node

// consult is shorthand for codev consult
import { run } from '../dist/cli.js';

const args = process.argv.slice(2);
run(['consult', ...args]);
