"use client";
import { taskLabel } from "@/lib/task-label";
import { statusLabel } from "@/lib/status-label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { FormSelect, SelectOption } from "@/components/ui/form-select";

import { TransferPanel } from "./operations-panel";
import Markdown from "react-markdown";
import { CommentPanel, FilePanel } from "./collaboration-panel";
import { Button } from "@/components/ui/button";
import { type Command } from "@/lib/commands";
import { can, canEditTask } from "@/lib/permissions";
import type { Task, Workspace } from "@/lib/types";
import { useMessages, useDates } from "@/components/locale-provider";
import { ArrowRight, Check, Flag, Plus } from "lucide-react";
import { useState } from "react";

import { StatusDot } from "./workspace-shared";
export type Send = (
  command: Command | { type: "member.add"; email: string },
) => Promise<boolean>;
export type TaskData = Extract<Command, { type: "task.create" }>["data"];
export function TaskForm({
  w,
  task,
  projectId,
  busy,
  onSubmit,
}: {
  w: Workspace;
  task?: Task;
  projectId?: string | null;
  busy: boolean;
  onSubmit: (data: TaskData, reason?: string) => Promise<void>;
}) {
  const en = useMessages();
  const { today, formatDate } = useDates();

  return (
    <form
      className="editor-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await onSubmit(
          {
            title: String(f.get("title")).trim(),
            description: String(f.get("description")),
            projectId: String(f.get("projectId")),
            statusId: String(f.get("statusId")),
            priority: String(f.get("priority")) as Task["priority"],
            assigneeId: String(f.get("assigneeId")) || null,
            dueDate: String(f.get("dueDate")) || null,
            startDate: String(f.get("startDate")) || null,
            estimatedHours: Number(f.get("estimatedHours")),
            parentId: String(f.get("parentId")) || null,
            dependencyIds: f.getAll("dependencies").map(String),
            tags: String(f.get("tags"))
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            checklist: task?.checklist ?? [],
            assigneeIds: f.getAll("assigneeIds").map(String),
            relatedIds: f.getAll("relatedIds").map(String),
            duplicateOfId: String(f.get("duplicateOfId")) || null,
            taskType: String(f.get("taskType")),
            actualHours: Number(f.get("actualHours")),
          },
          String(f.get("reason")),
        );
      }}
    >
      <label>
        {en.tasks.titleLabel}
        <Input
          autoFocus
          name="title"
          required
          maxLength={200}
          defaultValue={task?.title}
          placeholder={en.tasks.titlePlaceholder}
        />
      </label>
      <label>
        {en.tasks.description}
        <Textarea
          name="description"
          rows={4}
          maxLength={20000}
          defaultValue={task?.description}
          placeholder={en.tasks.descriptionPlaceholder}
        />
      </label>
      <div className="form-grid">
        <label>
          {en.tasks.project}
          <FormSelect
            name="projectId"
            required
            defaultValue={
              task?.projectId ??
              projectId ??
              w.projects.find((p) => !p.archived)?.id
            }
          >
            {w.projects
              .filter((p) => !p.archived)
              .map((p) => (
                <SelectOption key={p.id} value={p.id}>
                  {p.name}
                </SelectOption>
              ))}
          </FormSelect>
        </label>
        <label>
          {en.tasks.status}
          <FormSelect
            name="statusId"
            defaultValue={task?.statusId ?? w.statuses[0]?.id}
          >
            {w.statuses
              .filter((s) => s.category !== "done" || task?.statusId === s.id)
              .map((s) => (
                <SelectOption key={s.id} value={s.id}>
                  {statusLabel(s, en)}
                </SelectOption>
              ))}
          </FormSelect>
        </label>
        <label>
          {en.tasks.assignee}
          <FormSelect
            name="assigneeId"
            defaultValue={task?.assigneeId ?? w.currentUserId}
          >
            <SelectOption value="">{en.common.unassigned}</SelectOption>
            {w.members.map((p) => (
              <SelectOption key={p.id} value={p.id}>
                {p.name}
              </SelectOption>
            ))}
          </FormSelect>
        </label>
        <label>
          {en.tasks.priority}
          <FormSelect name="priority" defaultValue={task?.priority ?? "medium"}>
            {Object.entries(en.priorities).map(([v, l]) => (
              <SelectOption key={v} value={v}>
                {l}
              </SelectOption>
            ))}
          </FormSelect>
        </label>
        <label>
          {en.tasks.startDate}
          <Input
            name="startDate"
            type="date"
            defaultValue={task?.startDate ?? ""}
          />
        </label>
        <label>
          {en.tasks.dueDate}
          <Input
            name="dueDate"
            type="date"
            defaultValue={task?.dueDate ?? ""}
          />
        </label>
        <label>
          {en.tasks.estimate}
          <Input
            name="estimatedHours"
            type="number"
            min={0}
            max={10000}
            step={0.25}
            defaultValue={task?.estimatedHours ?? 0}
          />
        </label>
        <label>
          {en.tasks.parent}
          <FormSelect name="parentId" defaultValue={task?.parentId ?? ""}>
            <SelectOption value="">{en.common.none}</SelectOption>
            {w.tasks
              .filter((t) => t.id !== task?.id && !t.deletedAt)
              .map((t) => (
                <SelectOption key={t.id} value={t.id}>
                  {taskLabel(w, t)}
                </SelectOption>
              ))}
          </FormSelect>
        </label>
      </div>
      <label>
        {en.tasks.tags}
        <Input
          name="tags"
          defaultValue={task?.tags.join(", ")}
          placeholder={en.tasks.tagsPlaceholder}
        />
      </label>
      <label>
        {en.tasks.dependencies}
        <FormSelect
          name="dependencies"
          multiple
          defaultValue={task?.dependencyIds ?? []}
        >
          {w.tasks
            .filter((t) => t.id !== task?.id && !t.deletedAt)
            .map((t) => (
              <SelectOption key={t.id} value={t.id}>
                {taskLabel(w, t)}
              </SelectOption>
            ))}
        </FormSelect>
      </label>
      {task && (
        <label>
          {en.tasks.transferReason}
          <Input
            name="reason"
            maxLength={2000}
            placeholder={en.tasks.transferPlaceholder}
          />
        </label>
      )}
      <div className="form-grid">
        <label>
          {en.collaboration.taskType}
          <FormSelect name="taskType" defaultValue={task?.taskType ?? "task"}>
            {(w.settings?.taskTypes ?? ["task", "bug", "request"]).map((t) => (
              <SelectOption key={t} value={t}>
                {en.taskTypes[t as keyof typeof en.taskTypes] ?? t}
              </SelectOption>
            ))}
          </FormSelect>
        </label>
        <label>
          {en.collaboration.actualHours}
          <Input
            type="number"
            name="actualHours"
            min="0"
            max="100000"
            step="0.25"
            defaultValue={task?.actualHours ?? 0}
          />
        </label>
      </div>
      <label>
        {en.collaboration.assignees}
        <FormSelect
          multiple
          name="assigneeIds"
          defaultValue={task?.assigneeIds ?? []}
        >
          {w.members
            .filter((m) => m.active !== false)
            .map((m) => (
              <SelectOption key={m.id} value={m.id}>
                {m.name}
              </SelectOption>
            ))}
        </FormSelect>
      </label>
      <label>
        {en.collaboration.related}
        <FormSelect
          multiple
          name="relatedIds"
          defaultValue={task?.relatedIds ?? []}
        >
          {w.tasks
            .filter((t) => t.id !== task?.id && !t.deletedAt)
            .map((t) => (
              <SelectOption key={t.id} value={t.id}>
                {taskLabel(w, t)}
              </SelectOption>
            ))}
        </FormSelect>
      </label>
      <label>
        {en.collaboration.duplicate}
        <FormSelect
          name="duplicateOfId"
          defaultValue={task?.duplicateOfId ?? ""}
        >
          <SelectOption value="">{en.collaboration.none}</SelectOption>
          {w.tasks
            .filter((t) => t.id !== task?.id && !t.deletedAt)
            .map((t) => (
              <SelectOption key={t.id} value={t.id}>
                {taskLabel(w, t)}
              </SelectOption>
            ))}
        </FormSelect>
      </label>
      <div className="form-footer">
        <Button disabled={busy || !w.projects.some((p) => !p.archived)}>
          {busy ? en.common.loading : task ? en.common.save : en.common.newTask}
          <ArrowRight size={15} />
        </Button>
      </div>
    </form>
  );
}
export function ProjectForm({
  w,
  busy,
  onSubmit,
}: {
  w: Workspace;
  busy: boolean;
  onSubmit: (
    data: Extract<Command, { type: "project.create" }>["data"],
  ) => Promise<void>;
}) {
  const en = useMessages();
  const { today, formatDate } = useDates();

  return (
    <form
      className="editor-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await onSubmit({
          name: String(f.get("name")),
          code: String(f.get("code")).toUpperCase(),
          description: String(f.get("description")),
          color: String(f.get("color")),
          visibility: String(f.get("visibility")) as "organization" | "private",
          memberIds: f.getAll("members").map(String),
        });
      }}
    >
      <label>
        {en.projects.name}
        <Input name="name" required maxLength={200} />
      </label>
      <div className="form-grid">
        <label>
          {en.projects.code}
          <Input
            name="code"
            required
            pattern="[A-Za-z][A-Za-z0-9]{1,7}"
            maxLength={8}
          />
        </label>
        <label>
          {en.projects.color}
          <Input name="color" type="color" defaultValue="#6b8d79" />
        </label>
      </div>
      <label>
        {en.projects.description}
        <Textarea name="description" maxLength={5000} />
      </label>
      <label>
        {en.projects.visibility}
        <FormSelect name="visibility">
          <SelectOption value="organization">
            {en.projects.organization}
          </SelectOption>
          <SelectOption value="private">{en.projects.private}</SelectOption>
        </FormSelect>
      </label>
      <fieldset>
        <legend>{en.projects.members}</legend>
        {w.members.map((m) => (
          <label className="checkbox-label" key={m.id}>
            <Checkbox
              name="members"

              value={m.id}
              defaultChecked={m.id === w.currentUserId}
            />
            {m.name}
          </label>
        ))}
      </fieldset>
      <Button disabled={busy}>{en.common.newProject}</Button>
    </form>
  );
}
export function TaskDetail({
  w,
  task,
  send,
  busy,
  demo = false,
  activity,
}: {
  w: Workspace;
  task: Task;
  send: Send;
  busy: boolean;
  demo?: boolean;
  activity: React.ReactNode;
}) {
  const en = useMessages();
  const { today, formatDate } = useDates();

  const [editing, setEditing] = useState(false);
  const [review, setReview] = useState("");
  const actor = w.members.find((m) => m.id === w.currentUserId)!;
  const editable = canEditTask(w, task);
  return (
    <div className="detail-body">
      {editing ? (
        <TaskForm
          w={w}
          task={task}
          busy={busy}
          onSubmit={async (data, reason) => {
            if (
              await send({
                type: "task.update",
                id: task.id,
                version: task.version,
                data,
                reason,
              })
            )
              setEditing(false);
          }}
        />
      ) : (
        <>
          <div className="task-description markdown">
            <Markdown skipHtml>
              {task.description || en.tasks.descriptionPlaceholder}
            </Markdown>
          </div>
          <dl className="task-properties">
            <dt>{en.tasks.status}</dt>
            <dd>
              <StatusDot w={w} id={task.statusId} />
              {statusLabel(
                w.statuses.find((s) => s.id === task.statusId),
                en,
              )}
            </dd>
            <dt>{en.tasks.priority}</dt>
            <dd>
              <Flag size={14} />
              {en.priorities[task.priority]}
            </dd>
            <dt>{en.tasks.assignee}</dt>
            <dd>
              {w.members.find((m) => m.id === task.assigneeId)?.name ??
                en.common.unassigned}
            </dd>
            <dt>{en.tasks.dueDate}</dt>
            <dd>{formatDate(task.dueDate)}</dd>
            <dt>{en.tasks.estimate}</dt>
            <dd>
              {task.estimatedHours} {en.common.hours}
            </dd>
          </dl>
          {editable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              {en.common.edit}
            </Button>
          )}
          <div className="detail-section">
            <h3>{en.tasks.checklist}</h3>
            {task.checklist.map((item) => (
              <label className="checklist-item" key={item.id}>
                <Checkbox
                  checked={item.done}
                  disabled={busy || !editable}
                  onCheckedChange={async (checked) => {
                    await send({
                      type: "task.update",
                      id: task.id,
                      version: task.version,
                      data: {
                        checklist: task.checklist.map((c) =>
                          c.id === item.id ? { ...c, done: checked } : c,
                        ),
                      },
                    });
                  }}
                />
                <span className={item.done ? "checked" : ""}>{item.text}</span>
              </label>
            ))}
            {editable && (
              <form
                className="inline-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const text = String(new FormData(form).get("text")).trim();
                  if (
                    text &&
                    (await send({
                      type: "task.update",
                      id: task.id,
                      version: task.version,
                      data: {
                        checklist: [
                          ...task.checklist,
                          { id: crypto.randomUUID(), text, done: false },
                        ],
                      },
                    }))
                  )
                    form.reset();
                }}
              >
                <Input
                  name="text"
                  aria-label={en.tasks.checklistPlaceholder}
                  placeholder={en.tasks.checklistPlaceholder}
                  maxLength={200}
                  required
                />
                <Button
                  variant="outline"
                  size="icon"
                  disabled={busy}
                  aria-label={en.common.add}
                >
                  <Plus size={16} />
                </Button>
              </form>
            )}
          </div>
          <div className="detail-section">
            <h3>{en.tasks.subtasks}</h3>
            {w.tasks
              .filter((t) => t.parentId === task.id && !t.deletedAt)
              .map((t) => (
                <p className="status-label" key={t.id}>
                  <StatusDot w={w} id={t.statusId} />
                  {t.title}
                </p>
              ))}
          </div>
          {(editable ||
            (can(actor.role, "task.review", actor.permissions) &&
              w.statuses.find((s) => s.id === task.statusId)?.category ===
                "review")) &&
            w.statuses.find((s) => s.id === task.statusId)?.category !==
              "done" && (
              <div className="review-box">
                {w.statuses.find((s) => s.id === task.statusId)?.category ===
                "review" ? (
                  can(actor.role, "task.review", actor.permissions) && (
                    <>
                      <label>
                        {en.tasks.reviewComment}
                        <Textarea
                          value={review}
                          onChange={(e) => setReview(e.target.value)}
                          placeholder={en.tasks.reviewPlaceholder}
                        />
                      </label>
                      <div className="button-row">
                        <Button
                          disabled={busy}
                          onClick={() =>
                            send({
                              type: "task.review",
                              id: task.id,
                              version: task.version,
                              approve: true,
                              comment: review,
                            })
                          }
                        >
                          <Check size={15} />
                          {en.tasks.approve}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy || !review.trim()}
                          onClick={() =>
                            send({
                              type: "task.review",
                              id: task.id,
                              version: task.version,
                              approve: false,
                              comment: review,
                            })
                          }
                        >
                          {en.tasks.return}
                        </Button>
                      </div>
                    </>
                  )
                ) : (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      const s = w.statuses.find((s) => s.category === "review");
                      if (s)
                        void send({
                          type: "task.update",
                          id: task.id,
                          version: task.version,
                          data: { statusId: s.id },
                        });
                    }}
                  >
                    {en.tasks.submit}
                    <ArrowRight size={15} />
                  </Button>
                )}
              </div>
            )}
        </>
      )}
      <CommentPanel w={w} task={task} send={send} busy={busy} />
      {!demo && w.settings?.transferPolicy === "approval" && (
        <TransferPanel w={w} task={task} />
      )}
      <FilePanel w={w} taskId={task.id} demo={demo} />
      <div className="detail-section">
        <h3>{en.nav.activity}</h3>
        <div className="activity-list">{activity}</div>
      </div>
      {can(actor.role, "task.delete", actor.permissions) && (
        <div className="detail-actions">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              send({
                type: "task.archive",
                id: task.id,
                archived: !task.archived,
              })
            }
          >
            {task.archived ? en.common.restore : en.common.archive}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (window.confirm(en.common.confirmDelete))
                void send({ type: "task.delete", id: task.id });
            }}
          >
            {en.common.delete}
          </Button>
        </div>
      )}
    </div>
  );
}
