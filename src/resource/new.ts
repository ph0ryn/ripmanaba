import * as cheerio from "cheerio";

import { fetchManabaText, getManabaOrigin } from "../http.ts";
import { manabaPathToUrl } from "../open.ts";
import { extractCourseId, optionalText, resolveUrl, type ElementSelection } from "./helpers.ts";

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

export async function listNewCourseStatuses(): Promise<NewCourseStatusJson[]> {
  const origin = await getManabaOrigin();
  const homeUrl = manabaPathToUrl(homePath, origin);
  const html = await fetchManabaText(homeUrl);
  const $ = cheerio.load(html);
  const itemsByCourseId = new Map<string, NewCourseStatusJson>();

  $(".courselistweekly-c, tr.courselist-c").each((rootIndex, root) => {
    void rootIndex;
    const item = parseNewCourseStatusItem($, $(root), homeUrl);

    if (item === undefined || itemsByCourseId.has(item.course.id)) {
      return;
    }

    itemsByCourseId.set(item.course.id, item);
  });

  return [...itemsByCourseId.values()];
}
