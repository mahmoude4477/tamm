"use client";
import { readRequest } from "@/lib/read-request";
import { statusLabel } from "@/lib/status-label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { FormSelect, SelectOption } from "@/components/ui/form-select";

import { TransferPanel, TemplatePanel } from "./operations-panel";
import { useEffect, useState } from "react";
import { can, permissionKeys } from "@/lib/permissions";
import type { Workspace, Role, Project } from "@/lib/types";
import type { Send } from "./task-editor";
import { Button } from "./ui/button";
import { InvitationPanel } from "./organization-panel";
import { FilePanel } from "./collaboration-panel";
import { useMessages, useDates, useLocale } from "@/components/locale-provider";
function memberOptions(w: Workspace, emptyLabel: string) {
  return (
    <>
      <SelectOption value="">{emptyLabel}</SelectOption>
      {w.members
        .filter((m) => m.active !== false)
        .map((m) => (
          <SelectOption key={m.id} value={m.id}>
            {m.name}
          </SelectOption>
        ))}
    </>
  );
}
export function AdminPanel({
  w,
  send,
  busy,
  demo,
}: {
  w: Workspace;
  send: Send;
  busy: boolean;
  demo: boolean;
}) {
  const { locale, timezone } = useLocale();

  const en = useMessages();

  const actor = w.members.find((m) => m.id === w.currentUserId)!;
  return (
    <div className="admin-stack">
      {!demo && (
        <>
          <TemplatePanel w={w} />
          <TransferPanel w={w} />
        </>
      )}
      {can(actor.role, "workflow.manage", actor.permissions) && (
        <section>
          <h2>{en.admin.settings}</h2>
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              send({
                type: "settings.update",
                name: String(f.get("name")),
                timezone: String(f.get("timezone")),
                transferPolicy: String(f.get("transferPolicy")) as "team",
                taskTypes: String(f.get("taskTypes"))
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              });
            }}
          >
            <label>
              {en.admin.name}
              <Input name="name" required defaultValue={w.name} />
            </label>
            <div className="form-grid">
              <label>
                {en.admin.timezone}
                <Input
                  name="timezone"
                  required
                  defaultValue={w.settings?.timezone ?? "UTC"}
                  list="timezones"
                />
                <datalist id="timezones">
                  {Intl.supportedValuesOf("timeZone").map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </label>
              <label>
                {en.admin.transferPolicy}
                <FormSelect
                  name="transferPolicy"
                  defaultValue={w.settings?.transferPolicy ?? "team"}
                >
                  {Object.entries(en.admin.policies).map(([v, l]) => (
                    <SelectOption key={v} value={v}>
                      {l}
                    </SelectOption>
                  ))}
                </FormSelect>
              </label>
            </div>
            <label>
              {en.admin.taskTypes}
              <Input
                name="taskTypes"
                required
                defaultValue={(
                  w.settings?.taskTypes ?? ["task", "bug", "request"]
                ).join(", ")}
              />
            </label>
            <Button disabled={busy}>{en.common.save}</Button>
          </form>
        </section>
      )}
      {can(actor.role, "user.manage", actor.permissions) && (
        <>
          <section>
            <h2>{en.team.title}</h2>
            {w.members.map((m) => (
              <details key={m.id}>
                <summary>
                  {m.name} · {m.jobTitle || en.team.roles[m.role]}
                </summary>
                <form
                  className="editor-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    send({
                      type: "member.update",
                      id: m.id,
                      role: String(f.get("role")) as Role,
                      teamId: String(f.get("teamId")) || null,
                      teamIds: f.getAll("teams").map(String),
                      jobTitle: String(f.get("jobTitle")),
                      active: f.has("active"),
                      customRoleId: String(f.get("customRoleId")) || null,
                    });
                  }}
                >
                  <label>
                    {en.account.role}
                    <FormSelect name="role" defaultValue={m.role}>
                      {Object.entries(en.team.roles).map(([v, l]) => (
                        <SelectOption key={v} value={v}>
                          {l}
                        </SelectOption>
                      ))}
                    </FormSelect>
                  </label>
                  <label>
                    {en.admin.customRole}
                    <FormSelect
                      name="customRoleId"
                      defaultValue={m.customRoleId ?? ""}
                    >
                      <SelectOption value="">
                        {en.admin.defaultRole}
                      </SelectOption>
                      {w.customRoles?.map((r) => (
                        <SelectOption key={r.id} value={r.id}>
                          {r.name}
                        </SelectOption>
                      ))}
                    </FormSelect>
                  </label>
                  <label>
                    {en.admin.jobTitle}
                    <Input
                      name="jobTitle"
                      defaultValue={m.jobTitle ?? ""}
                      maxLength={200}
                    />
                  </label>
                  <label>
                    {en.admin.active}
                    <Checkbox
                      name="active"

                      defaultChecked={m.active !== false}
                    />
                  </label>
                  <label>
                    {en.team.team}
                    <FormSelect name="teamId" defaultValue={m.teamId ?? ""}>
                      <SelectOption value="">
                        {en.collaboration.none}
                      </SelectOption>
                      {w.teams.map((t) => (
                        <SelectOption key={t.id} value={t.id}>
                          {t.name}
                        </SelectOption>
                      ))}
                    </FormSelect>
                  </label>
                  <label>
                    {en.admin.teams}
                    <FormSelect
                      name="teams"
                      multiple
                      defaultValue={m.teamIds ?? []}
                    >
                      {w.teams.map((t) => (
                        <SelectOption key={t.id} value={t.id}>
                          {t.name}
                        </SelectOption>
                      ))}
                    </FormSelect>
                  </label>
                  <Button disabled={busy}>{en.common.save}</Button>
                </form>
              </details>
            ))}
          </section>
          <section>
            <h2>{en.admin.teams}</h2>
            {w.teams.map((t) => (
              <details key={t.id}>
                <summary>{t.name}</summary>
                <form
                  className="editor-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    send({
                      type: "team.update",
                      id: t.id,
                      name: String(f.get("name")),
                      departmentId: String(f.get("departmentId")) || null,
                      managerId: String(f.get("managerId")) || null,
                    });
                  }}
                >
                  <label>
                    {en.admin.name}
                    <Input name="name" required defaultValue={t.name} />
                  </label>
                  <label>
                    {en.admin.department}
                    <FormSelect
                      name="departmentId"
                      defaultValue={t.departmentId ?? ""}
                    >
                      <SelectOption value="">
                        {en.collaboration.none}
                      </SelectOption>
                      {w.departments.map((d) => (
                        <SelectOption key={d.id} value={d.id}>
                          {d.name}
                        </SelectOption>
                      ))}
                    </FormSelect>
                  </label>
                  <label>
                    {en.admin.manager}
                    <FormSelect
                      name="managerId"
                      defaultValue={t.managerId ?? ""}
                    >
                      {memberOptions(w, en.collaboration.none)}
                    </FormSelect>
                  </label>
                  <Button disabled={busy}>{en.common.save}</Button>
                </form>
              </details>
            ))}
          </section>
          <section>
            <h2>{en.admin.department}</h2>
            {w.departments.map((d) => (
              <details key={d.id}>
                <summary>{d.name}</summary>
                <form
                  className="editor-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    send({
                      type: "department.update",
                      id: d.id,
                      name: String(f.get("name")),
                      managerId: String(f.get("managerId")) || null,
                    });
                  }}
                >
                  <label>
                    {en.admin.name}
                    <Input name="name" required defaultValue={d.name} />
                  </label>
                  <label>
                    {en.admin.manager}
                    <FormSelect
                      name="managerId"
                      defaultValue={d.managerId ?? ""}
                    >
                      {memberOptions(w, en.collaboration.none)}
                    </FormSelect>
                  </label>
                  <Button disabled={busy}>{en.common.save}</Button>
                </form>
              </details>
            ))}
          </section>
          <section>
            <h2>{en.admin.roles}</h2>
            {[
              ...(w.customRoles ?? []),
              { id: "", name: "", permissions: [] },
            ].map((r) => (
              <form
                key={r.id}
                className="editor-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  send({
                    type: "role.save",
                    id: r.id || undefined,
                    name: String(f.get("name")),
                    permissions: f.getAll(
                      "permissions",
                    ) as (typeof permissionKeys)[number][],
                  });
                }}
              >
                <label>
                  {en.admin.name}
                  <Input
                    name="name"
                    required
                    defaultValue={r.name}
                    maxLength={200}
                  />
                </label>
                <fieldset>
                  <legend>{en.admin.permissions}</legend>
                  {permissionKeys.map((p) => (
                    <label className="checklist-item" key={p}>
                      <Checkbox
                        name="permissions"

                        value={p}
                        defaultChecked={r.permissions.includes(p)}
                      />
                      {en.permissions[p]}
                    </label>
                  ))}
                </fieldset>
                <Button disabled={busy}>{en.common.save}</Button>
              </form>
            ))}
          </section>
          {!demo && ["owner", "admin"].includes(actor.role) && (
            <InvitationPanel w={w} />
          )}{" "}
          {!demo && <AuditPanel w={w} />}
        </>
      )}
      {can(actor.role, "workflow.manage", actor.permissions) && (
        <section>
          <h2>{en.settings.workflow}</h2>
          {w.statuses.map((s, index) => (
            <details key={s.id}>
              <summary>{statusLabel(s, en)}</summary>
              <form
                className="editor-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  send({
                    type: "workflow.update",
                    id: s.id,
                    name: String(f.get("name")),
                    color: String(f.get("color")),
                    category: String(f.get("category")) as typeof s.category,
                    allowedNextIds: f.getAll("next").map(String),
                  });
                }}
              >
                <label>
                  {en.admin.name}
                  <Input name="name" required defaultValue={s.name} />
                </label>
                <label>
                  {en.projects.color}
                  <Input name="color" type="color" defaultValue={s.color} />
                </label>
                <label>
                  {en.settings.category}
                  <FormSelect name="category" defaultValue={s.category}>
                    {Object.entries(en.settings.categories).map(([v, l]) => (
                      <SelectOption key={v} value={v}>
                        {l}
                      </SelectOption>
                    ))}
                  </FormSelect>
                </label>
                <label>
                  {en.admin.nextStatuses}
                  <FormSelect
                    multiple
                    name="next"
                    defaultValue={s.allowedNextIds ?? []}
                  >
                    {w.statuses
                      .filter((t) => t.id !== s.id)
                      .map((t) => (
                        <SelectOption key={t.id} value={t.id}>
                          {statusLabel(t, en)}
                        </SelectOption>
                      ))}
                  </FormSelect>
                </label>
                <small>{en.admin.anyTransition}</small>
                <Button disabled={busy}>{en.common.save}</Button>
              </form>
              <div className="detail-actions">
                {[-1, 1].map((delta) => (
                  <Button
                    key={delta}
                    size="sm"
                    variant="outline"
                    disabled={
                      busy ||
                      index + delta < 0 ||
                      index + delta >= w.statuses.length
                    }
                    onClick={() => {
                      const ids = w.statuses.map((t) => t.id);
                      [ids[index], ids[index + delta]] = [
                        ids[index + delta],
                        ids[index],
                      ];
                      send({ type: "workflow.reorder", ids });
                    }}
                  >
                    {delta < 0 ? en.admin.up : en.admin.down}
                  </Button>
                ))}
              </div>
            </details>
          ))}
        </section>
      )}
      {can(actor.role, "project.manage", actor.permissions) && (
        <section>
          <h2>{en.admin.projects}</h2>
          {w.projects.map((p) => (
            <ProjectSettings
              key={p.id}
              w={w}
              p={p}
              send={send}
              busy={busy}
              demo={demo}
            />
          ))}
        </section>
      )}
    </div>
  );
}
function ProjectSettings({
  w,
  p,
  send,
  busy,
  demo,
}: {
  w: Workspace;
  p: Project;
  send: Send;
  busy: boolean;
  demo: boolean;
}) {
  const { locale, timezone } = useLocale();

  const en = useMessages();

  return (
    <details>
      <summary>
        {p.name}
        {p.deletedAt
          ? ` · ${en.settings.trash}`
          : p.archived
            ? ` · ${en.admin.archived}`
            : ""}
      </summary>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          send({
            type: "project.update",
            id: p.id,
            data: {
              name: String(f.get("name")),
              description: String(f.get("description")),
              color: String(f.get("color")),
              visibility: String(f.get("visibility")) as Project["visibility"],
              memberIds: f.getAll("members").map(String),
              ownerId: String(f.get("owner")) || null,
              managerId: String(f.get("manager")) || null,
              startDate: String(f.get("start")) || null,
              endDate: String(f.get("end")) || null,
              priority: String(f.get("priority")) as "medium",
              lifecycle: String(f.get("lifecycle")) as "active",
            },
          });
        }}
      >
        <label>
          {en.admin.name}
          <Input name="name" required defaultValue={p.name} />
        </label>
        <label>
          {en.tasks.description}
          <Textarea
            name="description"
            maxLength={5000}
            defaultValue={p.description}
          />
        </label>
        <div className="form-grid">
          <label>
            {en.projects.color}
            <Input type="color" name="color" defaultValue={p.color} />
          </label>
          <label>
            {en.tasks.priority}
            <FormSelect name="priority" defaultValue={p.priority ?? "medium"}>
              {Object.entries(en.priorities).map(([v, l]) => (
                <SelectOption key={v} value={v}>
                  {l}
                </SelectOption>
              ))}
            </FormSelect>
          </label>
          <label>
            {en.admin.owner}
            <FormSelect name="owner" defaultValue={p.ownerId ?? ""}>
              {memberOptions(w, en.collaboration.none)}
            </FormSelect>
          </label>
          <label>
            {en.admin.manager}
            <FormSelect name="manager" defaultValue={p.managerId ?? ""}>
              {memberOptions(w, en.collaboration.none)}
            </FormSelect>
          </label>
          <label>
            {en.admin.start}
            <Input type="date" name="start" defaultValue={p.startDate ?? ""} />
          </label>
          <label>
            {en.admin.end}
            <Input type="date" name="end" defaultValue={p.endDate ?? ""} />
          </label>
        </div>
        <label>
          {en.admin.lifecycle}
          <FormSelect name="lifecycle" defaultValue={p.lifecycle ?? "planned"}>
            {Object.entries(en.admin.lifecycles).map(([v, l]) => (
              <SelectOption key={v} value={v}>
                {l}
              </SelectOption>
            ))}
          </FormSelect>
        </label>
        <label>
          {en.projects.visibility}
          <FormSelect name="visibility" defaultValue={p.visibility}>
            <SelectOption value="organization">
              {en.projects.organization}
            </SelectOption>
            <SelectOption value="private">{en.projects.private}</SelectOption>
          </FormSelect>
        </label>
        <label>
          {en.projects.members}
          <FormSelect multiple name="members" defaultValue={p.memberIds}>
            {w.members
              .filter((m) => m.active !== false)
              .map((m) => (
                <SelectOption key={m.id} value={m.id}>
                  {m.name}
                </SelectOption>
              ))}
          </FormSelect>
        </label>
        <Button disabled={busy}>{en.common.save}</Button>
      </form>
      <div className="detail-actions">
        <Button
          disabled={busy}
          variant="outline"
          onClick={() =>
            send({ type: "project.archive", id: p.id, archived: !p.archived })
          }
        >
          {p.archived ? en.common.restore : en.common.archive}
        </Button>
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => {
            if (p.deletedAt || window.confirm(en.common.confirmDelete))
              send({
                type: "project.delete",
                id: p.id,
                restore: !p.deletedAt ? false : true,
              });
          }}
        >
          {p.deletedAt ? en.admin.restore : en.admin.delete}
        </Button>
      </div>
      <section className="detail-section">
        <h3>{en.nav.activity}</h3>
        {w.events
          .filter(
            (e) =>
              e.projectId === p.id ||
              w.tasks.some((t) => t.id === e.taskId && t.projectId === p.id),
          )
          .slice()
          .reverse()
          .slice(0, 30)
          .map((e) => (
            <p key={e.id}>
              {w.members.find((m) => m.id === e.actorId)?.name} ·{" "}
              {en.events[e.action as keyof typeof en.events] ?? e.action} ·{" "}
              {new Date(e.createdAt).toLocaleString(locale, {
                timeZone: timezone,
              })}
            </p>
          ))}
      </section>
      {!p.deletedAt && <FilePanel w={w} projectId={p.id} demo={demo} />}
    </details>
  );
}
function AuditPanel({ w }: { w: Workspace }) {
  const { locale, timezone } = useLocale();

  const en = useMessages();

  const [items, setItems] = useState<
      {
        id: string;
        action: string;
        actorId: string;
        createdAt: string;
        detail: unknown;
      }[]
    >([]),
    [next, setNext] = useState<string | null>(null),
    [action, setAction] = useState(""),
    [actor, setActor] = useState(""),
    [error, setError] = useState("");
  async function load(more = false) {
    try {
      const q = new URLSearchParams({
        workspaceId: w.id,
        action,
        actorId: actor,
        ...(more && next ? { before: next } : {}),
      });
      const r = await readRequest(`/api/audit?${q}`);
      if (!r.ok) throw Error();
      const data = await r.json();
      setItems(more ? [...items, ...data.items] : data.items);
      setNext(data.next);
      setError("");
    } catch {
      setError(en.common.error);
    }
  }
  useEffect(() => {
    load();
  }, [w.id, action, actor]);
  return (
    <section>
      <h2>{en.admin.audit}</h2>
      <div className="form-grid">
        <label>
          {en.admin.action}
          <Input value={action} onChange={(e) => setAction(e.target.value)} />
        </label>
        <label>
          {en.admin.actor}
          <FormSelect value={actor} onValueChange={(value) => setActor(value)}>
            <SelectOption value="">{en.admin.all}</SelectOption>
            {w.members.map((m) => (
              <SelectOption key={m.id} value={m.id}>
                {m.name}
              </SelectOption>
            ))}
          </FormSelect>
        </label>
      </div>
      {items.map((i) => (
        <details key={i.id}>
          <summary>
            {i.action} · {w.members.find((m) => m.id === i.actorId)?.name} ·{" "}
            {new Date(i.createdAt).toLocaleString(locale, {
              timeZone: timezone,
            })}
          </summary>
          <pre>{JSON.stringify(i.detail, null, 2)}</pre>
        </details>
      ))}
      {next && <Button onClick={() => load(true)}>{en.admin.loadMore}</Button>}
      <p role="alert">{error}</p>
    </section>
  );
}
