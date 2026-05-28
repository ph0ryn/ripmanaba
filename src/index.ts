#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import { cac } from "cac";
import { chromium } from "playwright";

const cli = cac("ripmanaba");

const appDirectory = join(homedir(), ".ripmanaba");
const browserProfileDirectory = join(appDirectory, "browser-profile");
const sessionFile = join(appDirectory, "session.json");
const storageStateFile = join(appDirectory, "storage-state.json");

interface SessionConfig {
  origin: string;
  browserProfileDirectory: string;
  storageStateFile: string;
  authenticatedAt: string;
}

function normalizeOrigin(url: string): string {
  return new URL(url).origin;
}

function normalizeManabaPath(path: string): string {
  if (path.startsWith("/ct/")) {
    return path;
  }

  return `/ct/${path.replace(/^\/+/, "")}`;
}

async function ensureParentDirectory(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

async function readSessionConfig(): Promise<SessionConfig | undefined> {
  try {
    return JSON.parse(await readFile(sessionFile, "utf8")) as SessionConfig;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function writeSessionConfig(config: SessionConfig): Promise<void> {
  await ensureParentDirectory(sessionFile);
  await writeFile(sessionFile, `${JSON.stringify(config, undefined, 2)}\n`);
}

async function writeBrowserStorageState(
  context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>,
): Promise<void> {
  await ensureParentDirectory(storageStateFile);
  await context.storageState({ path: storageStateFile });
}

function findOpenPageUrl(
  context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>,
): string | undefined {
  const pages = [...context.pages()].reverse();

  for (const page of pages) {
    const url = page.url();

    if (url !== "about:blank") {
      return url;
    }
  }

  return undefined;
}

async function waitForUserLogin(): Promise<void> {
  const readline = createInterface({ input, output });

  try {
    await readline.question("Open manaba in the browser, log in, then press Enter here.");
  } finally {
    readline.close();
  }
}

async function authenticate(): Promise<void> {
  const context = await chromium.launchPersistentContext(browserProfileDirectory, {
    headless: false,
  });

  try {
    if (context.pages().length === 0) {
      await context.newPage();
    }

    await waitForUserLogin();

    const currentUrl = findOpenPageUrl(context);

    if (currentUrl === undefined) {
      throw new Error("No manaba page is open. Open manaba and log in before pressing Enter.");
    }

    const origin = normalizeOrigin(currentUrl);

    await writeBrowserStorageState(context);

    await writeSessionConfig({
      authenticatedAt: new Date().toISOString(),
      browserProfileDirectory,
      origin,
      storageStateFile,
    });

    console.log(`Saved manaba session for ${origin}`);
  } finally {
    await context.close();
  }
}

async function requireSessionConfig(): Promise<SessionConfig> {
  const config = await readSessionConfig();

  if (config === undefined) {
    throw new Error("No saved session. Run ripmanaba auth first.");
  }

  return config;
}

async function openManabaPath(path: string): Promise<void> {
  const config = await requireSessionConfig();
  const url = new URL(normalizeManabaPath(path), config.origin);

  await openUrl(url.toString());
}

async function openUrl(url: string): Promise<void> {
  let command = "xdg-open";
  let args = [url];

  if (process.platform === "darwin") {
    command = "open";
  }

  if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });

    child.once("error", reject);

    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

interface ResourceCommandConfig {
  name: string;
  aliases?: string[];
  openPath?: (id: string) => string;
}

type ResourceOperation = "ls" | "info" | "open";

function assertResourceOperation(operation: string): asserts operation is ResourceOperation {
  if (operation === "ls" || operation === "info" || operation === "open") {
    return;
  }

  throw new Error(`Unknown operation: ${operation}`);
}

function requireResourceId(operation: ResourceOperation, id: string | undefined): string {
  if (operation === "ls") {
    return "";
  }

  if (id === undefined) {
    throw new Error(`${operation} requires an id.`);
  }

  return id;
}

async function runResourceCommand(
  config: ResourceCommandConfig,
  operation: string,
  id: string | undefined,
): Promise<void> {
  assertResourceOperation(operation);

  const resourceId = requireResourceId(operation, id);

  if (operation === "ls") {
    throw new Error(`${config.name} ls is not implemented yet.`);
  }

  if (operation === "info") {
    throw new Error(`${config.name} info is not implemented yet.`);
  }

  if (config.openPath === undefined) {
    throw new Error(`${config.name} open is not implemented yet.`);
  }

  await openManabaPath(config.openPath(resourceId));
}

function registerResourceCommands(config: ResourceCommandConfig): void {
  for (const commandName of [config.name, ...(config.aliases ?? [])]) {
    cli
      .command(`${commandName} <operation> [id]`, `Run ${config.name} operation`)
      .action(async (operation: string, id: string | undefined) => {
        await runResourceCommand(config, operation, id);
      });
  }
}

cli
  .command("auth", "Open a persistent browser profile and save manaba session metadata")
  .action(authenticate);

registerResourceCommands({
  aliases: ["crs"],
  name: "course",
  openPath: (id) => `course_${id}`,
});

registerResourceCommands({ name: "task" });

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
