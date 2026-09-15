import { z } from "zod";
export const fieldKinds = [
  "text",
  "number",
  "date",
  "dropdown",
  "checkbox",
  "user",
] as const;
const id = z.string().min(1).max(100),
  name = z.string().trim().min(1).max(100);
export const extensionCommand = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("field.save"),
    id: id.optional(),
    projectId: id.nullable(),
    name,
    kind: z.enum(fieldKinds),
    options: z.array(name).max(50).default([]),
    archived: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("field.value"),
    taskId: id,
    fieldId: id,
    value: z.union([
      z.string().max(4000),
      z.number().finite(),
      z.boolean(),
      z.null(),
    ]),
  }),
  z.object({
    type: z.literal("time.start"),
    taskId: id,
    note: z.string().max(2000).default(""),
  }),
  z.object({ type: z.literal("time.stop"), id }),
  z.object({
    type: z.literal("time.save"),
    id: id.optional(),
    taskId: id,
    startedAt: z.iso.datetime(),
    minutes: z.number().min(1).max(1440),
    note: z.string().max(2000).default(""),
  }),
  z.object({ type: z.literal("time.delete"), id }),
  z.object({
    type: z.literal("key.create"),
    name,
    projectId: id.nullable(),
    scopes: z
      .array(z.enum(["tasks:read", "tasks:write", "calendar:read"]))
      .min(1)
      .max(3),
    days: z.number().int().min(1).max(365),
  }),
  z.object({ type: z.literal("key.revoke"), id }),
  z.object({
    type: z.literal("hook.create"),
    name,
    projectId: id,
    url: z.url().max(2000),
  }),
  z.object({ type: z.literal("hook.toggle"), id, enabled: z.boolean() }),
  z.object({ type: z.literal("hook.retry"), id }),
]);
export function validFieldValue(
  field: { kind: string; options: string[] },
  value: unknown,
  users: string[],
) {
  if (value === null) return true;
  switch (field.kind) {
    case "text":
      return typeof value === "string" && value.length <= 4000;
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "date":
      return z.iso.date().safeParse(value).success;
    case "dropdown":
      return typeof value === "string" && field.options.includes(value);
    case "checkbox":
      return typeof value === "boolean";
    case "user":
      return typeof value === "string" && users.includes(value);
    default:
      return false;
  }
}
export function elapsedMinutes(start: Date, end: Date) {
  return Math.min(
    1440,
    Math.max(0, Math.round((end.getTime() - start.getTime()) / 600) / 100),
  );
}
export function escapeCalendar(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r/g, "");
}
export function foldCalendar(line: string) {
  let result = "",
    part = "";
  for (const char of line) {
    if (new TextEncoder().encode(part + char).length > 74) {
      result += part + "\r\n ";
      part = "";
    }
    part += char;
  }
  return result + part;
}
