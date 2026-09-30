import { Command } from "commander";

import packageJson from "../package.json" with { type: "json" };
import { authenticate, type AuthOptions } from "./auth.ts";
import { createManabaClient, type ManabaClient } from "./http.ts";
import { openUrl } from "./open.ts";
import { getContentInfo, listContents } from "./resource/content.ts";
import { getCourseInfo, listCourses } from "./resource/course.ts";
import { manabaPathToUrl } from "./resource/helpers.ts";
import { getNoticeInfo, listNotices } from "./resource/notice.ts";
import { getSubmissionInfo, listSubmissions } from "./resource/submission.ts";
import { getTaskInfo, listTasks } from "./resource/task.ts";
import { listCourseUpdates } from "./resource/updates.ts";
import { requireSessionConfig, type SessionConfig } from "./session.ts";

interface GlobalOptions {
  config?: string;
}

interface ResourceCommand {
  idPattern: RegExp;
  list(client: ManabaClient, id?: string): Promise<unknown>;
  listArgument?: string;
  name: string;
  openPath?: (id: string) => string;
  openReference?: (client: ManabaClient, id: string) => Promise<{ url: string }>;
  show(client: ManabaClient, id: string): Promise<unknown>;
}

const resources: ResourceCommand[] = [
  {
    idPattern: /^\d+$/,
    list: listCourses,
    name: "course",
    openPath: (id) => `course_${id}`,
    show: getCourseInfo,
  },
  {
    idPattern: /^\d+_(?:report|query|survey)_\d+$/,
    list: listTasks,
    name: "task",
    openPath: (id) => `course_${id}`,
    show: getTaskInfo,
  },
  {
    idPattern: /^[a-zA-Z0-9-]+(?:_[a-zA-Z0-9-]+)?$/,
    list: (client, id = "") => listContents(client, id),
    listArgument: "course-id",
    name: "content",
    openPath: (id) => `page_${id}`,
    show: getContentInfo,
  },
  {
    idPattern: /^\d+$/,
    list: listNotices,
    name: "notice",
    openPath: (id) => `home_campusnews_${id}`,
    show: getNoticeInfo,
  },
  {
    idPattern: /^[a-zA-Z0-9-]+$/,
    list: listSubmissions,
    name: "submission",
    openReference: getSubmissionInfo,
    show: getSubmissionInfo,
  },
];

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, undefined, 2));
}

function validateId(value: string, pattern: RegExp): string {
  if (!pattern.test(value)) {
    throw new Error("Invalid resource id. Use an id from the list output.");
  }

  return value;
}

async function clientFor(command: Command): Promise<ManabaClient> {
  const options = command.optsWithGlobals<GlobalOptions>();

  return createManabaClient(await requireSessionConfig(options.config));
}

async function resourceUrl(
  resource: ResourceCommand,
  id: string,
  config: SessionConfig,
): Promise<string> {
  if (resource.openPath !== undefined) {
    return manabaPathToUrl(resource.openPath(id), config.origin);
  }

  if (resource.openReference !== undefined) {
    return (await resource.openReference(await createManabaClient(config), id)).url;
  }

  throw new Error("Resource has no browser reference.");
}

function registerResource(program: Command, resource: ResourceCommand): void {
  const group = program
    .command(resource.name)
    .description(`Read ${resource.name} data from manaba`);
  const list = group.command("list").description(`List ${resource.name} items on the current page`);

  if (resource.listArgument === undefined) {
    list.action(async () => {
      printJson(await resource.list(await clientFor(list)));
    });
  } else {
    list
      .argument(`<${resource.listArgument}>`, "Course id", (value) => validateId(value, /^\d+$/))
      .action(async (id: string) => {
        printJson(await resource.list(await clientFor(list), id));
      });
  }

  const show = group
    .command("show")
    .description(`Show ${resource.name} details as JSON`)
    .argument("<id>", "Resource id", (value) => validateId(value, resource.idPattern))
    .action(async (id: string) => {
      printJson(await resource.show(await clientFor(show), id));
    });

  const open = group
    .command("open")
    .description(`Open ${resource.name} in the system browser`)
    .argument("<id>", "Resource id", (value) => validateId(value, resource.idPattern))
    .action(async (id: string) => {
      const options = open.optsWithGlobals<GlobalOptions>();
      const config = await requireSessionConfig(options.config);
      const url = await resourceUrl(resource, id, config);

      if (new URL(url).origin !== config.origin) {
        throw new Error("Browser reference is outside the configured manaba origin.");
      }

      await openUrl(url);
    });
}

export function createCli(): Command {
  const program = new Command()
    .name("ripmanaba")
    .description("Read manaba using your logged-in browser session")
    .version(packageJson.version)
    .option("--config <path>", "Configuration file path")
    .showHelpAfterError()
    .exitOverride();

  const auth = program
    .command("auth")
    .description("Verify and select an existing browser session")
    .argument("<url>", "HTTPS manaba URL, e.g. https://mgu.manaba.jp")
    .option("--browser <browser>", "chrome, chromium, edge, firefox or safari", "chrome")
    .option("--profile <profile>", "Browser profile name or path")
    .action(async (url: string) => {
      printJson(await authenticate(url, auth.optsWithGlobals<AuthOptions>()));
    });

  for (const resource of resources) {
    registerResource(program, resource);
  }

  const updates = program
    .command("updates")
    .description("List unread and pending course statuses")
    .action(async () => {
      printJson(await listCourseUpdates(await clientFor(updates)));
    });

  return program;
}
