import { expect, test } from "@playwright/test";
import { horizontalOverflow, openPayment, signIn, signOut } from "./support.js";

const WIDTHS = [320, 390, 620, 1280];

test.describe("PB-04 layout and keyboard", () => {
  test("never scrolls horizontally on any page, dialog or drawer at 320, 390, 620 and desktop widths", async ({
    page,
  }) => {
    await signIn(page, "operator");
    const failures: string[] = [];

    async function check(label: string): Promise<void> {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const result = await horizontalOverflow(page);
        if (result.scrollWidth > result.viewport) {
          failures.push(
            `${label} @${width}: scrollWidth ${result.scrollWidth} > ${result.viewport} :: ${result.offenders.join(" | ")}`,
          );
        }
      }
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await check("overview");
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const name of [/^Payment intents/, /^Webhook events/, /^Reconciliation/, /^Audit history/]) {
      await page.getByRole("button", { name }).first().click();
      await check(String(name));
      await page.setViewportSize({ width: 1280, height: 900 });
    }

    await openPayment(page, "Subscription renewal");
    await check("payment drawer (operator, captured)");
    await page.keyboard.press("Escape");
    await expect(page.locator(".payment-drawer")).toHaveCount(0);

    await signOut(page);
    await check("sign in");
    await signIn(page, "merchant-northstar");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: "New payment intent", exact: true }).click();
    await check("new payment dialog");

    expect(failures).toEqual([]);
  });

  test("every payment action is reachable with the keyboard and the drawer returns focus to its opener", async ({
    page,
  }) => {
    await signIn(page, "operator");
    await page.getByRole("button", { name: /^Payment intents/ }).click();
    const opener = page
      .locator(".payment-cell-button")
      .filter({ hasText: "Subscription renewal" });
    await opener.focus();
    await page.keyboard.press("Enter");
    const drawer = page.locator(".payment-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.locator(":focus")).toHaveCount(1);

    const reached = new Set<string>();
    for (let step = 0; step < 30; step += 1) {
      const name = await drawer.locator(":focus").evaluate(
        (element) => element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "",
      );
      if (name) reached.add(name);
      await page.keyboard.press("Tab");
    }
    for (const action of [
      "Close payment details",
      "Deliver pending webhooks",
      "Run reconciliation",
      "Record refund",
    ]) {
      expect([...reached], `reachable by Tab: ${action}`).toContain(action);
    }

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("the drawer returns focus to a payment row opened with the keyboard at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await signIn(page, "auditor");
    await page.getByRole("button", { name: /^Payment intents/ }).click();
    const opener = page.locator(".payment-cell-button").first();
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".payment-drawer")).toBeVisible();
    await page.getByRole("button", { name: "Close payment details" }).click();
    await expect(page.locator(".payment-drawer")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});
