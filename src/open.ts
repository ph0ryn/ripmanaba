import { spawn } from "node:child_process";

export async function openUrl(url: string): Promise<void> {
  const parsed = new URL(url);

  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS browser links are supported.");
  }

  let command = "xdg-open";
  let args = [url];

  if (process.platform === "darwin") {
    command = "open";
  } else if (process.platform === "win32") {
    command = "rundll32";
    args = ["url.dll,FileProtocolHandler", url];
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    const timer = setTimeout(() => {
      child.unref();
      resolve();
    }, 1000);

    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Unable to start the system browser."));
    });

    child.once("exit", (code, signal) => {
      clearTimeout(timer);

      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Browser opener failed (${signal ?? code}).`));
      }
    });
  });
}
