export type ProjectAnalytics = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  total: number;
  completed: number;
  open: number;
  overdue: number;
  blocked: number;
  periodCompleted: number;
  onTime: number;
  datedCompleted: number;
  medianDays: number | null;
  p85Days: number | null;
  lateMilestones: number;
  progress: number;
  health: "onTrack" | "atRisk" | "delayed";
  forecastWeeks: number | null;
};
export type Analytics = {
  from: string;
  to: string;
  projects: ProjectAnalytics[];
  weekly: { week: string; completed: number }[];
  aging: { bucket: string; count: number }[];
};
export function projectHealth(
  p: {
    open: number;
    overdue: number;
    blocked: number;
    lateMilestones: number;
    endDate: string | null;
    startDate: string | null;
    total: number;
    completed: number;
  },
  date: string,
): ProjectAnalytics["health"] {
  if (!p.open) return "onTrack";
  if ((p.endDate && p.endDate < date) || p.lateMilestones) return "delayed";
  if (p.overdue || p.blocked) return "atRisk";
  if (
    p.startDate &&
    p.endDate &&
    p.endDate > p.startDate &&
    date > p.startDate
  ) {
    const elapsed =
      (Date.parse(date) - Date.parse(p.startDate)) /
      (Date.parse(p.endDate) - Date.parse(p.startDate));
    if (p.total && p.completed / p.total + 0.2 < elapsed) return "atRisk";
  }
  return "onTrack";
}
