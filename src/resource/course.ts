import * as cheerio from "cheerio";

import { fetchManabaText, getManabaOrigin } from "../http.ts";
import { manabaPathToUrl, openUrl } from "../open.ts";
import {
  extractCourseId,
  extractIdFromUrl,
  normalizeText,
  optionalText,
  resolveUrl,
  splitDelimitedText,
  type ElementSelection,
  textOf,
} from "./helpers.ts";

import type {
  ContentSummary,
  CourseInfoJson,
  CourseListItemJson,
  CourseNewsSummary,
  TopicSummary,
} from "./types.ts";
import type { CheerioAPI } from "cheerio";

const courseListPath = "/ct/home_course";
const topicPathPattern = /\/ct\/course_[^_]+_topics_([^_/?#]+)_tflat/;
const contentPathPattern = /\/ct\/page_([^_/?#]+)/;
const courseNewsPathPattern = /\/ct\/course_[^_]+_news_([^/?#]+)/;

type CourseListItemDraft = Partial<CourseListItemJson> &
  Pick<CourseListItemJson, "id" | "name" | "url">;

function extractTopicId(url: string): string | undefined {
  return extractIdFromUrl(url, topicPathPattern);
}

function extractContentId(url: string): string | undefined {
  return extractIdFromUrl(url, contentPathPattern);
}

function extractCourseNewsId(url: string): string | undefined {
  return extractIdFromUrl(url, courseNewsPathPattern);
}

function splitInstructors(text: string | undefined): string[] {
  return splitDelimitedText(text, /[、,，]/);
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

function mergeCourseListItem(
  itemsById: Map<string, CourseListItemDraft>,
  item: CourseListItemDraft | undefined,
): void {
  if (item === undefined) {
    return;
  }

  const current = itemsById.get(item.id);

  itemsById.set(item.id, {
    id: item.id,
    instructors: item.instructors ?? current?.instructors,
    name: item.name,
    schedule: item.schedule ?? current?.schedule,
    term: item.term ?? current?.term,
    url: item.url,
    year: item.year ?? current?.year,
  });
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

function parseCourseCard(
  $: CheerioAPI,
  card: ElementSelection,
  baseUrl: string,
): CourseListItemDraft | undefined {
  const courseAnchor = card
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

  const detailsText = textOf(card);
  const metaMatch = /時限\s+(\d{4})\s+(\S+)\s+(.+?)\s+担当\s+(.+?)(?:\s+シラバス|$)/.exec(
    detailsText,
  );

  return {
    id,
    instructors: splitInstructors(metaMatch?.[4]),
    name: textOf(courseAnchor),
    schedule: optionalText(metaMatch?.[3] ?? ""),
    term: metaMatch?.[2],
    url,
    year: metaMatch?.[1],
  };
}

function parseTimetableCourses(
  $: CheerioAPI,
  table: ElementSelection,
  baseUrl: string,
): CourseListItemDraft[] {
  const rows = table.find("tr");
  const dayLabels = rows
    .first()
    .find("th,td")
    .toArray()
    .map((cell) => textOf($(cell)));
  const items: CourseListItemDraft[] = [];

  rows.slice(1).each((rowIndex, row) => {
    void rowIndex;
    const cells = $(row).find("th,td");
    const period = textOf(cells.first());

    cells.slice(1).each((cellIndex, cell) => {
      const day = dayLabels[cellIndex + 1];
      let schedule: string | undefined = undefined;

      if (day !== undefined && period.length > 0) {
        schedule = `${day}${period}`;
      }

      $(cell)
        .find("a[href]")
        .each((anchorIndex, anchor) => {
          void anchorIndex;
          const selection = $(anchor);
          const href = selection.attr("href");
          const name = optionalText(selection.text());

          if (href === undefined || name === undefined) {
            return;
          }

          const url = resolveUrl(href, baseUrl);
          const id = extractCourseId(url);

          if (id === undefined) {
            return;
          }

          items.push({
            id,
            name,
            schedule,
            url,
          });
        });
    });
  });

  return items;
}

function parseCourseListDocument($: CheerioAPI, baseUrl: string): CourseListItemDraft[] {
  const itemsById = new Map<string, CourseListItemDraft>();

  $("table.stdlist.courselist")
    .find("tr")
    .slice(1)
    .each((rowIndex, row) => {
      void rowIndex;
      mergeCourseListItem(itemsById, parseCourseListRow($, $(row), baseUrl));
    });

  $(".coursecard").each((cardIndex, card) => {
    void cardIndex;
    mergeCourseListItem(itemsById, parseCourseCard($, $(card), baseUrl));
  });

  $("table.stdlist")
    .not(".courselist")
    .each((tableIndex, table) => {
      void tableIndex;

      for (const item of parseTimetableCourses($, $(table), baseUrl)) {
        mergeCourseListItem(itemsById, item);
      }
    });

  return [...itemsById.values()];
}

export async function listCourses(): Promise<CourseListItemJson[]> {
  const origin = await getManabaOrigin();
  const listUrl = manabaPathToUrl(courseListPath, origin);
  const html = await fetchManabaText(listUrl);
  const $ = cheerio.load(html);

  return parseCourseListDocument($, listUrl).map((item) => ({
    id: item.id,
    instructors: item.instructors ?? [],
    name: item.name,
    schedule: item.schedule,
    term: item.term,
    url: item.url,
    year: item.year,
  }));
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
