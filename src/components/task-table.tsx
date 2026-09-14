"use client";
import { useMemo, useState } from "react";
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
  tasks,
  onTask,
  send,
  busy,
}: {
  w: Workspace;
  tasks: Task[];
  onTask: (id: string) => void;
  send: Send;
  busy: boolean;
}) {
  const en = useMessages();
  const { today, formatDate } = useDates();

  const [sorting, setSorting] = useState<SortingState>([]),
    [visibility, setVisibility] = useState<VisibilityState>({}),
    [selection, setSelection] = useState({}),
    [field, setField] = useState("statusId");
  const actor = w.members.find((m) => m.id === w.currentUserId)!;
  const columns = useMemo<ColumnDef<Task>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        enableHiding: false,
        size: 50,
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label={en.common.select}
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`${en.common.select} ${row.original.title}`}
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
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
        accessorFn: (t) => w.statuses.find((s) => s.id === t.statusId)?.name,
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
    data: tasks,
    columns,
    state: { sorting, columnVisibility: visibility, rowSelection: selection },
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
      <details className="column-options">
        <summary>{en.views.columns}</summary>
        {table
          .getAllLeafColumns()
          .filter((c) => c.getCanHide())
          .map((c) => (
            <label className="checklist-item" key={c.id}>
              <input
                type="checkbox"
                checked={c.getIsVisible()}
                onChange={c.getToggleVisibilityHandler()}
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
                      aria-label={`${en.views.resize} ${String(h.column.columnDef.header)}`}
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
              /* Tags differ per task; retain their existing values through individual commands. */ for (const row of rows) {
                if (
                  !(await send({
                    type: "task.update",
                    id: row.id,
                    version: row.original.version,
                    data: { tags: [...new Set([...row.original.tags, value])] },
                  }))
                )
                  return;
              }
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
            <select value={field} onChange={(e) => setField(e.target.value)}>
              <option value="statusId">{en.tasks.status}</option>
              <option value="priority">{en.tasks.priority}</option>
              {can(actor.role, "task.assign", actor.permissions) && (
                <option value="assigneeId">{en.tasks.assignee}</option>
              )}
              {can(actor.role, "project.manage", actor.permissions) && (
                <option value="projectId">{en.admin.project}</option>
              )}
              <option value="dueDate">{en.tasks.dueDate}</option>
              <option value="tag">{en.views.tag}</option>
              {can(actor.role, "task.delete", actor.permissions) && (
                <option value="archived">{en.views.archive}</option>
              )}
            </select>
          </label>
          {["statusId", "priority", "assigneeId", "projectId"].includes(
            field,
          ) ? (
            <label>
              {en.views.value}
              <select name="value" key={field}>
                {field === "statusId" ? (
                  w.statuses
                    .filter((s) => s.category !== "done")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))
                ) : field === "priority" ? (
                  Object.entries(en.priorities).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))
                ) : field === "assigneeId" ? (
                  <>
                    <option value="">{en.common.unassigned}</option>
                    {w.members
                      .filter((m) => m.active !== false)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </>
                ) : (
                  w.projects
                    .filter((p) => !p.deletedAt && !p.archived)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))
                )}
              </select>
            </label>
          ) : (
            field !== "archived" && (
              <label>
                {en.views.value}
                <input
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
              <input name="reason" required maxLength={2000} />
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
