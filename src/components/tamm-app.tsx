"use client";
import { LocalePicker, useLocale } from "./locale-provider";
import { TaskCalendar } from "./task-calendar";
import { ReportingPanel } from "./reporting-panel";
import { AdvancedFilters } from "./advanced-filters";
import { matchesFilters, type TaskFilters } from "@/lib/task-filters";
import { TaskTable } from "./task-table";
import { WorkspaceSwitcher } from "./organization-panel";
import { AdminPanel } from "./admin-panel";
import { Inbox } from "./collaboration-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { applyCommand, DomainError, type Command } from "@/lib/commands";
import { createDemo } from "@/lib/demo";
import { can, canEditTask } from "@/lib/permissions";
import { activeTasks, isDone, isOpen } from "@/lib/reports";
import type { Task, Workspace } from "@/lib/types";
import { useMessages, useDates } from "@/components/locale-provider";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  Circle,
  CircleCheck,
  Clock,
  Columns3,
  Download,
  Flag,
  Github,
  Layers,
  LayoutDashboard,
  List,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { ProjectForm, TaskDetail, TaskForm } from "./task-editor";
import {
  Calendar,
  ReportPanel,
  SettingsPanel,
  TeamPanel,
} from "./workspace-panels";
import {
  Avatar,
  download,
  Empty,
  ErrorNotice,
  Heading,
  StatusDot,
} from "./workspace-shared";
type Page =
  | "overview"
  | "myTasks"
  | "projects"
  | "team"
  | "reports"
  | "activity"
  | "settings";
const nav = [
  ["overview", LayoutDashboard],
  ["myTasks", CircleCheck],
  ["projects", Layers],
  ["team", Users],
  ["reports", ChartNoAxesCombined],
  ["activity", Activity],
] as const;
export function TammApp({
  demo = false,
  initialPage = "overview",
}: {
  demo?: boolean;
  initialPage?: Page;
}) {
  const en = useMessages();
  const { today, formatDate } = useDates();

  const { setTimezone } = useLocale();
  const [w, setW] = useState<Workspace | null>(null);
  useEffect(() => {
    setTimezone(w?.settings?.timezone ?? "UTC");
  }, [w?.settings?.timezone, setTimezone]);
  const [page, setPage] = useState<Page>(initialPage);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "list" | "calendar">("board");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [assignee, setAssignee] = useState("");
  const [advanced, setAdvanced] = useState<TaskFilters>({});
  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get("filters");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
          setAdvanced(
            Object.fromEntries(
              Object.entries(parsed).filter(
                ([k, v]) =>
                  ([
                    "team",
                    "department",
                    "creator",
                    "tag",
                    "from",
                    "to",
                  ].includes(k) &&
                    typeof v === "string") ||
                  (["overdue", "dependency"].includes(k) &&
                    typeof v === "boolean"),
              ),
            ),
          );
      }
    } catch {}
  }, []);
  const [filter, setFilter] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [createTask, setCreateTask] = useState(false);
  const [createProject, setCreateProject] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [selected, setSelected] = useState<string[]>([]);
  const operation = useRef(false);
  const workspaceRef = useRef<Workspace | null>(null);
  workspaceRef.current = w;
  useEffect(() => {
    if (demo) {
      setW(createDemo(en));
      setLoaded(true);
      return;
    }
    fetch("/api/workspace")
      .then(async (r) => {
        if (r.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (!r.ok) throw Error();
        const data = await r.json();
        setW(data.workspace);
        setLoaded(true);
      })
      .catch(() => {
        setError(en.common.error);
        setLoaded(true);
      });
  }, [demo]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  async function send(
    command:
      | Command
      | { type: "workspace.create"; name: string }
      | { type: "member.add"; email: string },
  ) {
    if (operation.current) return false;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      if (demo && workspaceRef.current) {
        if (command.type === "member.add") throw new DomainError("email");
        const next = applyCommand(workspaceRef.current, command as Command);
        workspaceRef.current = next;
        setW(next);
      } else {
        const r = await fetch("/api/workspace", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(workspaceRef.current
              ? { "x-workspace-id": workspaceRef.current.id }
              : {}),
          },
          body: JSON.stringify(command),
        });
        const data = await r.json();
        if (!r.ok) throw new DomainError(data.error);
        setW(data.workspace);
      }
      return true;
    } catch (e) {
      setError(
        e instanceof DomainError
          ? (en.errors[e.code as keyof typeof en.errors] ?? en.common.error)
          : en.common.error,
      );
      return false;
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  function navigate(next: Page, id: string | null = null) {
    setPage(next);
    setProjectId(id);
    setSearch("");
    setSelected([]);
    setMobile(false);
  }
  const person = w?.members.find((m) => m.id === w.currentUserId);
  const tasks = useMemo(() => (w ? activeTasks(w) : []), [w]);
  const filtered = tasks.filter(
    (t) =>
      (!projectId || t.projectId === projectId) &&
      (!w || matchesFilters(w, t, advanced, today())) &&
      (page !== "myTasks" ||
        [t.assigneeId, ...(t.assigneeIds ?? [])].includes(
          w?.currentUserId ?? "",
        )) &&
      (!status || t.statusId === status) &&
      (!priority || t.priority === priority) &&
      (!assignee || t.assigneeId === assignee) &&
      (!search ||
        `${t.title} ${t.description} ${t.tags.join(" ")} ${w?.projects.find((p) => p.id === t.projectId)?.name} ${t.number} ${w?.members.find((m) => m.id === t.assigneeId)?.name}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const task = w?.tasks.find((t) => t.id === taskId);
  const project = w?.projects.find((p) => p.id === projectId);
  function exportTasks() {
    if (!w) return;
    const rows = [
      [
        en.tasks.titleLabel,
        en.tasks.project,
        en.tasks.status,
        en.tasks.priority,
        en.tasks.assignee,
        en.tasks.dueDate,
      ],
      ...filtered.map((t) => [
        t.title,
        w.projects.find((p) => p.id === t.projectId)?.name,
        w.statuses.find((s) => s.id === t.statusId)?.name,
        en.priorities[t.priority],
        w.members.find((m) => m.id === t.assigneeId)?.name,
        t.dueDate,
      ]),
    ];
    download(rows, "tamm-tasks.csv");
  }
  if (!loaded)
    return (
      <main className="loading" aria-live="polite">
        {en.common.loading}
      </main>
    );
  if (!w)
    return (
      <main className="onboarding">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Check />
          </span>
          {en.brand.name}
        </Link>
        <h1>{en.auth.workspaceTitle}</h1>
        <p>{en.auth.workspaceSubtitle}</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await send({
              type: "workspace.create",
              name: String(new FormData(e.currentTarget).get("name")),
            });
          }}
        >
          <label>
            {en.auth.workspaceName}
            <input name="name" required maxLength={100} />
          </label>
          <Button disabled={busy}>
            {en.auth.createWorkspace}
            <ArrowRight size={16} />
          </Button>
        </form>
        <ErrorNotice error={error} />
      </main>
    );
  const row = (t: Task) => (
    <button className="task-row" key={t.id} onClick={() => setTaskId(t.id)}>
      <StatusDot w={w} id={t.statusId} />
      <span className="task-row-name">
        {t.title}
        <small>{w.projects.find((p) => p.id === t.projectId)?.name}</small>
      </span>
      <span className={`priority priority-${t.priority}`}>
        <Flag size={12} />
        {en.priorities[t.priority]}
      </span>
      <time
        className={
          t.dueDate && t.dueDate < today() && isOpen(w, t) ? "overdue" : ""
        }
      >
        {formatDate(t.dueDate)}
      </time>
      {t.assigneeId ? (
        <Avatar
          name={w.members.find((m) => m.id === t.assigneeId)?.name ?? ""}
        />
      ) : (
        <span />
      )}
      <ChevronRight size={14} />
    </button>
  );
  const projectCard = (p: Workspace["projects"][number]) => {
    const all = tasks.filter((t) => t.projectId === p.id),
      done = all.filter((t) => isDone(w, t)).length;
    const progress = all.length ? Math.round((done / all.length) * 100) : 0;
    return (
      <button
        className="project-card"
        key={p.id}
        onClick={() => navigate("projects", p.id)}
      >
        <span className="project-monogram" style={{ background: p.color }}>
          <Layers size={20} />
        </span>
        <ArrowUpRight className="card-arrow" size={17} />
        <h3>{p.name}</h3>
        <p>{p.description}</p>
        <div className="project-progress">
          <span>
            {all.length - done} {en.projects.openTasks}
          </span>
          <b>{progress}%</b>
        </div>
        <div className="progress-track">
          <span style={{ width: `${progress}%`, background: p.color }} />
        </div>
        <div className="project-footer">
          <span className="avatar-stack">
            {p.memberIds.slice(0, 3).map((id) => (
              <Avatar
                key={id}
                name={w.members.find((m) => m.id === id)?.name ?? ""}
                size="small"
              />
            ))}
          </span>
          <span>{p.code}</span>
        </div>
      </button>
    );
  };
  const activityList = (events = w.events) =>
    events
      .slice()
      .reverse()
      .slice(0, 40)
      .map((e) => (
        <div className="event" key={e.id}>
          <Avatar
            name={w.members.find((m) => m.id === e.actorId)?.name ?? ""}
            size="small"
          />
          <div>
            <p>
              <strong>{w.members.find((m) => m.id === e.actorId)?.name}</strong>{" "}
              {en.events[e.action as keyof typeof en.events] ?? e.action}
            </p>
            {e.taskId && (
              <button className="text-link" onClick={() => setTaskId(e.taskId)}>
                {w.tasks.find((t) => t.id === e.taskId)?.title}
              </button>
            )}
            {e.text && <p className="muted">{e.text}</p>}
            <time>{formatDate(e.createdAt)}</time>
          </div>
        </div>
      ));
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "is-open" : ""}`}>
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Check size={22} />
          </span>
          {en.brand.name}
          <span className="arabic">{en.brand.arabic}</span>
        </Link>
        <div className="workspace-label">
          <span className="workspace-initial">{w.name[0]}</span>
          <span>
            {w.name}
            <small>{demo ? en.nav.demo : en.nav.live}</small>
          </span>
        </div>
        {!demo && <WorkspaceSwitcher w={w} />}
        <button className="sidebar-search" onClick={() => setCommandOpen(true)}>
          <Search size={15} />
          {en.common.searchShort}
          <kbd>⌘ K</kbd>
        </button>
        {!demo && <Inbox w={w} onTask={setTaskId} />}
        <span className="nav-caption">{en.nav.workspace}</span>
        <nav>
          {nav
            .filter(
              ([key]) =>
                key !== "reports" ||
                can(person!.role, "report.view", person!.permissions),
            )
            .map(([key, Icon]) => (
              <button
                key={key}
                className={page === key && !projectId ? "active" : ""}
                onClick={() => navigate(key)}
              >
                <Icon size={18} />
                {en.nav[key]}
                {key === "myTasks" && (
                  <span className="nav-count">
                    {
                      tasks.filter(
                        (t) => t.assigneeId === person?.id && isOpen(w, t),
                      ).length
                    }
                  </span>
                )}
              </button>
            ))}
        </nav>
        <div className="nav-caption project-caption">
          {en.nav.favorites}
          {can(person!.role, "project.manage", person!.permissions) && (
            <button
              aria-label={en.common.newProject}
              onClick={() => setCreateProject(true)}
            >
              <Plus size={14} />
            </button>
          )}
        </div>
        <nav>
          {w.projects
            .filter((p) => !p.archived && !p.deletedAt)
            .map((p) => (
              <button
                className={projectId === p.id ? "active" : ""}
                key={p.id}
                onClick={() => navigate("projects", p.id)}
              >
                <span className="project-dot" style={{ background: p.color }} />
                {p.name}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <LocalePicker />
          {demo && (
            <div className="demo-note">
              <span>{en.nav.demo}</span>
              <p>{en.nav.demoNote}</p>
              <Link href="/login">
                {en.nav.switch}
                <ArrowUpRight size={14} />
              </Link>
            </div>
          )}
          <nav>
            <button
              className={page === "settings" ? "active" : ""}
              onClick={() => navigate("settings")}
            >
              <Settings size={17} />
              {en.nav.settings}
            </button>
            <a
              href="https://github.com/mahmoude4477/tamm"
              target="_blank"
              rel="noreferrer"
            >
              <Github size={17} />
              {en.nav.help}
            </a>
          </nav>
          <div className="profile">
            <Avatar name={person!.name} />
            <span>
              {person!.name}
              <small>{en.team.roles[person!.role]}</small>
            </span>
            {!demo && (
              <button
                aria-label={en.common.signOut}
                onClick={async () => {
                  await authClient.signOut();
                  window.location.assign("/login");
                }}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="mobile-backdrop"
          aria-label={en.common.close}
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label={en.common.menu}
            onClick={() => setMobile(true)}
          >
            <PanelLeftClose size={18} />
          </button>
          <span>{en.nav.workspace}</span>
          <ChevronRight size={13} />
          <strong>{project?.name ?? en.nav[page]}</strong>
          <div className="topbar-end">
            <span className="today">
              {new Intl.DateTimeFormat("en", {
                weekday: "short",
                month: "short",
                day: "numeric",
              }).format(new Date())}
            </span>
            <button
              className="top-search"
              aria-label={en.common.search}
              onClick={() => setCommandOpen(true)}
            >
              <Search size={18} />
            </button>
            <Avatar name={person!.name} size="small" />
          </div>
        </header>
        <main className="main-content">
          <ErrorNotice error={error} />
          {page === "overview" && (
            <>
              <div className="page-heading overview-heading">
                <div>
                  <span className="eyebrow">{en.overview.eyebrow}</span>
                  <h1>{en.overview.title}</h1>
                  <p>{en.overview.subtitle}</p>
                </div>
                {can(person!.role, "task.create", person!.permissions) && (
                  <Button onClick={() => setCreateTask(true)}>
                    <Plus size={16} />
                    {en.common.newTask}
                  </Button>
                )}
              </div>
              <div className="metrics">
                {[
                  [
                    en.overview.open,
                    tasks.filter((t) => isOpen(w, t)).length,
                    Circle,
                  ],
                  [
                    en.overview.overdue,
                    tasks.filter(
                      (t) => isOpen(w, t) && t.dueDate && t.dueDate < today(),
                    ).length,
                    Clock,
                  ],
                  [
                    en.overview.review,
                    tasks.filter(
                      (t) =>
                        w.statuses.find((s) => s.id === t.statusId)
                          ?.category === "review",
                    ).length,
                    MessageSquare,
                  ],
                  [
                    en.overview.completed,
                    tasks.filter((t) => isDone(w, t)).length,
                    CircleCheck,
                  ],
                ].map(([label, count, Icon], i) => {
                  const I = Icon as typeof Circle;
                  return (
                    <div className={`metric metric-${i}`} key={String(label)}>
                      <span>
                        {String(label)}
                        <I size={17} />
                      </span>
                      <strong>{String(count)}</strong>
                    </div>
                  );
                })}
              </div>
              <section className="section">
                <div className="section-heading">
                  <div>
                    <h2>{en.overview.attention}</h2>
                    <p>{en.overview.attentionNote}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate("myTasks")}
                  >
                    {en.overview.viewAll}
                    <ArrowRight size={14} />
                  </Button>
                </div>
                <div className="task-rows">
                  {tasks
                    .filter((t) => isOpen(w, t))
                    .sort((a, b) =>
                      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
                    )
                    .slice(0, 5)
                    .map(row)}
                  {!tasks.some((t) => isOpen(w, t)) && (
                    <Empty
                      title={en.overview.allClear}
                      note={en.overview.allClearNote}
                    />
                  )}
                </div>
              </section>
              <section className="section">
                <div className="section-heading">
                  <h2>{en.overview.projects}</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate("projects")}
                  >
                    {en.nav.projects}
                    <ArrowRight size={14} />
                  </Button>
                </div>
                <div className="project-grid">
                  {w.projects
                    .filter((p) => !p.archived && !p.deletedAt)
                    .map(projectCard)}
                </div>
              </section>
              <section className="section">
                <div className="section-heading">
                  <h2>{en.overview.activity}</h2>
                </div>
                <div className="activity-list">
                  {activityList(w.events.slice(-3))}
                </div>
              </section>
            </>
          )}
          {page === "projects" && !projectId && (
            <>
              <Heading
                title={en.projects.title}
                subtitle={en.projects.subtitle}
              >
                <Button
                  onClick={() => setCreateProject(true)}
                  disabled={
                    !can(person!.role, "project.manage", person!.permissions)
                  }
                >
                  <Plus size={16} />
                  {en.common.newProject}
                </Button>
              </Heading>
              <div className="project-grid">
                {w.projects
                  .filter((p) => !p.archived && !p.deletedAt)
                  .map(projectCard)}
              </div>
              {!w.projects.length && (
                <Empty
                  title={en.projects.noProjects}
                  note={en.projects.createNote}
                />
              )}
            </>
          )}
          {(page === "myTasks" || projectId) && (
            <>
              <Heading
                title={project?.name ?? en.tasks.myTitle}
                subtitle={project?.description ?? en.tasks.mySubtitle}
              >
                {can(person!.role, "task.create", person!.permissions) && (
                  <Button onClick={() => setCreateTask(true)}>
                    <Plus size={16} />
                    {en.common.newTask}
                  </Button>
                )}
              </Heading>
              <div className="view-toolbar">
                <div className="view-tabs">
                  {(
                    [
                      ["board", Columns3],
                      ["list", List],
                      ["calendar", CalendarDays],
                    ] as const
                  ).map(([name, Icon]) => (
                    <button
                      key={name}
                      className={view === name ? "active" : ""}
                      onClick={() => setView(name)}
                    >
                      <Icon size={15} />
                      {en.tasks[name]}
                    </button>
                  ))}
                </div>
                <div className="toolbar-actions">
                  <div className="inline-search">
                    <Search size={15} />
                    <input
                      aria-label={en.common.search}
                      placeholder={en.common.searchShort}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilter(!filter)}
                  >
                    <SlidersHorizontal size={14} />
                    {en.tasks.filter}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={exportTasks}
                    aria-label={en.common.export}
                  >
                    <Download size={16} />
                  </Button>
                </div>
              </div>
              <AdvancedFilters
                w={w}
                value={advanced}
                onChange={setAdvanced}
                demo={demo}
              />
              {filter && (
                <div className="filters">
                  <select
                    aria-label={en.tasks.status}
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">
                      {en.tasks.status}: {en.common.all}
                    </option>
                    {w.statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={en.tasks.priority}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="">
                      {en.tasks.priority}: {en.common.all}
                    </option>
                    {Object.entries(en.priorities).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={en.tasks.assignee}
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                  >
                    <option value="">
                      {en.tasks.assignee}: {en.common.all}
                    </option>
                    {w.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStatus("");
                      setPriority("");
                      setAssignee("");
                      setSearch("");
                    }}
                  >
                    {en.common.clearFilters}
                  </Button>
                </div>
              )}
              {view === "board" && (
                <div className="board">
                  {w.statuses.map((s) => (
                    <section
                      className="board-column"
                      key={s.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={async (e) => {
                        e.preventDefault();
                        const t = w.tasks.find(
                          (t) => t.id === e.dataTransfer.getData("text/plain"),
                        );
                        if (t)
                          await send({
                            type: "task.update",
                            id: t.id,
                            version: t.version,
                            data: { statusId: s.id },
                          });
                      }}
                    >
                      <div className="column-header">
                        <StatusDot w={w} id={s.id} />
                        <h3>{s.name}</h3>
                        <span>
                          {filtered.filter((t) => t.statusId === s.id).length}
                        </span>
                        <button
                          aria-label={en.common.newTask}
                          onClick={() => setCreateTask(true)}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                      <div className="column-tasks">
                        {filtered
                          .filter((t) => t.statusId === s.id)
                          .map((t) => (
                            <button
                              draggable={canEditTask(w, t)}
                              onDragStart={(e) =>
                                e.dataTransfer.setData("text/plain", t.id)
                              }
                              className="task-card"
                              key={t.id}
                              onClick={() => setTaskId(t.id)}
                            >
                              <div className="card-top">
                                <span>
                                  {
                                    w.projects.find((p) => p.id === t.projectId)
                                      ?.code
                                  }
                                  -{t.number}
                                </span>
                                <MoreHorizontal size={16} />
                              </div>
                              <h4>{t.title}</h4>
                              <div className="task-tags">
                                {t.tags.map((tag) => (
                                  <span key={tag}>{tag}</span>
                                ))}
                              </div>
                              <div className="card-bottom">
                                <span
                                  className={`priority priority-${t.priority}`}
                                >
                                  <Flag size={12} />
                                  {en.priorities[t.priority]}
                                </span>
                                <Avatar
                                  name={
                                    w.members.find((m) => m.id === t.assigneeId)
                                      ?.name ?? en.common.unassigned
                                  }
                                  size="small"
                                />
                              </div>
                              <div className="card-meta">
                                <span
                                  className={
                                    t.dueDate &&
                                    t.dueDate < today() &&
                                    isOpen(w, t)
                                      ? "overdue"
                                      : ""
                                  }
                                >
                                  <CalendarDays size={12} />
                                  {formatDate(t.dueDate)}
                                </span>
                                <span>
                                  <CircleCheck size={12} />
                                  {t.checklist.filter((c) => c.done).length}/
                                  {t.checklist.length}
                                </span>
                              </div>
                            </button>
                          ))}
                        {!filtered.some((t) => t.statusId === s.id) && (
                          <div className="empty-column">
                            {en.tasks.emptyColumn}
                          </div>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              )}
              {view === "list" && (
                <TaskTable
                  w={w}
                  tasks={filtered}
                  onTask={setTaskId}
                  send={send}
                  busy={busy}
                />
              )}
              {view === "calendar" && (
                <TaskCalendar
                  w={w}
                  tasks={filtered}
                  open={setTaskId}
                  openProject={(id) => navigate("projects", id)}
                />
              )}{" "}
              {!filtered.length && view !== "board" && (
                <Empty title={en.common.noResults} note={en.tasks.emptyNote} />
              )}
            </>
          )}
          {page === "team" && <TeamPanel w={w} send={send} busy={busy} />}
          {page === "reports" && (
            <ReportingPanel
              w={w}
              month={month}
              setMonth={setMonth}
              demo={demo}
            />
          )}
          {page === "activity" && (
            <>
              <Heading
                title={en.nav.activity}
                subtitle={en.overview.activity}
              />
              <div className="activity-list">{activityList()}</div>
            </>
          )}
          {page === "settings" && (
            <>
              <SettingsPanel w={w} send={send} busy={busy} demo={demo} />
              <AdminPanel w={w} send={send} busy={busy} demo={demo} />
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>
            {en.brand.name} <span lang="ar">{en.brand.arabic}</span>
          </span>
          <span>{en.brand.tagline}</span>
        </footer>
      </div>
      <Dialog open={createTask} onOpenChange={setCreateTask}>
        <DialogContent>
          <DialogTitle>{en.common.newTask}</DialogTitle>
          <DialogDescription>{en.tasks.emptyNote}</DialogDescription>
          <TaskForm
            key={projectId}
            w={w}
            projectId={projectId}
            busy={busy}
            onSubmit={async (data) => {
              if (await send({ type: "task.create", data }))
                setCreateTask(false);
            }}
          />
          <ErrorNotice error={error} />
        </DialogContent>
      </Dialog>
      <Dialog open={createProject} onOpenChange={setCreateProject}>
        <DialogContent>
          <DialogTitle>{en.common.newProject}</DialogTitle>
          <DialogDescription>{en.projects.createNote}</DialogDescription>
          <ProjectForm
            w={w}
            busy={busy}
            onSubmit={async (data) => {
              if (await send({ type: "project.create", data }))
                setCreateProject(false);
            }}
          />
          <ErrorNotice error={error} />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!task}
        onOpenChange={(open) => {
          if (!open) setTaskId(null);
        }}
      >
        <DialogContent className="task-detail">
          <DialogTitle>{task?.title}</DialogTitle>
          <DialogDescription>
            {task
              ? w.projects.find((p) => p.id === task.projectId)?.code +
                "-" +
                task.number
              : en.tasks.taskDetails}
          </DialogDescription>
          {task && (
            <TaskDetail
              key={task.id + "-" + task.version}
              demo={demo}
              w={w}
              task={task}
              send={send}
              busy={busy}
              activity={activityList(
                w.events.filter(
                  (e) => e.taskId === task.id && e.action !== "task.commented",
                ),
              )}
            />
          )}
          <ErrorNotice error={error} />
        </DialogContent>
      </Dialog>
      <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
        <DialogContent className="command-dialog">
          <DialogTitle>{en.common.search}</DialogTitle>
          <DialogDescription>{en.nav.workspace}</DialogDescription>
          <div className="command-input">
            <Search size={20} />
            <input
              autoFocus
              aria-label={en.common.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={en.common.search}
            />
          </div>
          <div className="command-results">
            {tasks
              .filter((t) =>
                t.title.toLowerCase().includes(search.toLowerCase()),
              )
              .slice(0, 8)
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setCommandOpen(false);
                    setTaskId(t.id);
                  }}
                >
                  <CircleCheck size={16} />
                  {t.title}
                  <ChevronRight size={14} />
                </button>
              ))}
            {w.projects
              .filter((p) =>
                p.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setCommandOpen(false);
                    navigate("projects", p.id);
                  }}
                >
                  <Layers size={16} />
                  {p.name}
                </button>
              ))}
            {w.members
              .filter((m) =>
                `${m.name} ${m.jobTitle ?? ""}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .slice(0, 6)
              .map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setCommandOpen(false);
                    navigate("team");
                  }}
                >
                  <Users size={16} />
                  {m.name}
                  <small>{m.jobTitle}</small>
                </button>
              ))}
            {w.teams
              .filter((t) =>
                t.name.toLowerCase().includes(search.toLowerCase()),
              )
              .slice(0, 6)
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setCommandOpen(false);
                    navigate("myTasks");
                    setPage("projects");
                    setAdvanced({ team: t.id });
                  }}
                >
                  <Users size={16} />
                  {t.name}
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
