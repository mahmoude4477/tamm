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
    .getByLabel(en.admin.project, { exact: true })
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
