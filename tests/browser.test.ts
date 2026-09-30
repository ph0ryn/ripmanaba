import { Database } from "bun:sqlite";
import { test } from "bun:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createCipheriv, createHash, pbkdf2Sync } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const origin = "https://mgu.manaba.jp";
const host = "mgu.manaba.jp";
const password = "synthetic-password";

function encryptCookieValue(prefix: "v10" | "v11"): Buffer {
  let iterations = 1;

  if (process.platform === "darwin") {
    iterations = 1003;
  }

  const key = pbkdf2Sync(password, "saltysalt", iterations, 16, "sha1");
  const plaintext = Buffer.concat([
    createHash("sha256").update(host).digest(),
    Buffer.from("synthetic"),
  ]);
  const cipher = createCipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));

  return Buffer.concat([Buffer.from(prefix), cipher.update(plaintext), cipher.final()]);
}

async function createCookieDatabase(path: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  const database = new Database(path);

  try {
    database.run("CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)");

    database.run(
      "CREATE TABLE cookies (name TEXT NOT NULL, value TEXT NOT NULL, host_key TEXT NOT NULL, path TEXT NOT NULL, expires_utc INTEGER NOT NULL, samesite INTEGER NOT NULL, encrypted_value BLOB NOT NULL, is_secure INTEGER NOT NULL, is_httponly INTEGER NOT NULL)",
    );

    database.query("INSERT INTO meta (key, value) VALUES (?, ?)").run("version", "24");

    let encryptedPrefix: "v10" | "v11" = "v11";

    if (process.platform === "darwin") {
      encryptedPrefix = "v10";
    }

    database
      .query(
        "INSERT INTO cookies (name, value, host_key, path, expires_utc, samesite, encrypted_value, is_secure, is_httponly) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run("sessionid", "", host, "/", 0, 1, encryptCookieValue(encryptedPrefix), 1, 1);
  } finally {
    database.close();
  }
}

test.skipIf(process.platform !== "darwin" && process.platform !== "linux")(
  "auth reads an encrypted Chromium cookie DB through the CLI",
  async () => {
    const home = await mkdtemp(join(tmpdir(), "ripmanaba-chromium-home-"));
    const helperDirectory = await mkdtemp(join(tmpdir(), "ripmanaba-chromium-helper-"));
    const configDirectory = join(home, ".config", "ripmanaba");
    const configPath = join(configDirectory, "config.json");
    const xdgConfigHome = join(home, ".config");
    let browserRoot = join(xdgConfigHome, "chromium");

    if (process.platform === "darwin") {
      browserRoot = join(home, "Library", "Application Support", "Chromium");
    }

    const profileDirectory = join(browserRoot, "Default");
    const cookieDatabase = join(profileDirectory, "Network", "Cookies");
    const helperTrace = join(helperDirectory, "helper.trace");
    const fetchTrace = join(helperDirectory, "fetch.trace");
    const preloadPath = join(helperDirectory, "fetch-preload.mjs");
    let helperName = "secret-tool";

    if (process.platform === "darwin") {
      helperName = "security";
    }

    const helperPath = join(helperDirectory, helperName);

    try {
      await mkdir(configDirectory, { recursive: true });
      await createCookieDatabase(cookieDatabase);

      await writeFile(
        helperPath,
        `#!/bin/sh
printf '%s\\n' "$@" > "$RIPMANABA_HELPER_TRACE"
printf '%s\\n' "$RIPMANABA_HELPER_PASSWORD"
`,
        { mode: 0o755 },
      );

      await writeFile(
        preloadPath,
        `globalThis.fetch = async (input, init) => {
  const cookie = new Headers(init?.headers).get('cookie');
  await Bun.write(process.env.RIPMANABA_FETCH_TRACE, JSON.stringify({ cookie, url: String(input) }));
  return new Response('<a href="/ct/logout">ログアウト</a>', { headers: { 'content-type': 'text/html' } });
};
`,
      );

      const cleanEnvironment = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith("SWEET_COOKIE_")),
      );
      const environment: NodeJS.ProcessEnv = {
        ...cleanEnvironment,
        HOME: home,
        PATH: `${helperDirectory}${delimiter}${process.env["PATH"] ?? ""}`,
        RIPMANABA_FETCH_TRACE: fetchTrace,
        RIPMANABA_HELPER_PASSWORD: password,
        RIPMANABA_HELPER_TRACE: helperTrace,
        XDG_CONFIG_HOME: xdgConfigHome,
      };

      if (process.platform === "linux") {
        environment["SWEET_COOKIE_LINUX_KEYRING"] = "gnome";
      }

      const cases: { name: string; profile?: string }[] = [
        { name: "default profile discovery" },
        { name: "absolute profile directory", profile: profileDirectory },
        { name: "absolute cookie database", profile: cookieDatabase },
      ];

      for (const scenario of cases) {
        await rm(configPath, { force: true });
        await rm(helperTrace, { force: true });
        await rm(fetchTrace, { force: true });

        const args = [
          "--no-env-file",
          "--preload",
          preloadPath,
          "src/index.ts",
          "auth",
          origin,
          "--browser",
          "chromium",
          "--config",
          configPath,
        ];

        if (scenario.profile !== undefined) {
          args.push("--profile", scenario.profile);
        }

        const result = await execute(process.execPath, args, { env: environment });
        const expectedConfig: Record<string, unknown> = {
          browser: "chromium",
          origin,
          version: 1,
        };

        if (scenario.profile !== undefined) {
          expectedConfig["profile"] = scenario.profile;
        }

        assert.equal(result.stderr, "", scenario.name);
        assert.deepEqual(JSON.parse(result.stdout), expectedConfig, scenario.name);

        assert.deepEqual(
          JSON.parse(await readFile(configPath, "utf8")),
          expectedConfig,
          scenario.name,
        );

        assert.deepEqual(
          JSON.parse(await readFile(fetchTrace, "utf8")),
          { cookie: "sessionid=synthetic", url: `${origin}/ct/home` },
          scenario.name,
        );

        const helperArguments = (await readFile(helperTrace, "utf8")).trim().split("\n");
        let expectedHelperArguments = [
          "lookup",
          "service",
          "Chromium Safe Storage",
          "account",
          "Chromium",
        ];

        if (process.platform === "darwin") {
          expectedHelperArguments = [
            "find-generic-password",
            "-w",
            "-a",
            "Chromium",
            "-s",
            "Chromium Safe Storage",
          ];
        }

        assert.deepEqual(helperArguments, expectedHelperArguments, scenario.name);
      }
    } finally {
      await rm(home, { force: true, recursive: true });
      await rm(helperDirectory, { force: true, recursive: true });
    }
  },
);
