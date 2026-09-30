import { test } from "bun:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

import { writeSessionConfig } from "../src/session.ts";

const execute = promisify(execFile);

test("unknown commands fail without silent success", async () => {
  await assert.rejects(
    execute(process.execPath, ["src/index.ts", "unexpected"]),
    (error: unknown) => {
      assert.ok(error instanceof Error && "stderr" in error);
      assert.match(String(error.stderr), /Unknown command/i);

      return true;
    },
  );
});

test("CLI rejects invalid arguments before reading browser credentials", async () => {
  for (const args of [
    ["content", "list"],
    ["task", "show", "123"],
    ["notice", "show", "../logout"],
    ["course", "show", "1", "extra"],
    ["updates", "extra"],
    ["auth", "https://evil.test"],
    ["auth", "https://user:synthetic@mgu.manaba.jp"],
    ["auth", "https://mgu.manaba.jp", "--browser", "unknown"],
  ]) {
    await assert.rejects(execute(process.execPath, ["src/index.ts", ...args]), (error: unknown) => {
      assert.ok(error instanceof Error && "stderr" in error && "stdout" in error);
      assert.equal(error.stdout, "");
      assert.doesNotMatch(String(error.stderr), /synthetic|Keychain/);

      return true;
    });
  }
});

test("nested command help requires no session and documents arguments", async () => {
  const { stdout, stderr } = await execute(process.execPath, [
    "src/index.ts",
    "content",
    "list",
    "--help",
  ]);

  assert.match(stdout, /<course-id>/);
  assert.equal(stderr, "");
});

test("global config option is honored before and after subcommands", async () => {
  const path = join(tmpdir(), `ripmanaba-missing-${randomUUID()}.json`);

  for (const args of [
    ["--config", path, "course", "list"],
    ["course", "list", "--config", path],
  ]) {
    await assert.rejects(execute(process.execPath, ["src/index.ts", ...args]), (error: unknown) => {
      assert.ok(error instanceof Error && "stderr" in error);
      assert.match(String(error.stderr), /No browser configured/);

      return true;
    });
  }
});

// These fixtures replace POSIX executables; they cannot intercept Windows rundll32.
test.skipIf(process.platform === "win32")(
  "open reports a failed system browser opener",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "ripmanaba-open-"));
    const path = join(directory, "config.json");
    let command = "xdg-open";

    if (process.platform === "darwin") {
      command = "open";
    }

    try {
      await writeSessionConfig(
        { browser: "chrome", origin: "https://mgu.manaba.jp", version: 1 },
        path,
      );

      await writeFile(join(directory, command), "#!/bin/sh\nexit 7\n", { mode: 0o755 });

      await assert.rejects(
        execute(process.execPath, ["src/index.ts", "course", "open", "1", "--config", path], {
          env: { ...process.env, PATH: `${directory}${delimiter}${process.env["PATH"] ?? ""}` },
        }),
        (error: unknown) => {
          assert.ok(error instanceof Error && "stderr" in error);
          assert.match(String(error.stderr), /Browser opener failed \(7\)/);

          return true;
        },
      );
    } finally {
      await rm(directory, { recursive: true });
    }
  },
);

test.skipIf(process.platform === "win32")(
  "open finishes while the system browser process is still running",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "ripmanaba-open-"));
    const path = join(directory, "config.json");
    let command = "xdg-open";

    if (process.platform === "darwin") {
      command = "open";
    }

    try {
      await writeSessionConfig(
        { browser: "chrome", origin: "https://mgu.manaba.jp", version: 1 },
        path,
      );

      await writeFile(join(directory, command), "#!/bin/sh\nsleep 3\n", { mode: 0o755 });

      const { stdout, stderr } = await execute(
        process.execPath,
        ["src/index.ts", "course", "open", "1", "--config", path],
        {
          env: { ...process.env, PATH: `${directory}${delimiter}${process.env["PATH"] ?? ""}` },
          timeout: 2500,
        },
      );

      assert.equal(stdout, "");
      assert.equal(stderr, "");
    } finally {
      await rm(directory, { recursive: true });
    }
  },
);

test("list commands reject extra ids before accessing a session", async () => {
  await assert.rejects(
    execute(process.execPath, ["src/index.ts", "course", "list", "extra"]),
    (error: unknown) => {
      assert.ok(error instanceof Error && "stderr" in error);
      assert.match(String(error.stderr), /does not accept|unexpected|too many/i);

      return true;
    },
  );
});
