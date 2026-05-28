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
