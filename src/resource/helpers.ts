import type { AttachmentInfo, CourseSummary } from "./types.ts";
import type { CheerioAPI } from "cheerio";

export type ElementSelection = ReturnType<CheerioAPI>;

const coursePathPattern = /\/ct\/course_([^_/?#]+)/;
const dateTimePattern = /\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/;

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function optionalText(text: string | undefined): string | undefined {
  if (text === undefined) {
    return undefined;
  }

  const normalized = normalizeText(text);

  if (normalized.length === 0) {
    return undefined;
  }

  return normalized;
}

export function textOf(element: ElementSelection): string {
  return normalizeText(element.text());
}

export function resolveUrl(rawHref: string, baseUrl: string): string {
  return new URL(rawHref, baseUrl).toString();
}

export function pathFromUrl(url: string): string {
  const parsed = new URL(url);

  return `${parsed.pathname}${parsed.search}`;
}

export function extractIdFromUrl(url: string, pattern: RegExp): string | undefined {
  return pattern.exec(pathFromUrl(url))?.[1];
}

export function extractCourseId(url: string): string | undefined {
  return extractIdFromUrl(url, coursePathPattern);
}

export function parseDateTime(text: string): string | undefined {
  return dateTimePattern.exec(text)?.[0];
}

export function splitDelimitedText(text: string | undefined, delimiter: RegExp): string[] {
  if (text === undefined) {
    return [];
  }

  return text
    .split(delimiter)
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 0);
}

export function parseCourseSummary(
  anchor: ElementSelection,
  baseUrl: string,
): CourseSummary | undefined {
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

export function parseCourseHeaderSummary(
  $: CheerioAPI,
  fallbackCourse: CourseSummary,
  options: { useHeaderNameFallback?: boolean } = {},
): CourseSummary {
  const header = $(".pageheader-course").first();
  const nameAnchor = header.find(".pageheader-course-coursename a").first();
  const summary = parseCourseSummary(nameAnchor, fallbackCourse.url);
  let fallbackName = fallbackCourse.name;

  if (options.useHeaderNameFallback === true) {
    fallbackName =
      optionalText(header.find(".pageheader-course-coursename").text()) ?? fallbackName;
  }

  return (
    summary ?? {
      id: fallbackCourse.id,
      name: fallbackName,
      url: fallbackCourse.url,
    }
  );
}

export interface ParseAttachmentLinksOptions {
  baseUrl: string;
  isAttachmentHref?: (href: string) => boolean;
  parseUploadedAt?: (name: string) => string | undefined;
  source: ElementSelection;
  transformName?: (name: string) => string;
}

export function parseAttachmentLinks(
  $: CheerioAPI,
  options: ParseAttachmentLinksOptions,
): AttachmentInfo[] {
  const attachments: AttachmentInfo[] = [];
  const seenUrls = new Set<string>();

  options.source.find("a[href]").each((anchorIndex, anchor) => {
    void anchorIndex;
    const selection = $(anchor);
    const href = selection.attr("href");
    const rawName = optionalText(selection.text());

    if (href === undefined || rawName === undefined) {
      return;
    }

    if (options.isAttachmentHref !== undefined && !options.isAttachmentHref(href)) {
      return;
    }

    const url = resolveUrl(href, options.baseUrl);

    if (seenUrls.has(url)) {
      return;
    }

    seenUrls.add(url);

    attachments.push({
      name: options.transformName?.(rawName) ?? rawName,
      uploadedAt: options.parseUploadedAt?.(rawName),
      url,
    });
  });

  return attachments;
}
