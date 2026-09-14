"use client";
import { Button } from "@/components/ui/button";
import { type Command } from "@/lib/commands";
import { can, canEditTask } from "@/lib/permissions";
import type { Task, Workspace } from "@/lib/types";
import en from "@/messages/en.json";
import { ArrowRight, Check, Flag, Plus } from "lucide-react";
import { useState } from "react";

import { formatDate } from "@/lib/dates";
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
          },
          String(f.get("reason")),
        );
      }}
    >
      <label>
        {en.tasks.titleLabel}
        <input
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
        <textarea
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
          <select
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
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          {en.tasks.status}
          <select
            name="statusId"
            defaultValue={task?.statusId ?? w.statuses[0]?.id}
          >
            {w.statuses
              .filter((s) => s.category !== "done" || task?.statusId === s.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          {en.tasks.assignee}
          <select
            name="assigneeId"
            defaultValue={task?.assigneeId ?? w.currentUserId}
          >
            <option value="">{en.common.unassigned}</option>
            {w.members.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {en.tasks.priority}
          <select name="priority" defaultValue={task?.priority ?? "medium"}>
            {Object.entries(en.priorities).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          {en.tasks.startDate}
          <input
            name="startDate"
            type="date"
            defaultValue={task?.startDate ?? ""}
          />
        </label>
        <label>
          {en.tasks.dueDate}
          <input
            name="dueDate"
            type="date"
            defaultValue={task?.dueDate ?? ""}
          />
        </label>
        <label>
          {en.tasks.estimate}
          <input
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
          <select name="parentId" defaultValue={task?.parentId ?? ""}>
            <option value="">{en.common.none}</option>
            {w.tasks
              .filter((t) => t.id !== task?.id && !t.deletedAt)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
          </select>
        </label>
      </div>
      <label>
        {en.tasks.tags}
        <input
          name="tags"
          defaultValue={task?.tags.join(", ")}
          placeholder={en.tasks.tagsPlaceholder}
        />
      </label>
      <label>
        {en.tasks.dependencies}
        <select
          name="dependencies"
          multiple
          defaultValue={task?.dependencyIds ?? []}
        >
          {w.tasks
            .filter((t) => t.id !== task?.id && !t.deletedAt)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
        </select>
      </label>
      {task && (
        <label>
          {en.tasks.transferReason}
          <input
            name="reason"
            maxLength={2000}
            placeholder={en.tasks.transferPlaceholder}
          />
        </label>
      )}
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
        <input name="name" required maxLength={200} />
      </label>
      <div className="form-grid">
        <label>
          {en.projects.code}
          <input
            name="code"
            required
            pattern="[A-Za-z][A-Za-z0-9]{1,7}"
            maxLength={8}
          />
        </label>
        <label>
          {en.projects.color}
          <input name="color" type="color" defaultValue="#6b8d79" />
        </label>
      </div>
      <label>
        {en.projects.description}
        <textarea name="description" maxLength={5000} />
      </label>
      <label>
        {en.projects.visibility}
        <select name="visibility">
          <option value="organization">{en.projects.organization}</option>
          <option value="private">{en.projects.private}</option>
        </select>
      </label>
      <fieldset>
        <legend>{en.projects.members}</legend>
        {w.members.map((m) => (
          <label className="checkbox-label" key={m.id}>
            <input
              name="members"
              type="checkbox"
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
  activity,
}: {
  w: Workspace;
  task: Task;
  send: Send;
  busy: boolean;
  activity: React.ReactNode;
}) {
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
          <p className="task-description">
            {task.description || en.tasks.descriptionPlaceholder}
          </p>
          <dl className="task-properties">
            <dt>{en.tasks.status}</dt>
            <dd>
              <StatusDot w={w} id={task.statusId} />
              {w.statuses.find((s) => s.id === task.statusId)?.name}
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
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={busy || !editable}
                  onChange={async (e) => {
                    await send({
                      type: "task.update",
                      id: task.id,
                      version: task.version,
                      data: {
                        checklist: task.checklist.map((c) =>
                          c.id === item.id
                            ? { ...c, done: e.target.checked }
                            : c,
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
                <input
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
          {editable &&
            w.statuses.find((s) => s.id === task.statusId)?.category !==
              "done" && (
              <div className="review-box">
                {w.statuses.find((s) => s.id === task.statusId)?.category ===
                "review" ? (
                  can(actor.role, "task.review") && (
                    <>
                      <label>
                        {en.tasks.reviewComment}
                        <textarea
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
      <div className="detail-section">
        <h3>{en.tasks.comments}</h3>
        {editable && (
          <form
            className="editor-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const text = String(new FormData(form).get("comment"));
              if (await send({ type: "task.comment", id: task.id, text }))
                form.reset();
            }}
          >
            <textarea
              aria-label={en.tasks.commentPlaceholder}
              name="comment"
              maxLength={10000}
              required
              placeholder={en.tasks.commentPlaceholder}
            />
            <Button size="sm" variant="outline" disabled={busy}>
              {en.tasks.post}
            </Button>
          </form>
        )}
        <div className="activity-list">{activity}</div>
      </div>
      {can(actor.role, "task.delete") && (
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
