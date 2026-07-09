#!/usr/bin/env node
import { run, realIo } from "../cli.js";

const code = await run(process.argv.slice(2), realIo());
process.exitCode = code;
