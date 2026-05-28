import * as cheerio from "cheerio";

import { fetchManabaText, getManabaOrigin } from "../http.ts";
import { manabaPathToUrl, openUrl } from "../open.ts";

import type {
  CourseSummary,
  SubmissionInfoJson,
  SubmissionKind,
  SubmissionListItemJson,
} from "./types.ts";
import type { CheerioAPI } from "cheerio";

const submissionListPath = "/ct/home_submitlog";
const coursePathPattern = /\/ct\/course_([^_/?#]+)/;
const taskPathPattern = /\/ct\/course_[^_]+_(report|query|survey|drill|project)_([^/?#]+)/;

type ElementSelection = ReturnType<CheerioAPI>;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function optionalText(text: string): string | undefined {
  const normalized = normalizeText(text);

  if (normalized.length === 0) {
    return undefined;
  }

  return normalized;
}

function textOf(element: ElementSelection): string {
  return normalizeText(element.text());
}

function resolveUrl(rawHref: string, baseUrl: string): string {
  return new URL(rawHref, baseUrl).toString();
}

function pathFromUrl(url: string): string {
  const parsed = new URL(url);

  return `${parsed.pathname}${parsed.search}`;
}

function extractCourseId(url: string): string | undefined {
  return coursePathPattern.exec(pathFromUrl(url))?.[1];
}

function parseTaskPath(url: string): { kind: SubmissionKind; taskId: string } | undefined {
  const match = taskPathPattern.exec(pathFromUrl(url));
  const rawKind = match?.[1];
  const taskId = match?.[2];

  if (rawKind === undefined || taskId === undefined) {
    return undefined;
  }

  if (rawKind === "query") {
    return { kind: "quiz", taskId };
  }

  if (
    rawKind === "survey" ||
    rawKind === "drill" ||
    rawKind === "report" ||
    rawKind === "project"
  ) {
    return { kind: rawKind, taskId };
  }

  return undefined;
}

function kindFromLabel(label: string | undefined): SubmissionKind {
  if (label === undefined) {
    return "unknown";
  }

  if (label.includes("小テスト")) {
    return "quiz";
  }

  if (label.includes("アンケート")) {
    return "survey";
  }

  if (label.includes("ドリル")) {
    return "drill";
  }

  if (label.includes("レポート")) {
    return "report";
  }

  if (label.includes("プロジェクト")) {
    return "project";
  }

  return "unknown";
}

function taskKindSegment(kind: SubmissionKind): string {
  if (kind === "quiz") {
    return "query";
  }

  return kind;
}

function slugifyDateTime(value: string): string {
  return value.replace(/\D+/g, "-").replace(/^-|-$/g, "");
}

function parseCourseSummary(anchor: ElementSelection, baseUrl: string): CourseSummary | undefined {
  const href = anchor.attr("href");

  if (href === undefined) {
    return undefined;
  }

  const url = resolveUrl(href, baseUrl);
  const id = extractCourseId(url);

  if (id === undefined) {
    return undefined;
  }

  return {
    id,
    name: textOf(anchor),
    url,
  };
}

function parseSubmittedAt(dateLabel: string, timeLabel: string): string | undefined {
  const date = optionalText(dateLabel);
  const time = optionalText(timeLabel);

  if (date === undefined || time === undefined) {
    return undefined;
  }

  return `${date} ${time}`;
}

function findSubmissionTable($: CheerioAPI): ElementSelection {
  const table = $("table.edit").first();

  if (table.length > 0) {
    return table;
  }

  return $("a[href*='course_']").first().closest("table");
}

interface ParseSubmissionRowInput {
  baseUrl: string;
  carriedDate: string | undefined;
  row: ElementSelection;
}

function parseSubmissionRow(input: ParseSubmissionRowInput): {
  item?: SubmissionListItemJson;
  nextDate?: string;
} {
  const cells = input.row.find("td");

  if (cells.length < 5) {
    return { nextDate: input.carriedDate };
  }

  const rawDate = optionalText(cells.eq(0).text());
  const nextDate = rawDate ?? input.carriedDate;
  const submittedAt = parseSubmittedAt(nextDate ?? "", cells.eq(1).text());

  if (submittedAt === undefined) {
    return { nextDate };
  }

  const statusLabel = optionalText(cells.eq(2).text());
  const titleCell = cells.eq(3);
  const courseCell = cells.eq(4);
  const titleAnchor = titleCell.find("a[href]").first();
  const href = titleAnchor.attr("href");
  const course = parseCourseSummary(courseCell.find("a[href]").first(), input.baseUrl);

  if (course === undefined) {
    return { nextDate };
  }

  const title =
    optionalText(titleAnchor.text()) ?? optionalText(titleCell.text()) ?? "(private task)";
  let url = input.baseUrl;
  let parsedTask: { kind: SubmissionKind; taskId: string } | undefined = undefined;

  if (href !== undefined) {
    url = resolveUrl(href, input.baseUrl);
    parsedTask = parseTaskPath(url);
  }

  const kind = parsedTask?.kind ?? kindFromLabel(statusLabel);
  const taskId = parsedTask?.taskId ?? "private";
  const id = `${course.id}-${taskKindSegment(kind)}-${taskId}-${slugifyDateTime(submittedAt)}`;

  return {
    item: {
      course,
      id,
      kind,
      statusLabel,
      submittedAt,
      title,
      url,
    },
    nextDate,
  };
}

export async function listSubmissions(): Promise<SubmissionListItemJson[]> {
  const origin = await getManabaOrigin();
  const listUrl = manabaPathToUrl(submissionListPath, origin);
  const html = await fetchManabaText(listUrl);
  const $ = cheerio.load(html);
  const table = findSubmissionTable($);
  const items: SubmissionListItemJson[] = [];
  let currentDate: string | undefined = undefined;

  table.find("tr").each((rowIndex, row) => {
    void rowIndex;
    const result = parseSubmissionRow({
      baseUrl: listUrl,
      carriedDate: currentDate,
      row: $(row),
    });

    currentDate = result.nextDate;

    if (result.item !== undefined) {
      items.push(result.item);
    }
  });

  return items;
}

export async function getSubmissionInfo(id: string): Promise<SubmissionInfoJson> {
  const item = (await listSubmissions()).find((candidate) => candidate.id === id);

  if (item === undefined) {
    throw new Error(`Submission ${id} was not found in the submission log.`);
  }

  return {
    ...item,
    resource: "submission",
  };
}

export async function openSubmission(id: string): Promise<void> {
  const info = await getSubmissionInfo(id);

  await openUrl(info.url);
}
