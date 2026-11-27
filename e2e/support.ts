/// <reference lib="dom" />
import { expect, type Page } from "@playwright/test";

export const apiOrigin = "http://127.0.0.1:5604";
export const apiBase = `${apiOrigin}/api/v1`;

export async function signIn(page: Page, profile: string): Promise<void> {
  await page.goto("/");
  await page.locator("#workspace-profile").selectOption(profile);
  await page.getByRole("button", { name: /continue to paybridge/i }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.locator("#workspace-profile")).toBeVisible();
}

/** Creates a payment intent through the dialog and returns its id once the drawer opens. */
export async function createIntent(
  page: Page,
  description: string,
  amount = "10.00",
): Promise<string> {
  await page.getByRole("button", { name: "New payment intent", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Description", { exact: true }).fill(description);
  await dialog.getByRole("textbox", { name: /^Amount \(USD\)/ }).fill(amount);
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/payment-intents") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Create intent", exact: true }).click();
  const body = (await (await response).json()) as { paymentIntent: { id: string } };
  await expect(page.locator(".payment-drawer")).toBeVisible();
  return body.paymentIntent.id;
}

export async function openPayment(page: Page, description: string): Promise<void> {
  await page.getByRole("button", { name: /^Payment intents/ }).click();
  await page.locator(".payment-cell-button").filter({ hasText: description }).click();
  await expect(page.locator(".payment-drawer")).toBeVisible();
}

/** Widest horizontal extent of the document, plus the elements that stick out past the viewport. */
export async function horizontalOverflow(page: Page): Promise<{
  viewport: number;
  scrollWidth: number;
  offenders: string[];
}> {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const clipping = ["auto", "scroll", "hidden", "clip"];
    // Content inside an intentional scroller (a table wrapper, the nav strip) is not page overflow.
    function isClippedByAncestor(element: HTMLElement): boolean {
      const position = getComputedStyle(element).position;
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (!clipping.includes(style.overflowX)) continue;
        const escapes = (position === "absolute" || position === "fixed") && style.position === "static";
        if (!escapes) return true;
      }
      return false;
    }
    const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.right > viewport + 1 && !isClippedByAncestor(element);
      })
      .slice(0, 8)
      .map((element) => {
        const box = element.getBoundingClientRect();
        const name = element.className && typeof element.className === "string"
          ? `.${element.className.split(" ").join(".")}`
          : "";
        return `${element.tagName.toLowerCase()}${name} right=${Math.round(box.right)}`;
      });
    return { viewport, scrollWidth: document.documentElement.scrollWidth, offenders };
  });
}
