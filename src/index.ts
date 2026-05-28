#!/usr/bin/env bun

import { cac } from "cac";

import { authenticate } from "./auth.ts";
import { registerResourceCli } from "./resource/index.ts";

const cli = cac("ripmanaba");

cli
  .command("auth", "Open a persistent browser profile and save manaba session metadata")
  .action(authenticate);

registerResourceCli(cli);

cli.help();
cli.version("0.0.0");

async function main(): Promise<void> {
  cli.parse(process.argv, { run: false });
  await cli.runMatchedCommand();
}

try {
  await main();
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
