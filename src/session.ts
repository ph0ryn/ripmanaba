import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { BrowserName } from "@steipete/sweet-cookie";

export const sessionFile = join(
  process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config"),
  "ripmanaba",
  "config.json",
);

export interface SessionConfig {
  version: 1;
  origin: string;
  browser: BrowserName;
  profile?: string;
}

export function normalizeManabaOrigin(value: string): string {
  if (!URL.canParse(value)) {
    throw new Error("Expected an HTTPS manaba URL, for example https://mgu.manaba.jp.");
  }

  const url = new URL(value);

  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".manaba.jp") ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== ""
  ) {
    throw new Error("Expected an HTTPS manaba URL without credentials or a custom port.");
  }

  return url.origin;
}

export function parseBrowser(value: string): BrowserName {
  if (value === "chrome" || value === "edge" || value === "firefox" || value === "safari") {
    return value;
  }

  throw new Error("Browser must be chrome, edge, firefox or safari.");
}

export function validateSessionConfig(value: unknown): SessionConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid configuration. Run ripmanaba auth <url> again.");
  }

  const data = value as Record<string, unknown>;

  if (
    data["version"] !== 1 ||
    typeof data["origin"] !== "string" ||
    typeof data["browser"] !== "string" ||
    (data["profile"] !== undefined &&
      (typeof data["profile"] !== "string" || data["profile"].trim() === "")) ||
    Object.keys(data).some((key) => !["version", "origin", "browser", "profile"].includes(key))
  ) {
    throw new Error("Invalid configuration. Run ripmanaba auth <url> again.");
  }

  const origin = normalizeManabaOrigin(data["origin"]);
  const browser = parseBrowser(data["browser"]);
  const profile = data["profile"] as string | undefined;

  if (origin !== data["origin"] || (browser === "safari" && profile !== undefined)) {
    throw new Error("Invalid configuration. Safari does not accept a profile selector.");
  }

  const config: SessionConfig = { browser, origin, version: 1 };

  if (profile !== undefined) {
    config.profile = profile;
  }

  return config;
}

export async function readSessionConfig(path = sessionFile): Promise<SessionConfig | undefined> {
  const contents = await readFile(path, "utf8").catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }

    throw new Error(`Unable to read configuration at ${path}.`, { cause: error });
  });

  if (contents === undefined) {
    return undefined;
  }

  try {
    const data: unknown = JSON.parse(contents);

    return validateSessionConfig(data);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Invalid configuration JSON. Run ripmanaba auth <url> again.");
    }

    throw error;
  }
}

export async function requireSessionConfig(path = sessionFile): Promise<SessionConfig> {
  const config = await readSessionConfig(path);

  if (config === undefined) {
    throw new Error("No browser configured. Run ripmanaba auth <url> first.");
  }

  return config;
}

export async function writeSessionConfig(config: SessionConfig, path = sessionFile): Promise<void> {
  const validated = validateSessionConfig(config);

  await mkdir(dirname(path), { mode: 0o700, recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;

  try {
    await writeFile(temporaryPath, `${JSON.stringify(validated, undefined, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });

    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
