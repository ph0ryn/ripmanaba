#!/usr/bin/env bun

import { CommanderError } from "commander";

import { createCli } from "./cli.ts";

try {
  await createCli().parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError) {
    process.exitCode = error.exitCode;
  } else if (error instanceof Error) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
