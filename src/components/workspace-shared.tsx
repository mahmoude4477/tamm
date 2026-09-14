"use client";
import { csvCell } from "@/lib/reports";
import type { Workspace } from "@/lib/types";
import { Check, CircleCheck } from "lucide-react";
export function Avatar({
  name,
  size = "",
  image,
}: {
  name: string;
  size?: string;
  image?: string | null;
}) {
  return (
    <span className={`avatar ${size}`} title={name}>
      {image ? (
        <img src={image} alt="" referrerPolicy="no-referrer" />
      ) : (
        name
          .split(" ")
          .map((w) => w[0])
          .slice(0, 2)
          .join("")
      )}
    </span>
  );
}
export function StatusDot({ w, id }: { w: Workspace; id: string }) {
  const s = w.statuses.find((s) => s.id === id);
  return (
    <span
      className="status-dot"
      style={{ "--status": s?.color } as React.CSSProperties}
    >
      {s?.category === "done" ? <Check size={10} /> : null}
    </span>
  );
}
export function ErrorNotice({ error }: { error: string }) {
  return error ? (
    <p role="alert" className="error">
      {error}
    </p>
  ) : null;
}
export function Heading({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
export function Empty({ title, note }: { title: string; note: string }) {
  return (
    <div className="empty">
      <CircleCheck size={30} />
      <h3>{title}</h3>
      <p>{note}</p>
    </div>
  );
}
export function download(rows: unknown[][], name: string) {
  const blob = new Blob(
    ["\ufeff" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
