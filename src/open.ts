import { spawn } from "node:child_process";

import { requireSessionConfig } from "./session.ts";

export function normalizeManabaPath(path: string): string {
  if (path.startsWith("/ct/")) {
    return path;
  }

  return `/ct/${path.replace(/^\/+/, "")}`;
}

export function manabaPathToUrl(path: string, origin: string): string {
  return new URL(normalizeManabaPath(path), origin).toString();
}

export async function openManabaPath(path: string): Promise<void> {
  const config = await requireSessionConfig();
  const url = manabaPathToUrl(path, config.origin);

  await openUrl(url);
}

export async function openUrl(url: string): Promise<void> {
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
