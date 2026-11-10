import { expect, test } from "@playwright/test";

const apiOrigin = "http://127.0.0.1:5604";
const isMock = process.env.PAYBRIDGE_E2E_MODE !== "false";
const expectedMode = isMock ? "mock" : "server";

test("completes the API-backed payment workflow in the selected mode", async ({
  page,
}) => {
  const description = `E2E ${expectedMode} payment`;
  const apiRequests: Array<{ origin: string; method: string; path: string }> =
    [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/v1/")) {
      apiRequests.push({
        origin: url.origin,
        method: request.method(),
        path: url.pathname,
      });
    }
  });

  await page.goto("/");
  const profileSelect = page.locator("#workspace-profile");
  await expect(profileSelect).toHaveValue("merchant-northstar");
  await expect(profileSelect.locator("option")).toHaveCount(4);
  await page.getByRole("button", { name: /continue to paybridge/i }).click();

  const appShell = page.locator(".app-shell");
  await expect(appShell).toBeVisible();
  await expect(appShell).toHaveAttribute("data-mode", expectedMode);

  await page.getByRole("button", { name: "New payment intent" }).click();
  const createDialog = page.getByRole("dialog");
  await createDialog.getByLabel("Description").fill(description);
  await createDialog.getByLabel("Amount (USD)").fill("10.00");
  await createDialog.getByRole("button", { name: "Create intent" }).click();

  const paymentDrawer = page.locator(".payment-drawer");
  await expect(paymentDrawer).toBeVisible();
  await paymentDrawer
    .getByRole("button", { name: "Simulate authorization" })
    .click();
  await paymentDrawer
    .getByRole("button", { name: "Capture", exact: true })
    .click();
  await paymentDrawer
    .getByRole("button", { name: "Deliver pending webhooks" })
    .click();

  await paymentDrawer
    .getByRole("button", { name: "Close payment details" })
    .click();
  await expect(paymentDrawer).not.toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(profileSelect).toBeVisible();
  await profileSelect.selectOption("operator");
  await page.getByRole("button", { name: /continue to paybridge/i }).click();
  await expect(appShell).toHaveAttribute("data-mode", expectedMode);

  await page.getByRole("button", { name: "Payment intents" }).click();
  const paymentRow = page
    .locator(".payment-cell-button")
    .filter({ hasText: description });
  await expect(paymentRow).toHaveCount(1);
  await paymentRow.click();
  await page
    .locator(".payment-drawer")
    .getByRole("button", { name: "Run reconciliation" })
    .click();
  await expect(
    page.locator(".payment-drawer").getByText("Matched"),
  ).toBeVisible();

  expect(apiRequests.length).toBeGreaterThan(0);
  expect(apiRequests.every((request) => request.origin === apiOrigin)).toBe(
    true,
  );
  expect(apiRequests).toContainEqual({
    origin: apiOrigin,
    method: "POST",
    path: "/api/v1/auth/profile-login",
  });
  expect(apiRequests).toContainEqual({
    origin: apiOrigin,
    method: "POST",
    path: "/api/v1/payment-intents",
  });
  const profileDiscovery = {
    origin: apiOrigin,
    method: "GET",
    path: "/api/v1/auth/profiles",
  };
  expect(apiRequests).toContainEqual(profileDiscovery);
  for (const suffix of [
    "/authorize",
    "/capture",
    "/webhook-deliveries",
    "/reconcile",
  ]) {
    expect(
      apiRequests.some(
        (request) => request.method === "POST" && request.path.endsWith(suffix),
      ),
    ).toBe(true);
  }
});
