"use client";
import { readRequest } from "@/lib/read-request";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { FormSelect, SelectOption } from "@/components/ui/form-select";

import { useEffect, useState } from "react";
import type { Workspace } from "@/lib/types";
import type { TaskFilters } from "@/lib/task-filters";
import { Button } from "./ui/button";
import { useMessages, useDates } from "@/components/locale-provider";
export function AdvancedFilters({
  w,
  value,
  onChange,
  demo = false,
}: {
  w: Workspace;
  value: TaskFilters;
  onChange: (f: TaskFilters) => void;
  demo?: boolean;
}) {
  const en = useMessages();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<
      { id: string; name: string; filters: TaskFilters }[]
    >([]),
    [message, setMessage] = useState("");
  const url = `/api/views?workspaceId=${encodeURIComponent(w.id)}`;
  async function refresh() {
    if (demo) return;
    const r = await readRequest(url);
    if (!r.ok) throw Error();
    setItems((await r.json()).items);
  }
  useEffect(() => {
    if (open) refresh().catch(() => setMessage(en.common.error));
  }, [url, demo, open]);
  const set = (key: string, v: string | boolean) =>
    onChange({ ...value, [key]: v });
  return (
    <details
      className="advanced-filters"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>{en.views.filters}</summary>
      <div className="form-grid">
        {(["team", "department", "creator"] as const).map((key) => (
          <label key={key}>
            {en.views[key]}
            <FormSelect
              value={value[key] ?? ""}
              onValueChange={(value) => set(key, value)}
            >
              <SelectOption value="">{en.admin.all}</SelectOption>
              {(key === "team"
                ? w.teams
                : key === "department"
                  ? w.departments
                  : w.members
              ).map((i) => (
                <SelectOption key={i.id} value={i.id}>
                  {i.name}
                </SelectOption>
              ))}
            </FormSelect>
          </label>
        ))}
        <label>
          {en.views.tagFilter}
          <Input
            value={value.tag ?? ""}
            onChange={(e) => set("tag", e.target.value)}
          />
        </label>
        {(["from", "to"] as const).map((key) => (
          <label key={key}>
            {en.views[key]}
            <Input
              type="date"
              value={value[key] ?? ""}
              onChange={(e) => set(key, e.target.value)}
            />
          </label>
        ))}
      </div>
      {(["overdue", "dependency", "attachment"] as const).map((key) => (
        <label className="checklist-item" key={key}>
          <Checkbox
            checked={value[key] ?? false}
            onCheckedChange={(checked) => set(key, checked)}
          />
          {en.views[key]}
        </label>
      ))}
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const name = String(new FormData(e.currentTarget).get("name"));
          try {
            if (demo)
              setItems([
                ...items,
                { id: crypto.randomUUID(), name, filters: value },
              ]);
            else {
              const r = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, filters: value }),
              });
              if (!r.ok) throw Error();
              await refresh();
            }
          } catch {
            setMessage(en.common.error);
          }
        }}
      >
        <Input
          name="name"
          aria-label={en.views.name}
          placeholder={en.views.name}
          required
          maxLength={100}
        />
        <Button variant="outline">{en.views.save}</Button>
      </form>
      {items.map((i) => (
        <div className="restore-row" key={i.id}>
          <button className="text-link" onClick={() => onChange(i.filters)}>
            {i.name}
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                if (demo) setItems(items.filter((v) => v.id !== i.id));
                else {
                  const r = await fetch(`${url}&id=${i.id}`, {
                    method: "DELETE",
                  });
                  if (!r.ok) throw Error();
                  await refresh();
                }
              } catch {
                setMessage(en.common.error);
              }
            }}
          >
            {en.views.remove}
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        onClick={async () => {
          try {
            const u = new URL(window.location.href);
            u.searchParams.set("filters", JSON.stringify(value));
            await navigator.clipboard.writeText(u.toString());
            setMessage(en.views.copied);
          } catch {
            setMessage(en.common.error);
          }
        }}
      >
        {en.views.share}
      </Button>
      <p role="status">{message}</p>
    </details>
  );
}
