import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { BrowserContext } from "playwright";

export const appDirectory = join(homedir(), ".ripmanaba");
export const browserProfileDirectory = join(appDirectory, "browser-profile");
export const sessionFile = join(appDirectory, "session.json");
export const storageStateFile = join(appDirectory, "storage-state.json");

export interface SessionConfig {
  origin: string;
  browserProfileDirectory: string;
  storageStateFile: string;
  authenticatedAt: string;
}

export async function ensureParentDirectory(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

export async function readSessionConfig(): Promise<SessionConfig | undefined> {
  try {
    return JSON.parse(await readFile(sessionFile, "utf8")) as SessionConfig;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

export async function requireSessionConfig(): Promise<SessionConfig> {
  const config = await readSessionConfig();

  if (config === undefined) {
    throw new Error("No saved session. Run ripmanaba auth first.");
  }

  return config;
}

export async function writeSessionConfig(config: SessionConfig): Promise<void> {
  await ensureParentDirectory(sessionFile);
  await writeFile(sessionFile, `${JSON.stringify(config, undefined, 2)}\n`);
}

export async function writeBrowserStorageState(
  context: BrowserContext,
  path: string,
): Promise<void> {
  await ensureParentDirectory(path);
  await context.storageState({ path });
}
