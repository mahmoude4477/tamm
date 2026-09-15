"use client";
import { readRequest } from "@/lib/read-request";
import { statusLabel } from "@/lib/status-label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { FormSelect, SelectOption } from "@/components/ui/form-select";

import { useMemo, useState, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import type { Workspace, Task } from "@/lib/types";
import type { Send } from "./task-editor";
import { can } from "@/lib/permissions";
import { Button } from "./ui/button";

import { useMessages, useDates } from "@/components/locale-provider";
export function TaskTable({
  w,
  dataRevision = 0,
  tasks,
  onTask,
  send,
  busy,
  demo = true,
  query = {},
}: {
  w: Workspace;
  dataRevision?: number;
  tasks: Task[];
  onTask: (id: string) => void;
  send: Send;
  busy: boolean;
  demo?: boolean;
  query?: Record<string, string | boolean | undefined>;
}) {
  const en = useMessages();
  const { today, formatDate } = useDates();

  const [sorting, setSorting] = useState<SortingState>([]),
    [visibility, setVisibility] = useState<VisibilityState>({}),
    [selection, setSelection] = useState({}),
    [field, setField] = useState("statusId");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [serverData, setServerData] = useState<{
    items: Task[];
    total: number;
  }>({ items: [], total: 0 });
  const [loadError, setLoadError] = useState("");
  const queryKey = JSON.stringify(query);
  useEffect(
    () =>
      setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 })),
    [queryKey],
  );
  useEffect(() => {
    if (demo) return;
    const abort = new AbortController();
    const params = new URLSearchParams({
      workspaceId: w.id,
      page: String(pagination.pageIndex),
      size: String(pagination.pageSize),
      sort: sorting[0]?.id ?? "title",
      desc: String(sorting[0]?.desc ?? false),
      ...Object.fromEntries(
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => [k, String(v)]),
      ),
    });
    setLoadError("");
    readRequest(`/api/tasks?${params}`, { signal: abort.signal })
      .then(async (r) => {
        if (!r.ok) throw Error();
        setServerData(await r.json());
      })
      .catch((e) => {
        if (e.name !== "AbortError") setLoadError(en.common.error);
      });
    return () => abort.abort();
  }, [
    demo,
    w.id,
    dataRevision,
    queryKey,
    pagination,
    sorting,
    en.common.error,
  ]);
  const actor = w.members.find((m) => m.id === w.currentUserId)!;
  const columns = useMemo<ColumnDef<Task>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        enableHiding: false,
        size: 50,
        header: ({ table }) => (
          <Checkbox
            aria-label={en.common.select}
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(checked) =>
              table.toggleAllPageRowsSelected(checked)
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`${en.common.select} ${row.original.title}`}
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(checked)}
          />
        ),
      },
      {
        accessorKey: "title",
        header: en.tasks.titleLabel,
        size: 320,
        enableHiding: false,
        cell: ({ row }) => (
          <button className="table-task" onClick={() => onTask(row.id)}>
            <small>
              {w.projects.find((p) => p.id === row.original.projectId)?.code}-
              {row.original.number}
            </small>
            {row.original.title}
          </button>
        ),
      },
      {
        id: "status",
        accessorFn: (t) =>
          statusLabel(
            w.statuses.find((s) => s.id === t.statusId),
            en,
          ),
        header: en.tasks.status,
      },
      {
        accessorKey: "priority",
        header: en.tasks.priority,
        cell: ({ row }) => en.priorities[row.original.priority],
      },
      {
        id: "assignee",
        accessorFn: (t) =>
          w.members.find((m) => m.id === t.assigneeId)?.name ??
          en.common.unassigned,
        header: en.tasks.assignee,
      },
      {
        accessorKey: "dueDate",
        header: en.tasks.dueDate,
        cell: ({ row }) => formatDate(row.original.dueDate),
      },
      {
        id: "project",
        accessorFn: (t) => w.projects.find((p) => p.id === t.projectId)?.name,
        header: en.admin.project,
      },
      { accessorKey: "estimatedHours", header: en.tasks.estimate },
      { accessorKey: "actualHours", header: en.collaboration.actualHours },
    ],
    [w, onTask],
  );
  const table = useReactTable({
    data: demo ? tasks : serverData.items,
    columns,
    state: {
      pagination,
      sorting,
      columnVisibility: visibility,
      rowSelection: selection,
    },
    onPaginationChange: setPagination,
    manualPagination: !demo,
    manualSorting: !demo,
    rowCount: demo ? undefined : serverData.total,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    onRowSelectionChange: setSelection,
    getRowId: (t) => t.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    columnResizeMode: "onChange",
    initialState: { pagination: { pageSize: 25 } },
  });
  return (
    <>
      <p role="alert">{loadError}</p>
      <details className="column-options">
        <summary>{en.views.columns}</summary>
        {table
          .getAllLeafColumns()
          .filter((c) => c.getCanHide())
          .map((c) => (
            <label className="checklist-item" key={c.id}>
              <Checkbox
                checked={c.getIsVisible()}
                onCheckedChange={(checked) => c.toggleVisibility(checked)}
              />
              {String(c.columnDef.header)}
            </label>
          ))}
      </details>
      <div className="table-wrap">
        <table style={{ width: table.getTotalSize(), tableLayout: "fixed" }}>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((h) => (
                  <th
                    key={h.id}
                    style={{ width: h.getSize(), position: "relative" }}
                    aria-sort={
                      h.column.getIsSorted() === "asc"
                        ? "ascending"
                        : h.column.getIsSorted() === "desc"
                          ? "descending"
                          : "none"
                    }
                  >
                    {h.column.getCanSort() ? (
                      <button onClick={h.column.getToggleSortingHandler()}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {h.column.getIsSorted() === "asc"
                          ? " ↑"
                          : h.column.getIsSorted() === "desc"
                            ? " ↓"
                            : ""}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                    <div
                      role="separator"
                      aria-label={`${en.views.resize} ${typeof h.column.columnDef.header === "string" ? h.column.columnDef.header : en.common.select}`}
                      aria-orientation="vertical"
                      tabIndex={0}
                      className="column-resize"
                      onMouseDown={h.getResizeHandler()}
                      onTouchStart={h.getResizeHandler()}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                          e.preventDefault();
                          table.setColumnSizing((s) => ({
                            ...s,
                            [h.column.id]: Math.max(
                              60,
                              h.getSize() + (e.key === "ArrowRight" ? 16 : -16),
                            ),
                          }));
                        }
                      }}
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="detail-actions">
        <Button
          variant="outline"
          size="sm"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
        >
          {en.views.previous}
        </Button>
        <span>
          {en.views.page} {table.getState().pagination.pageIndex + 1} /{" "}
          {Math.max(1, table.getPageCount())}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
        >
          {en.views.next}
        </Button>
      </div>
      {table.getSelectedRowModel().rows.length > 0 && (
        <form
          className="bulk-bar"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const value = String(f.get("value")),
              rows = table.getSelectedRowModel().rows;
            const data: Record<string, unknown> = {};
            if (field === "tag") {
              if (
                !(await send({
                  type: "task.bulk",
                  items: rows.map((r) => ({
                    id: r.id,
                    version: r.original.version,
                  })),
                  data: {},
                  addTag: value,
                }))
              )
                return;
            } else {
              if (field !== "archived")
                data[field] =
                  field === "dueDate" || field === "assigneeId"
                    ? value || null
                    : value;
              if (
                !(await send({
                  type: "task.bulk",
                  items: rows.map((r) => ({
                    id: r.id,
                    version: r.original.version,
                  })),
                  data,
                  reason: String(f.get("reason")),
                  archived: field === "archived" ? true : undefined,
                }))
              )
                return;
            }
            setSelection({});
          }}
        >
          <b>
            {table.getSelectedRowModel().rows.length} {en.tasks.selected}
          </b>
          <label>
            {en.views.field}
            <FormSelect
              value={field}
              onValueChange={(value) => setField(value)}
            >
              <SelectOption value="statusId">{en.tasks.status}</SelectOption>
              <SelectOption value="priority">{en.tasks.priority}</SelectOption>
              {can(actor.role, "task.assign", actor.permissions) && (
                <SelectOption value="assigneeId">
                  {en.tasks.assignee}
                </SelectOption>
              )}
              {can(actor.role, "project.manage", actor.permissions) && (
                <SelectOption value="projectId">
                  {en.admin.project}
                </SelectOption>
              )}
              <SelectOption value="dueDate">{en.tasks.dueDate}</SelectOption>
              <SelectOption value="tag">{en.views.tag}</SelectOption>
              {can(actor.role, "task.delete", actor.permissions) && (
                <SelectOption value="archived">{en.views.archive}</SelectOption>
              )}
            </FormSelect>
          </label>
          {["statusId", "priority", "assigneeId", "projectId"].includes(
            field,
          ) ? (
            <label>
              {en.views.value}
              <FormSelect name="value" key={field}>
                {field === "statusId" ? (
                  w.statuses
                    .filter((s) => s.category !== "done")
                    .map((s) => (
                      <SelectOption key={s.id} value={s.id}>
                        {statusLabel(s, en)}
                      </SelectOption>
                    ))
                ) : field === "priority" ? (
                  Object.entries(en.priorities).map(([v, l]) => (
                    <SelectOption key={v} value={v}>
                      {l}
                    </SelectOption>
                  ))
                ) : field === "assigneeId" ? (
                  <>
                    <SelectOption value="">{en.common.unassigned}</SelectOption>
                    {w.members
                      .filter((m) => m.active !== false)
                      .map((m) => (
                        <SelectOption key={m.id} value={m.id}>
                          {m.name}
                        </SelectOption>
                      ))}
                  </>
                ) : (
                  w.projects
                    .filter((p) => !p.deletedAt && !p.archived)
                    .map((p) => (
                      <SelectOption key={p.id} value={p.id}>
                        {p.name}
                      </SelectOption>
                    ))
                )}
              </FormSelect>
            </label>
          ) : (
            field !== "archived" && (
              <label>
                {en.views.value}
                <Input
                  key={field}
                  name="value"
                  type={field === "dueDate" ? "date" : "text"}
                  required={field === "tag"}
                  maxLength={40}
                />
              </label>
            )
          )}
          {field === "assigneeId" && (
            <label>
              {en.views.reason}
              <Input name="reason" required maxLength={2000} />
            </label>
          )}
          <Button
            disabled={busy || table.getSelectedRowModel().rows.length > 100}
          >
            {en.views.apply}
          </Button>
        </form>
      )}
    </>
  );
}
