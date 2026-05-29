import { getContentInfo, listContents, openContent } from "./content.ts";
import { getCourseInfo, listCourses, openCourse } from "./course.ts";
import { listNewCourseStatuses } from "./new.ts";
import { getNoticeInfo, listNotices, openNotice } from "./notice.ts";
import { getSubmissionInfo, listSubmissions, openSubmission } from "./submission.ts";
import { getTaskInfo, listTasks, openTask } from "./task.ts";

import type { CAC } from "cac";

interface ResourceCommandConfig {
  name: string;
  aliases?: string[];
  infoPath?: (id: string) => string;
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

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, undefined, 2));
}

async function runTaskCommand(operation: string, id: string | undefined): Promise<void> {
  assertResourceOperation(operation);

  if (operation === "ls") {
    printJson(await listTasks());

    return;
  }

  const resourceId = requireResourceId(operation, id);

  if (operation === "info") {
    printJson(await getTaskInfo(resourceId));

    return;
  }

  await openTask(resourceId);
}

async function runCourseCommand(operation: string, id: string | undefined): Promise<void> {
  assertResourceOperation(operation);

  if (operation === "ls") {
    printJson(await listCourses());

    return;
  }

  const resourceId = requireResourceId(operation, id);

  if (operation === "info") {
    printJson(await getCourseInfo(resourceId));

    return;
  }

  await openCourse(resourceId);
}

async function runContentCommand(operation: string, id: string | undefined): Promise<void> {
  assertResourceOperation(operation);

  if (operation === "ls") {
    if (id === undefined) {
      throw new Error("content ls requires a course id.");
    }

    printJson(await listContents(id));

    return;
  }

  const resourceId = requireResourceId(operation, id);

  if (operation === "info") {
    printJson(await getContentInfo(resourceId));

    return;
  }

  await openContent(resourceId);
}

async function runNoticeCommand(operation: string, id: string | undefined): Promise<void> {
  assertResourceOperation(operation);

  if (operation === "ls") {
    printJson(await listNotices());

    return;
  }

  const resourceId = requireResourceId(operation, id);

  if (operation === "info") {
    printJson(await getNoticeInfo(resourceId));

    return;
  }

  await openNotice(resourceId);
}

async function runSubmissionCommand(operation: string, id: string | undefined): Promise<void> {
  assertResourceOperation(operation);

  if (operation === "ls") {
    printJson(await listSubmissions());

    return;
  }

  const resourceId = requireResourceId(operation, id);

  if (operation === "info") {
    printJson(await getSubmissionInfo(resourceId));

    return;
  }

  await openSubmission(resourceId);
}

async function runNewCommand(): Promise<void> {
  printJson(await listNewCourseStatuses());
}

function registerResourceCommands(
  cli: CAC,
  config: ResourceCommandConfig,
  action: (operation: string, id: string | undefined) => Promise<void>,
): void {
  const command = cli
    .command(`${config.name} <operation> [id]`, `Run ${config.name} operation`)
    .action(async (operation: string, id: string | undefined) => {
      await action(operation, id);
    });

  for (const alias of config.aliases ?? []) {
    command.alias(alias);
  }
}

export function registerResourceCli(cli: CAC): void {
  const courseConfig: ResourceCommandConfig = {
    aliases: ["crs"],
    name: "course",
  };

  registerResourceCommands(cli, courseConfig, runCourseCommand);

  registerResourceCommands(cli, { name: "task" }, runTaskCommand);

  registerResourceCommands(cli, { name: "content" }, runContentCommand);

  registerResourceCommands(cli, { name: "notice" }, runNoticeCommand);

  registerResourceCommands(cli, { name: "submission" }, runSubmissionCommand);

  cli.command("new", "List active course statuses on home").action(runNewCommand);
}
