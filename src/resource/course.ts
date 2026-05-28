import * as cheerio from "cheerio";

import { fetchManabaText, getManabaOrigin } from "../http.ts";
import { manabaPathToUrl, openUrl } from "../open.ts";

import type {
  ContentSummary,
  CourseInfoJson,
  CourseListItemJson,
  CourseNewsSummary,
  TopicSummary,
} from "./types.ts";
import type { CheerioAPI } from "cheerio";

const courseListPath = "/ct/home_course";
const coursePathPattern = /\/ct\/course_([^_/?#]+)/;
const topicPathPattern = /\/ct\/course_[^_]+_topics_([^_/?#]+)_tflat/;
const contentPathPattern = /\/ct\/page_([^_/?#]+)/;
const courseNewsPathPattern = /\/ct\/course_[^_]+_news_([^/?#]+)/;

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

function extractTopicId(url: string): string | undefined {
  return topicPathPattern.exec(pathFromUrl(url))?.[1];
}

function extractContentId(url: string): string | undefined {
  return contentPathPattern.exec(pathFromUrl(url))?.[1];
}

function extractCourseNewsId(url: string): string | undefined {
  return courseNewsPathPattern.exec(pathFromUrl(url))?.[1];
}

function splitInstructors(text: string | undefined): string[] {
  if (text === undefined) {
    return [];
  }

  return text
    .split(/[、,，]/)
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 0);
}

function parseTermSchedule(text: string | undefined): { term?: string; schedule?: string } {
  if (text === undefined) {
    return {};
  }

  const [term, ...scheduleParts] = text.split(/\s+/).filter((part) => part.length > 0);

  return {
    schedule: optionalText(scheduleParts.join(" ")),
    term,
  };
}

function parseCourseListRow(
  $: CheerioAPI,
  row: ElementSelection,
  baseUrl: string,
): CourseListItemJson | undefined {
  const cells = row.find("td");

  if (cells.length < 4) {
    return undefined;
  }

  const courseAnchor = cells
    .eq(0)
    .find("a[href]")
    .toArray()
    .map((anchor) => $(anchor))
    .find((anchor) => {
      const href = anchor.attr("href");

      return href !== undefined && extractCourseId(resolveUrl(href, baseUrl)) !== undefined;
    });

  const href = courseAnchor?.attr("href");

  if (courseAnchor === undefined || href === undefined) {
    return undefined;
  }

  const url = resolveUrl(href, baseUrl);
  const id = extractCourseId(url);

  if (id === undefined) {
    return undefined;
  }

  const termSchedule = parseTermSchedule(optionalText(cells.eq(2).text()));

  return {
    id,
    instructors: splitInstructors(optionalText(cells.eq(3).text())),
    name: textOf(courseAnchor),
    schedule: termSchedule.schedule,
    term: termSchedule.term,
    url,
    year: optionalText(cells.eq(1).text()),
  };
}

export async function listCourses(): Promise<CourseListItemJson[]> {
  const origin = await getManabaOrigin();
  const listUrl = manabaPathToUrl(courseListPath, origin);
  const html = await fetchManabaText(listUrl);
  const $ = cheerio.load(html);
  const items: CourseListItemJson[] = [];

  $("table.stdlist.courselist")
    .first()
    .find("tr")
    .slice(1)
    .each((rowIndex, row) => {
      void rowIndex;
      const item = parseCourseListRow($, $(row), listUrl);

      if (item !== undefined) {
        items.push(item);
      }
    });

  return items;
}

function parseHeaderMeta($: CheerioAPI): {
  courseCode?: string;
  instructors: string[];
  name?: string;
  schedule?: string;
  term?: string;
  year?: string;
} {
  const header = $(".pageheader-course").first();
  const teacherText = textOf(header.find(".pageheader-course-courseteacher"));
  const instructorMatch = /担当教員[:：]\s*(.*?)(?:\s+(\d{4})\s+(.+))?$/.exec(teacherText);
  const termSchedule = parseTermSchedule(instructorMatch?.[3]);

  return {
    courseCode: optionalText(header.find(".coursecode").first().text()),
    instructors: splitInstructors(instructorMatch?.[1]),
    name:
      optionalText(header.find(".pageheader-course-coursename a").first().text()) ??
      optionalText(header.find(".pageheader-course-coursename").first().text()),
    schedule: termSchedule.schedule,
    term: termSchedule.term,
    year: instructorMatch?.[2],
  };
}

function findCardByHeader($: CheerioAPI, headerText: string): ElementSelection {
  const cards = $(".info-list-card").toArray();

  for (const card of cards) {
    const selection = $(card);
    const headings = selection.find("h1,h2,h3,h4,h5,.header,.title,.info-list-title").text();

    if (normalizeText(headings).includes(headerText) || textOf(selection).startsWith(headerText)) {
      return selection;
    }
  }

  return $();
}

function parseSyllabusUrl($: CheerioAPI, baseUrl: string): string | undefined {
  const anchor = $("a[href]")
    .toArray()
    .map((element) => $(element))
    .find((anchor) => textOf(anchor).includes("シラバス"));
  const href = anchor?.attr("href");

  if (href === undefined) {
    return undefined;
  }

  return resolveUrl(href, baseUrl);
}

function parseCourseNews($: CheerioAPI, baseUrl: string): CourseInfoJson["news"] {
  const card = findCardByHeader($, "コースニュース");

  if (card.length === 0 || textOf(card).includes("ニュースはありません")) {
    return {
      empty: true,
      items: [],
    };
  }

  const items: CourseNewsSummary[] = [];

  card.find("a[href]").each((anchorIndex, anchor) => {
    void anchorIndex;
    const selection = $(anchor);
    const href = selection.attr("href");
    const title = optionalText(selection.text());

    if (href === undefined || title === undefined) {
      return;
    }

    const url = resolveUrl(href, baseUrl);
    const id = extractCourseNewsId(url);

    if (id === undefined) {
      return;
    }

    items.push({
      id,
      title,
      url,
    });
  });

  return {
    empty: items.length === 0,
    items,
  };
}

function parseRecentTopics($: CheerioAPI, baseUrl: string): TopicSummary[] {
  const card = findCardByHeader($, "スレッド");
  const topics: TopicSummary[] = [];
  const seenIds = new Set<string>();

  card.find("a[href]").each((anchorIndex, anchor) => {
    void anchorIndex;
    const selection = $(anchor);
    const href = selection.attr("href");
    const title = optionalText(selection.text());

    if (href === undefined || title === undefined) {
      return;
    }

    const url = resolveUrl(href, baseUrl);
    const id = extractTopicId(url);

    if (id === undefined || seenIds.has(id)) {
      return;
    }

    seenIds.add(id);
    topics.push({ id, title, url });
  });

  return topics;
}

function parseRecentContents($: CheerioAPI, baseUrl: string): ContentSummary[] {
  const contents: ContentSummary[] = [];
  const seenIds = new Set<string>();

  $(".top-contents-list a[href], a[href*='page_']").each((anchorIndex, anchor) => {
    void anchorIndex;
    const selection = $(anchor);
    const href = selection.attr("href");
    const title = optionalText(selection.text());

    if (href === undefined || title === undefined) {
      return;
    }

    const url = resolveUrl(href, baseUrl);
    const id = extractContentId(url);

    if (id === undefined || seenIds.has(id)) {
      return;
    }

    seenIds.add(id);
    contents.push({ id, title, url });
  });

  return contents;
}

export async function getCourseInfo(id: string): Promise<CourseInfoJson> {
  const origin = await getManabaOrigin();
  const url = manabaPathToUrl(`course_${id}`, origin);
  const html = await fetchManabaText(url);
  const $ = cheerio.load(html);
  const header = parseHeaderMeta($);

  return {
    courseCode: header.courseCode,
    id,
    instructors: header.instructors,
    name: header.name ?? id,
    news: parseCourseNews($, url),
    recentContents: parseRecentContents($, url),
    recentTopics: parseRecentTopics($, url),
    resource: "course",
    schedule: header.schedule,
    syllabusUrl: parseSyllabusUrl($, url),
    term: header.term,
    url,
    year: header.year,
  };
}

export async function openCourse(id: string): Promise<void> {
  const origin = await getManabaOrigin();

  await openUrl(manabaPathToUrl(`course_${id}`, origin));
}
