import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import { chromium } from "playwright";

import {
  browserProfileDirectory,
  storageStateFile,
  writeBrowserStorageState,
  writeSessionConfig,
} from "./session.ts";

function normalizeOrigin(url: string): string {
  return new URL(url).origin;
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
    await readline.question(
      "Open manaba in the browser, log in, then return to this terminal and press Enter.",
    );
  } finally {
    readline.close();
  }
}

async function confirmSessionOrigin(origin: string): Promise<boolean> {
  const readline = createInterface({ input, output });

  try {
    const answer = await readline.question(`Save manaba session for ${origin}? [y/N] `);

    return answer.trim().toLowerCase() === "y";
  } finally {
    readline.close();
  }
}

export async function authenticate(): Promise<void> {
  const context = await chromium.launchPersistentContext(browserProfileDirectory, {
    headless: false,
  });

  try {
    if (context.pages().length === 0) {
      await context.newPage();
    }

    await context.pages()[0]?.bringToFront();
    await waitForUserLogin();

    const currentUrl = findOpenPageUrl(context);

    if (currentUrl === undefined) {
      throw new Error("No manaba page is open. Open manaba and log in before pressing Enter.");
    }

    const origin = normalizeOrigin(currentUrl);

    if (!(await confirmSessionOrigin(origin))) {
      console.log("Canceled. Session was not saved.");

      return;
    }

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
