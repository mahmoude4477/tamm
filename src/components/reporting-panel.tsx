"use client";
import { statusLabel } from "@/lib/status-label";
import { Input } from "@/components/ui/input";
import { FormSelect, SelectOption } from "@/components/ui/form-select";

import { useState } from "react";
import type { Workspace } from "@/lib/types";
import { matchesFilters, type TaskFilters } from "@/lib/task-filters";
import { monthlyReport, isOpen, activeTasks } from "@/lib/reports";

import { AdvancedFilters } from "./advanced-filters";
import { Heading, download } from "./workspace-shared";
import { Button } from "./ui/button";
import { useMessages, useDates, useLocale } from "@/components/locale-provider";
function saveBlob(data: Blob, name: string) {
  const url = URL.createObjectURL(data),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ReportingPanel({
  w,
  month,
  setMonth,
  demo,
}: {
  w: Workspace;
  month: string;
  setMonth: (v: string) => void;
  demo: boolean;
}) {
  const en = useMessages();
  const { locale } = useLocale();
  const { today, formatDate } = useDates();

  const [filters, setFilters] = useState<TaskFilters>({}),
    [project, setProject] = useState(""),
    [assignee, setAssignee] = useState(""),
    [status, setStatus] = useState(""),
    [priority, setPriority] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const scoped = {
    ...w,
    tasks: w.tasks.filter(
      (t) =>
        (!project || t.projectId === project) &&
        (!assignee ||
          [t.assigneeId, ...(t.assigneeIds ?? [])].includes(assignee)) &&
        (!status || t.statusId === status) &&
        (!priority || t.priority === priority) &&
        matchesFilters(w, t, filters, today()),
    ),
  };
  const report = monthlyReport(scoped, month),
    previousDate = new Date(`${month}-01T12:00:00Z`);
  previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
  const previousMonth = previousDate.toISOString().slice(0, 7),
    previous = monthlyReport(scoped, previousMonth);
  const ids = new Set(scoped.tasks.map((t) => t.id));
  const events = w.events.filter(
    (e) => e.taskId && ids.has(e.taskId) && e.createdAt.startsWith(month),
  );
  const headers = [
    en.team.name,
    en.reports.completedColumn,
    en.reports.active,
    en.reports.overdue,
    en.reports.onTimeColumn,
    en.views.returned,
    en.tasks.estimate,
    en.collaboration.actualHours,
  ];
  const rows = w.members
    .filter((m) => !assignee || m.id === assignee)
    .map((m) => {
      const tasks = scoped.tasks.filter((t) =>
          [t.assigneeId, ...(t.assigneeIds ?? [])].includes(m.id),
        ),
        completed = report.completed.filter((t) =>
          tasks.some((item) => item.id === t.id),
        );
      return [
        m.name,
        completed.length,
        activeTasks(scoped).filter(
          (t) => tasks.some((item) => item.id === t.id) && isOpen(w, t),
        ).length,
        tasks.filter(
          (t) =>
            !t.deletedAt && isOpen(w, t) && t.dueDate && t.dueDate < today(),
        ).length,
        completed.filter(
          (t) => t.dueDate && t.completedAt!.slice(0, 10) <= t.dueDate,
        ).length,
        events.filter(
          (e) =>
            e.action === "task.returned" &&
            tasks.some((t) => t.id === e.taskId),
        ).length,
        tasks.reduce((s, t) => s + t.estimatedHours, 0),
        tasks.reduce((s, t) => s + (t.actualHours ?? 0), 0),
      ];
    });
  async function exportFile(type: "excel" | "pdf") {
    setBusy(true);
    setError("");
    try {
      if (type === "excel") {
        const { default: ExcelJS } = await import("exceljs");
        const book = new ExcelJS.Workbook();
        const sheet = book.addWorksheet(en.reports.title.slice(0, 31));
        sheet.addRow(headers);
        rows.forEach((row) => sheet.addRow(row));
        sheet.getRow(1).font = { bold: true };
        sheet.columns.forEach((c) => {
          c.width = 24;
        });
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        const buffer = await book.xlsx.writeBuffer();
        saveBlob(
          new Blob([buffer as BlobPart], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
          `tamm-report-${month}.xlsx`,
        );
      } else {
        const { jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");
        const doc = new jsPDF({ orientation: "landscape" });
        const fontResponse = await fetch("/fonts/TammSans.ttf");
        if (!fontResponse.ok) throw Error();
        const font = new Uint8Array(await fontResponse.arrayBuffer());
        let binary = "";
        for (let i = 0; i < font.length; i += 32768)
          binary += String.fromCharCode(...font.subarray(i, i + 32768));
        doc.addFileToVFS("TammSans.ttf", btoa(binary));
        doc.addFont("TammSans.ttf", "TammSans", "normal");
        doc.setFont("TammSans");
        if (locale === "ar") doc.setR2L(true);

        doc.setFontSize(18);
        doc.text(`${en.brand.name} — ${en.reports.title}`, 14, 18);
        doc.setFontSize(11);
        doc.text(month, 14, 27);
        autoTable(doc, {
          head: [headers],
          body: rows,
          startY: 34,
          styles: { fontSize: 9, font: "TammSans", fontStyle: "normal" },
          headStyles: { fillColor: [49, 86, 67], fontStyle: "normal" },
        });
        doc.save(`tamm-report-${month}.pdf`);
      }
    } catch {
      setError(en.common.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading title={en.reports.title} subtitle={en.reports.subtitle}>
        <Input
          aria-label={en.reports.month}
          type="month"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
        />
      </Heading>
      <AdvancedFilters
        w={w}
        value={filters}
        onChange={setFilters}
        demo={demo}
      />
      <div className="filters">
        {[
          {
            value: project,
            set: setProject,
            label: en.admin.project,
            items: w.projects,
          },
          {
            value: assignee,
            set: setAssignee,
            label: en.tasks.assignee,
            items: w.members,
          },
          {
            value: status,
            set: setStatus,
            label: en.tasks.status,
            items: w.statuses.map((s) => ({ ...s, name: statusLabel(s, en) })),
          },
          {
            value: priority,
            set: setPriority,
            label: en.tasks.priority,
            items: Object.entries(en.priorities).map(([id, name]) => ({
              id,
              name,
            })),
          },
        ].map((f) => (
          <label key={f.label}>
            {f.label}
            <FormSelect value={f.value} onValueChange={(value) => f.set(value)}>
              <SelectOption value="">{en.admin.all}</SelectOption>
              {f.items.map((i) => (
                <SelectOption key={i.id} value={i.id}>
                  {i.name}
                </SelectOption>
              ))}
            </FormSelect>
          </label>
        ))}
      </div>
      <div className="button-row">
        <Button
          variant="outline"
          onClick={() =>
            download([headers, ...rows], `tamm-report-${month}.csv`)
          }
        >
          {en.common.export}
        </Button>
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => exportFile("excel")}
        >
          {en.views.excel}
        </Button>
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => exportFile("pdf")}
        >
          {en.views.pdf}
        </Button>
      </div>
      <div className="metrics">
        {[
          [
            en.reports.completedColumn,
            report.completed.length,
            previous.completed.length,
          ],
          [en.reports.assigned, report.created, previous.created],
          [en.views.reopened, report.reopened, previous.reopened],
          [
            en.reports.cycle,
            report.cycleDays === null
              ? "—"
              : report.cycleDays.toLocaleString(locale, {
                  maximumFractionDigits: 1,
                }),
            previous.cycleDays === null
              ? "—"
              : previous.cycleDays.toLocaleString(locale, {
                  maximumFractionDigits: 1,
                }),
          ],

          [
            en.reports.onTimeColumn,
            report.onTime === null ? "—" : `${report.onTime}%`,
            previous.onTime === null ? "—" : `${previous.onTime}%`,
          ],
          [
            en.views.returned,
            events.filter((e) => e.action === "task.returned").length,
            null,
          ],
        ].map(([name, current, before]) => (
          <div className="metric" key={String(name)}>
            <span>{name}</span>
            <strong>{current}</strong>
            {before !== null && (
              <small>
                {en.views.reportComparison}: {before}
              </small>
            )}
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((v, j) => (
                    <td key={j}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="report-definition">
          {en.reports.definition} {en.views.reportNote}
        </p>
      </section>
      <p role="alert">{error}</p>
    </>
  );
}
