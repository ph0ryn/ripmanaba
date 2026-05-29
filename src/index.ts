#!/usr/bin/env bun

import { readFile } from "node:fs/promises";

import { cac } from "cac";

import packageJson from "../package.json" with { type: "json" };
import { authenticate } from "./auth.ts";
import { registerResourceCli } from "./resource/index.ts";
import { requireSessionConfig, type SessionConfig } from "./session.ts";

interface StorageStateCookie {
  name: string;
  value: string;
  domain: string;
}

interface StorageState {
  cookies: StorageStateCookie[];
}

function domainMatches(hostname: string, cookieDomain: string): boolean {
  const normalizedDomain = cookieDomain.replace(/^\./, "");

  if (hostname === normalizedDomain) {
    return true;
  }

  return hostname.endsWith(`.${normalizedDomain}`);
}

async function buildCookieHeader(config: SessionConfig): Promise<string> {
  const state = JSON.parse(await readFile(config.storageStateFile, "utf8")) as StorageState;
  const hostname = new URL(config.origin).hostname;

  return state.cookies
    .filter((cookie) => domainMatches(hostname, cookie.domain))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

function isAuthenticationPage(url: string, origin: string, html: string): boolean {
  if (new URL(url).origin !== origin) {
    return true;
  }

  return /<input[^>]+type=["']?password/i.test(html);
}

const cli = cac("ripmanaba");

cli
  .command("auth", "Open a persistent browser profile and save manaba session metadata")
  .action(authenticate);

registerResourceCli(cli);

cli.help();
cli.version(packageJson.version);

function shouldVerifyAuthenticatedSession(): boolean {
  const commandName = (cli as typeof cli & { matchedCommandName?: string }).matchedCommandName;
  const operation = cli.args[0];

  return (
    commandName !== undefined &&
    commandName !== "auth" &&
    (commandName === "new" || operation === "ls" || operation === "info")
  );
}

async function verifyAuthenticatedSession(): Promise<void> {
  const config = await requireSessionConfig();
  const url = new URL("/ct/home_course", config.origin);
  const cookie = await buildCookieHeader(config);
  const response = await fetch(url, { headers: { cookie } });
  const html = await response.text();

  if (!response.ok) {
    throw new Error(`Failed to verify saved session: ${response.status}`);
  }

  if (isAuthenticationPage(response.url, config.origin, html)) {
    throw new Error("Saved session is not authenticated. Run ripmanaba auth again.");
  }
}

async function main(): Promise<void> {
  cli.parse(process.argv, { run: false });

  if (shouldVerifyAuthenticatedSession()) {
    await verifyAuthenticatedSession();
  }

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
