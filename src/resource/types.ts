export type DateTimeString = string;

export type ManabaUrl = string;

export interface AttachmentInfo {
  name: string;
  url: string;
  uploadedAt?: DateTimeString;
}

export interface CourseSummary {
  id: string;
  name: string;
  url: ManabaUrl;
}

export interface CourseListItemJson extends CourseSummary {
  year?: string;
  term?: string;
  schedule?: string;
  instructors: string[];
  favorite?: boolean;
}

export interface CourseNewsSummary {
  id?: string;
  title: string;
  publishedAt?: DateTimeString;
  url?: ManabaUrl;
}

export interface TopicSummary {
  id: string;
  title: string;
  url: ManabaUrl;
  updatedAt?: DateTimeString;
}

export interface ContentSummary {
  id: string;
  title: string;
  url: ManabaUrl;
  updatedAt?: DateTimeString;
  pageCount?: number;
}

export interface ContentListItemJson extends ContentSummary {
  course: CourseSummary;
}

export interface CourseInfoJson {
  resource: "course";
  id: string;
  url: ManabaUrl;
  courseCode?: string;
  name: string;
  instructors: string[];
  year?: string;
  term?: string;
  schedule?: string;
  syllabusUrl?: string;
  news: {
    items: CourseNewsSummary[];
    empty: boolean;
  };
  recentTopics: TopicSummary[];
  recentContents: ContentSummary[];
}

export type TaskKind = "report" | "quiz" | "survey";

export type TaskStatus = "notStarted" | "open" | "closed" | "submitted" | "unknown";

export interface TaskListItemJson {
  id: string;
  kind: TaskKind;
  title: string;
  url: ManabaUrl;
  course: CourseSummary;
  startsAt?: DateTimeString;
  endsAt?: DateTimeString;
  periodLabel?: string;
}

export interface TaskBaseInfoJson {
  resource: "task";
  id: string;
  kind: TaskKind;
  url: ManabaUrl;
  title: string;
  course: CourseSummary;
  description?: string;
  startsAt?: DateTimeString;
  endsAt?: DateTimeString;
  status: TaskStatus;
  submission: {
    submitted: boolean;
    message?: string;
    submittedAt?: DateTimeString;
  };
  attachments: AttachmentInfo[];
}

export interface ReportTaskInfoJson extends TaskBaseInfoJson {
  kind: "report";
  prompt?: string;
  portfolioSetting?: string;
  resubmissionAllowed?: boolean;
  upload: {
    enabled: boolean;
  };
}

export interface QuizTaskInfoJson extends TaskBaseInfoJson {
  kind: "quiz";
  timeLimitLabel?: string;
  canAnswerAfterTimeLimit?: boolean;
  portfolioSetting?: string;
  gradingResultAndCorrectAnswerDisclosure?: string;
}

export interface SurveyTaskInfoJson extends TaskBaseInfoJson {
  kind: "survey";
  portfolioSetting?: string;
}

export type TaskInfoJson = ReportTaskInfoJson | QuizTaskInfoJson | SurveyTaskInfoJson;

export interface ContentPageInfo {
  id?: string;
  title: string;
  url: ManabaUrl;
  publishedFrom?: DateTimeString;
  publishedUntil?: DateTimeString;
  attachments: AttachmentInfo[];
  updatedAt?: DateTimeString;
  updatedBy?: string;
  versionLabel?: string;
}

export interface ContentPageSummary {
  id?: string;
  title: string;
  url: ManabaUrl;
}

export interface ContentInfoJson {
  resource: "content";
  id: string;
  url: ManabaUrl;
  title: string;
  course: CourseSummary;
  publishedFrom?: DateTimeString;
  publishedUntil?: DateTimeString;
  updatedAt?: DateTimeString;
  currentPage?: ContentPageInfo;
  pages: ContentPageSummary[];
}

export interface NoticeListItemJson {
  id: string;
  title: string;
  url: ManabaUrl;
  publishedAt?: DateTimeString;
}

export interface NoticeInfoJson {
  resource: "notice";
  id: string;
  url: ManabaUrl;
  title: string;
  publishedAt?: DateTimeString;
  bodyText: string;
  updatedAt?: DateTimeString;
}

export type SubmissionKind = "quiz" | "survey" | "drill" | "report" | "project" | "unknown";

export interface SubmissionListItemJson {
  id: string;
  kind: SubmissionKind;
  title: string;
  url: ManabaUrl;
  course: CourseSummary;
  submittedAt: DateTimeString;
  statusLabel?: string;
}

export interface SubmissionInfoJson extends SubmissionListItemJson {
  resource: "submission";
  detailText?: string;
}

export type CourseStatusKind = "news" | "deadline" | "grade" | "thread" | "individual" | "unknown";

export interface NewCourseStatusJson {
  course: CourseSummary;
  kinds: CourseStatusKind[];
}
