import * as cheerio from "cheerio";

import {
  extractCourseId,
  manabaPathToUrl,
  optionalText,
  resolveUrl,
  ResourceParseError,
  type ElementSelection,
} from "./helpers.ts";

import type { ManabaClient } from "../http.ts";
import type { CourseStatusKind, NewCourseStatusJson } from "./types.ts";
import type { CheerioAPI } from "cheerio";

const homePath = "/ct/home";

function courseStatusKindFromIcon(src: string): CourseStatusKind {
  if (src.includes("icon_coursenews")) {
    return "news";
  }

  if (src.includes("icon-coursedeadline")) {
    return "deadline";
  }

  if (src.includes("icon-coursegrad")) {
    return "grade";
  }

  if (src.includes("icon_coursethread")) {
    return "thread";
  }

  if (src.includes("icon_collist_individual")) {
    return "individual";
  }

  return "unknown";
}

function isActiveStatusIcon(src: string | undefined): src is string {
  return src !== undefined && /(?:-|_)on\.png(?:[?#].*)?$/.test(src);
}

function findCourseAnchor(
  $: CheerioAPI,
  root: ElementSelection,
  baseUrl: string,
): ElementSelection | undefined {
  return root
    .find("a[href]")
    .toArray()
    .map((anchor) => $(anchor))
    .find((anchor) => {
      const href = anchor.attr("href");

      return href !== undefined && extractCourseId(resolveUrl(href, baseUrl)) !== undefined;
    });
}

function parseStatusKinds($: CheerioAPI, root: ElementSelection): CourseStatusKind[] {
  const kinds: CourseStatusKind[] = [];
  const seenKinds = new Set<CourseStatusKind>();

  root.find(".coursestatus img, .course-card-status img").each((iconIndex, icon) => {
    void iconIndex;
    const src = $(icon).attr("src");

    if (!isActiveStatusIcon(src)) {
      return;
    }

    const kind = courseStatusKindFromIcon(src);

    if (seenKinds.has(kind)) {
      return;
    }

    seenKinds.add(kind);
    kinds.push(kind);
  });

  return kinds;
}

function parseNewCourseStatusItem(
  $: CheerioAPI,
  root: ElementSelection,
  baseUrl: string,
): NewCourseStatusJson | undefined {
  const kinds = parseStatusKinds($, root);

  if (kinds.length === 0) {
    return undefined;
  }

  const courseAnchor = findCourseAnchor($, root, baseUrl);
  const href = courseAnchor?.attr("href");
  const name = optionalText(courseAnchor?.text());

  if (courseAnchor === undefined || href === undefined || name === undefined) {
    return undefined;
  }

  const url = resolveUrl(href, baseUrl);
  const id = extractCourseId(url);

  if (id === undefined) {
    return undefined;
  }

  return {
    course: {
      id,
      name,
      url,
    },
    kinds,
  };
}

export async function listCourseUpdates(client: ManabaClient): Promise<NewCourseStatusJson[]> {
  const origin = client.origin;
  const homeUrl = manabaPathToUrl(homePath, origin);
  const html = await client.getText(homeUrl);
  const $ = cheerio.load(html);
  const roots = $(".courselistweekly-c, tr.courselist-c");

  if (roots.length === 0 && $("table.stdlist.courselist").length === 0) {
    throw new ResourceParseError("updates", "home course list structure was not found");
  }

  const itemsByCourseId = new Map<string, NewCourseStatusJson>();

  roots.each((rootIndex, root) => {
    void rootIndex;
    const item = parseNewCourseStatusItem($, $(root), homeUrl);

    if (item === undefined) {
      return;
    }

    const existing = itemsByCourseId.get(item.course.id);

    if (existing === undefined) {
      itemsByCourseId.set(item.course.id, item);

      return;
    }

    existing.kinds = [...new Set([...existing.kinds, ...item.kinds])];
  });

  return [...itemsByCourseId.values()];
}
