import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import en from "../src/messages/en.json";
import ar from "../src/messages/ar.json";
test("create, discuss, filter, resize and export work", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: en.overview.title }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: en.demo.projects[0].name, exact: true })
    .click();
  await page
    .getByRole("button", { name: en.common.newTask, exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel(en.tasks.titleLabel, { exact: true })
    .fill("Browser workflow task");
  await dialog
    .getByLabel(en.tasks.description, { exact: true })
    .fill("A **reviewable** result.");
  await dialog
    .getByRole("combobox", { name: en.collaboration.assignees, exact: true })
    .click();
  await page
    .getByRole("option", { name: en.demo.people[1], exact: true })
    .click();
  await page.keyboard.press("Escape");
  expect(
    await dialog
      .locator("form")
      .evaluate((form) =>
        new FormData(form as HTMLFormElement).getAll("assigneeIds"),
      ),
  ).toEqual(["person-1"]);
  await dialog
    .getByRole("button", { name: en.common.newTask, exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await page.getByRole("heading", { name: "Browser workflow task" }).click();
  await expect(dialog.locator(".markdown strong")).toHaveText("reviewable");
  await dialog
    .getByLabel(en.tasks.comments, { exact: true })
    .fill("A useful **comment**.");
  await dialog.getByRole("button", { name: en.tasks.post }).click();
  await expect(
    dialog.locator(".comment strong").filter({ hasText: "comment" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: en.tasks.list, exact: true }).click();
  await page.locator(".column-options summary").click();
  await page
    .locator(".column-options")
    .getByRole("checkbox", { name: en.admin.project, exact: true })
    .uncheck();
  await expect(
    page.getByRole("columnheader", { name: en.admin.project, exact: true }),
  ).toHaveCount(0);
  const resize = page.getByRole("separator", {
    name: `${en.views.resize} ${en.tasks.titleLabel}`,
  });
  await resize.focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: en.nav.reports, exact: true }).click();
  for (const label of [en.views.excel, en.views.pdf]) {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const file = await download;
    expect(await file.failure()).toBeNull();
  }
  expect(errors).toEqual([]);
});
test("Arabic layout and mobile keyboard navigation", async ({
  page,
  baseURL,
}) => {
  await page
    .context()
    .addCookies([{ name: "tamm-locale", value: "ar", url: baseURL! }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: ar.overview.title }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: ar.common.menu }).click();
  await page.getByRole("button", { name: ar.nav.myTasks }).click();
  await expect(
    page.getByRole("heading", { name: ar.tasks.myTitle, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: ar.tasks.calendar, exact: true })
    .click();
  await page.getByRole("button", { name: ar.views.day, exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});
test("account onboarding, profile and virtual passkey", async ({ page }) => {
  test.skip(
    process.env.RUN_AUTH_E2E !== "true",
    "Requires the PostgreSQL test service.",
  );
  await page.goto("/login");
  await page.getByRole("button", { name: en.auth.signUp, exact: true }).click();
  await page.getByLabel(en.auth.name, { exact: true }).fill("Browser Example");
  await page
    .getByLabel(en.auth.email, { exact: true })
    .fill(`browser-${Date.now()}@example.com`);
  await page
    .getByLabel(en.auth.password, { exact: true })
    .fill("browser-test-password-69Rh!");
  await page.getByRole("button", { name: en.auth.signUp, exact: true }).click();
  await page
    .getByLabel(en.auth.workspaceName, { exact: true })
    .fill("Browser workspace");
  await page
    .getByRole("button", { name: en.auth.createWorkspace, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: en.overview.title }),
  ).toBeVisible();
  await page.goto("/admin");
  await page
    .getByLabel(en.account.name, { exact: true })
    .fill("Updated Browser Example");
  const account = page
    .getByRole("heading", { name: en.account.title, exact: true })
    .locator("..");
  await account
    .locator("form")
    .first()
    .getByRole("button", { name: en.common.save })
    .click();
  await expect(account.getByRole("status")).toHaveText(en.account.saved);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await account.getByRole("button", { name: en.account.addPasskey }).click();
  await expect(account.getByText(en.brand.name, { exact: true })).toBeVisible();
});

test("overview accessibility and reduced-motion controls", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: en.overview.title }),
  ).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  if (process.env.CAPTURE_README === "true")
    await page.screenshot({
      path: "docs/preview.png",
      fullPage: false,
      style: "nextjs-portal { display: none; }",
    });
});

test("V1.5 planning, capacity, analytics and incremental board", async ({
  page,
}) => {
  test.skip(
    process.env.RUN_AUTH_E2E !== "true",
    "Requires the PostgreSQL test service.",
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page
    .getByLabel(en.auth.email, { exact: true })
    .fill("owner@example.com");
  await page
    .getByLabel(en.auth.password, { exact: true })
    .fill("test-only-password-49Qv!");
  await page.getByRole("button", { name: en.auth.signIn, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: en.overview.title }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: en.nav.planning, exact: true })
    .click();
  const milestoneName = `Browser milestone ${Date.now()}`;
  const form = page
    .locator(".planning-panel form")
    .filter({ has: page.getByLabel(en.planning.name, { exact: true }) });
  await form.getByLabel(en.planning.name, { exact: true }).fill(milestoneName);
  await form
    .getByRole("combobox", { name: en.planning.project, exact: true })
    .click();
  await page
    .getByRole("option", { name: "Shared project", exact: true })
    .click();
  await form
    .getByRole("combobox", { name: en.planning.tasks, exact: true })
    .click();
  await page.getByRole("option").first().click();
  await page.keyboard.press("Escape");
  const saved = page.waitForResponse(
    (r) => r.url().includes("/api/planning") && r.request().method() === "POST",
  );
  await form
    .getByRole("button", { name: en.planning.save, exact: true })
    .click();
  const saveResponse = await saved;
  expect(await saveResponse.text()).not.toContain('"error"');
  expect(saveResponse.ok()).toBeTruthy();
  await expect(
    page.getByRole("heading", { name: milestoneName }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: en.planning.recurring, exact: true })
    .click();
  const rule = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Weekly operations",
      exact: true,
    }),
  });
  await rule
    .getByRole("button", { name: en.planning.pause, exact: true })
    .click();
  await expect(
    rule.getByText(en.planning.paused, { exact: true }),
  ).toBeVisible();
  await rule
    .getByRole("button", { name: en.planning.resume, exact: true })
    .click();
  await expect(
    rule.getByText(en.planning.enabled, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: en.planning.capacity, exact: true })
    .click();
  const hours = page.getByRole("spinbutton", {
    name: `${en.planning.available}: Example Owner`,
    exact: true,
  });
  await hours.fill("16");
  await hours
    .locator("..")
    .getByRole("button", { name: en.planning.save, exact: true })
    .click();
  await expect(hours).toHaveValue("16");
  await page
    .getByRole("button", { name: en.nav.analytics, exact: true })
    .click();
  await expect(
    page.getByRole("columnheader", { name: en.planning.p85Days }),
  ).toBeVisible();
  await expect(page.locator(".health").first()).toBeVisible();
  await expect(page.locator("[data-slot=chart]")).toHaveCount(3);
  const metadata = page.waitForResponse(
    (r) =>
      r.url().includes("/api/workspace?") &&
      r.url().includes("content=metadata"),
  );
  await page.goto("/board");
  expect((await (await metadata).json()).workspace.tasks).toEqual([]);
  await expect(page.locator(".task-card").first()).toBeVisible();
  await page.keyboard.press("Control+k");
  await page
    .getByRole("dialog")
    .getByLabel(en.common.search, { exact: true })
    .fill("Review delivery");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Review delivery", exact: true })
      .first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".task-card").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(errors).toEqual([]);
});

test("V2 custom values, time entries, calendar keys and Hijri preference", async ({
  page,
}) => {
  test.skip(
    process.env.RUN_AUTH_E2E !== "true",
    "Requires PostgreSQL fixtures.",
  );
  await page.goto("/login");
  await page
    .getByLabel(en.auth.email, { exact: true })
    .fill("owner@example.com");
  await page
    .getByLabel(en.auth.password, { exact: true })
    .fill("test-only-password-49Qv!");
  await page.getByRole("button", { name: en.auth.signIn, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: en.overview.title }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: en.nav.extensions, exact: true })
    .click();
  const panel = page.locator(".extension-panel");
  await expect(panel.getByRole("heading", { name: en.v2.title })).toBeVisible();
  const fieldName = `Browser field ${Date.now()}`;
  const form = panel.locator("form").filter({
    has: page.getByRole("heading", { name: en.v2.create, exact: true }),
  });
  await form.getByLabel(en.v2.name, { exact: true }).fill(fieldName);
  await form.getByRole("button", { name: en.v2.save, exact: true }).click();
  await expect(panel.getByRole("heading", { name: fieldName })).toBeVisible();
  await panel.getByRole("combobox", { name: en.v2.task, exact: true }).click();
  await page
    .getByRole("option", { name: "Review delivery", exact: true })
    .click();
  const value = panel
    .locator(".extension-field")
    .filter({ has: page.getByLabel(fieldName, { exact: true }) });
  await value.getByLabel(fieldName, { exact: true }).fill("Browser value");
  await value.getByRole("button", { name: en.v2.save, exact: true }).click();
  await expect(value.getByLabel(fieldName, { exact: true })).toHaveValue(
    "Browser value",
  );
  await panel.getByRole("button", { name: en.v2.time, exact: true }).click();
  await panel.getByRole("button", { name: en.v2.start, exact: true }).click();
  await expect(
    panel.getByRole("button", { name: en.v2.stop, exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: en.v2.stop, exact: true }).click();
  await expect(
    panel.getByRole("button", { name: en.v2.stop, exact: true }),
  ).toBeHidden();
  const manual = panel.locator("form").filter({
    has: page.getByRole("heading", { name: en.v2.manual, exact: true }),
  });
  await manual.getByLabel(en.v2.minutes, { exact: true }).fill("25");
  await manual
    .getByLabel(en.v2.note, { exact: true })
    .fill("Browser time entry");
  await manual.getByRole("button", { name: en.v2.save, exact: true }).click();
  await expect(
    panel
      .getByRole("cell", { name: "Browser time entry", exact: true })
      .first(),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: en.v2.export, exact: true }).click();
  expect((await download).suggestedFilename()).toBe("tamm-time.csv");
  await panel
    .getByRole("button", { name: en.v2.integrations, exact: true })
    .click();
  const keyName = `Browser calendar ${Date.now()}`,
    keyForm = panel
      .locator("form")
      .filter({ has: page.getByLabel(en.v2.days, { exact: true }) });
  await keyForm.getByLabel(en.v2.name, { exact: true }).fill(keyName);
  await keyForm
    .getByRole("button", { name: en.v2.create, exact: true })
    .click();
  await expect(
    panel.getByLabel(en.v2.calendarUrl, { exact: true }),
  ).toHaveValue(/\/api\/calendar\?token=tamm_/);
  const keyCard = panel
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: keyName, exact: true }) });
  await keyCard
    .getByRole("button", { name: en.v2.revoke, exact: true })
    .click();
  await expect(keyCard.getByText(en.v2.revoked, { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: en.nav.settings, exact: true })
    .click();
  const hijri = page.getByRole("checkbox", { name: en.v2.hijri, exact: true });
  await hijri.check();
  await page.reload();
  await page
    .getByRole("button", { name: en.nav.settings, exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: en.v2.hijri, exact: true }),
  ).toBeChecked();
  await page
    .getByRole("checkbox", { name: en.v2.hijri, exact: true })
    .uncheck();
});

test("one language menu, translated persisted statuses, and one initial board request", async ({
  page,
  baseURL,
}) => {
  const { createDemo } = await import("../src/lib/demo");
  const w = createDemo(en);
  const calls: string[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    calls.push(url.pathname + url.search);
    if (url.pathname === "/api/workspace")
      return route.fulfill({ json: { workspace: w } });
    if (url.pathname === "/api/tasks") {
      const columns = Object.fromEntries(
        w.statuses.map((s) => [
          s.id,
          {
            items: w.tasks.filter((t) => t.statusId === s.id),
            total: w.tasks.filter((t) => t.statusId === s.id).length,
            page: 0,
          },
        ]),
      );
      return route.fulfill({
        json:
          url.searchParams.get("board") === "true"
            ? { columns }
            : { items: w.tasks, total: w.tasks.length },
      });
    }
    if (url.pathname.endsWith("/organization/list"))
      return route.fulfill({ json: [{ id: w.id, name: w.name }] });
    if (url.pathname === "/api/notifications")
      return route.fulfill({
        json: { items: [], enabledKinds: [], emailEnabled: false },
      });
    if (url.pathname === "/api/views")
      return route.fulfill({ json: { items: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/login");
  const nav = page.locator(".auth-header nav");
  await expect(
    nav.getByRole("button", { name: en.common.language, exact: true }),
  ).toHaveCount(1);
  await nav
    .getByRole("button", { name: en.common.language, exact: true })
    .click();
  await page
    .getByRole("menuitemradio", { name: en.localeNames.ar, exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.goto("/board");
  await expect(
    page.locator(".board-column h3").filter({ hasText: ar.demo.statuses[2] }),
  ).toBeVisible();
  await expect(
    page.locator(".board-column h3").filter({ hasText: en.demo.statuses[2] }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: ar.common.language, exact: true }),
  ).toHaveCount(1);
  await expect(
    page
      .locator(".sidebar")
      .getByRole("button", { name: ar.common.language, exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("select")).toHaveCount(0);
  expect(calls.filter((url) => url.startsWith("/api/workspace?"))).toHaveLength(
    1,
  );
  expect(calls.filter((url) => url.startsWith("/api/tasks?"))).toHaveLength(1);
  expect(calls.find((url) => url.startsWith("/api/tasks?"))).toContain(
    "board=true",
  );
  await page.getByRole("button", { name: ar.tasks.list, exact: true }).click();
  await expect(
    page
      .locator("tbody")
      .getByRole("button", { name: new RegExp(w.tasks[0].title) }),
  ).toBeVisible();
  expect(
    calls.filter(
      (url) => url.startsWith("/api/tasks?") && !url.includes("board=true"),
    ),
  ).toHaveLength(1);
});
