import { expect, test, type Page, type Route } from "@playwright/test";
import { createIntent, openPayment, signIn, signOut } from "./support.js";

type Seen = { method: string; key: string | undefined; requestId: string | undefined };

/** Lets the first matching write reach the server, then loses the reply. Later writes pass through untouched. */
async function loseFirstReply(
  page: Page,
  urlPattern: string,
  how: "abort" | "server-error",
): Promise<Seen[]> {
  const seen: Seen[] = [];
  let lost = false;
  await page.route(urlPattern, async (route: Route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    const headers = request.headers();
    seen.push({
      method: request.method(),
      key: headers["idempotency-key"],
      requestId: headers["x-request-id"],
    });
    if (lost) return route.continue();
    lost = true;
    await route.fetch(); // the server receives and commits this request
    if (how === "abort") return route.abort("failed");
    return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });
  return seen;
}

/** A merchant creates, authorizes and captures a payment; returns to a clean sign-in screen. */
async function capturedPayment(page: Page, description: string, amount: string): Promise<string> {
  await signIn(page, "merchant-northstar");
  const id = await createIntent(page, description, amount);
  const drawer = page.locator(".payment-drawer");
  await drawer.getByRole("button", { name: "Simulate authorization", exact: true }).click();
  await drawer.getByRole("button", { name: "Capture", exact: true }).click();
  await expect(drawer.getByRole("button", { name: "Deliver pending webhooks" })).toBeVisible();
  await drawer.getByRole("button", { name: "Close payment details" }).click();
  await signOut(page);
  return id;
}

test.describe("PB-01 one payment attempt is one intent key", () => {
  test("a capture whose reply is lost is confirmed by a retry on the same key", async ({ page }) => {
    await signIn(page, "merchant-northstar");
    await createIntent(page, "PB-01 lost capture reply", "10.00");
    const drawer = page.locator(".payment-drawer");
    await drawer.getByRole("button", { name: "Simulate authorization", exact: true }).click();
    const capture = drawer.getByRole("button", { name: "Capture", exact: true });
    await expect(capture).toBeVisible();
    const seen = await loseFirstReply(page, "**/payment-intents/*/capture", "abort");

    await capture.click();

    await expect(drawer.getByText("Awaiting confirmation")).toBeVisible();
    await expect(page.getByText("Simulated capture recorded.")).toHaveCount(0);
    await drawer.getByRole("button", { name: "Retry safely" }).click();

    await expect(page.getByText("Simulated capture recorded.")).toBeVisible();
    await expect(drawer.getByText("Awaiting confirmation")).toHaveCount(0);
    expect(seen).toHaveLength(2);
    expect(seen[0]?.key).toBeTruthy();
    expect(seen[1]?.key).toBe(seen[0]?.key);
    expect(seen[1]?.requestId).not.toBe(seen[0]?.requestId);
  });

  test("a server error after the write committed is also confirmed by a retry on the same key", async ({ page }) => {
    await signIn(page, "merchant-northstar");
    await createIntent(page, "PB-01 server error reply", "10.00");
    const drawer = page.locator(".payment-drawer");
    await drawer.getByRole("button", { name: "Simulate authorization", exact: true }).click();
    const capture = drawer.getByRole("button", { name: "Capture", exact: true });
    await expect(capture).toBeVisible();
    const seen = await loseFirstReply(page, "**/payment-intents/*/capture", "server-error");

    await capture.click();
    await expect(drawer.getByText("Awaiting confirmation")).toBeVisible();
    await capture.click();

    await expect(page.getByText("Simulated capture recorded.")).toBeVisible();
    expect(seen).toHaveLength(2);
    expect(seen[1]?.key).toBe(seen[0]?.key);
  });

  test("a refund whose reply is lost is recorded once and shown with actor, reason, reference and balance", async ({
    page,
  }) => {
    await capturedPayment(page, "PB-02 lost refund reply", "50.00");
    await signIn(page, "operator");
    await openPayment(page, "PB-02 lost refund reply");
    const drawer = page.locator(".payment-drawer");
    await expect(drawer.getByText("No refunds recorded yet.")).toBeVisible();
    await expect(drawer.getByText("Remaining refundable: $50.00")).toBeVisible();
    const seen = await loseFirstReply(page, "**/payment-intents/*/refunds", "abort");

    await drawer.getByLabel(/^Refund amount/).fill("20.00");
    await drawer.getByRole("button", { name: "Record refund", exact: true }).click();

    await expect(drawer.getByText("Awaiting confirmation")).toBeVisible();
    await expect(drawer.getByText(/We could not confirm the \$20\.00 refund/)).toBeVisible();
    await expect(drawer.getByLabel(/^Refund amount/)).toBeDisabled();
    await drawer.getByRole("button", { name: "Retry safely" }).click();

    await expect(page.getByText("Simulated refund recorded.")).toBeVisible();
    const rows = drawer.getByRole("list", { name: "Recorded refunds" }).getByRole("listitem");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("$20.00 USD");
    await expect(rows.first()).toContainText("Customer request");
    await expect(rows.first()).toContainText("Recorded by Morgan Patel");
    await expect(rows.first()).toContainText(/Refund RF-/);
    await expect(rows.first()).toContainText("Remaining after: $30.00");
    await expect(drawer.getByText("Remaining refundable: $30.00")).toBeVisible();
    expect(seen).toHaveLength(2);
    expect(seen[1]?.key).toBe(seen[0]?.key);
    await expect(drawer.getByLabel(/^Refund amount/)).toHaveValue("");
  });

  test("a stale refund that would exceed the captured amount is rejected and changes nothing", async ({
    page,
    browser,
  }) => {
    await capturedPayment(page, "PB-02 overlapping refunds", "50.00");
    await signIn(page, "operator");
    await openPayment(page, "PB-02 overlapping refunds");
    const drawer = page.locator(".payment-drawer");

    const second = await browser.newPage();
    await signIn(second, "operator");
    await openPayment(second, "PB-02 overlapping refunds");
    const otherDrawer = second.locator(".payment-drawer");
    await otherDrawer.getByLabel(/^Refund amount/).fill("30.00");
    await otherDrawer.getByRole("button", { name: "Record refund", exact: true }).click();
    await expect(otherDrawer.getByText("Remaining refundable: $20.00")).toBeVisible();

    // This operator still sees $50.00 refundable, so the form accepts $30.00; the server must refuse it.
    await drawer.getByLabel(/^Refund amount/).fill("30.00");
    await drawer.getByRole("button", { name: "Record refund", exact: true }).click();

    await expect(drawer.getByRole("alert")).toContainText("more than the amount still refundable");
    await expect(drawer.getByText("Awaiting confirmation")).toHaveCount(0);
    await drawer.getByRole("button", { name: "Close payment details" }).click();
    await openPayment(page, "PB-02 overlapping refunds");
    const rows = drawer.getByRole("list", { name: "Recorded refunds" }).getByRole("listitem");
    await expect(rows).toHaveCount(1);
    await expect(drawer.getByText("Remaining refundable: $20.00")).toBeVisible();
    await second.close();
  });
});
