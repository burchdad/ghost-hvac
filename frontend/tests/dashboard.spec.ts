import { expect, test } from "@playwright/test";

test("dashboard leak and reset flow", async ({ page }) => {
  await page.route("**://localhost:8000/simulate?*", async (route) => {
    const url = route.request().url();
    const leakMode = url.includes("leak=true");

    const response = leakMode
      ? {
          data: {
            timestamp: "2026-04-06T13:00:05.000Z",
            pressure: 112.2,
            runtime: 14.8,
          },
          analysis: {
            alerts: [
              "Pressure dropped by 7.80 units compared to previous reading.",
              "Runtime 14.80 exceeded threshold 13.00.",
            ],
            severity: "CRITICAL",
          },
        }
      : {
          data: {
            timestamp: "2026-04-06T13:00:00.000Z",
            pressure: 120.0,
            runtime: 10.1,
          },
          analysis: {
            alerts: [],
            severity: "NORMAL",
          },
        };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });

  await page.route("**://localhost:8000/reset", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Backend simulation state reset.",
        previous_pressure: 120.0,
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Ghost HVAC Monitor" })).toBeVisible();
  await expect(page.getByText("NORMAL")).toBeVisible();

  await page.getByRole("button", { name: "Simulate Leak" }).click();
  await expect(page.getByText("CRITICAL")).toBeVisible();
  await expect(
    page
      .getByText("Pressure dropped by 7.80 units compared to previous reading.")
      .first()
  ).toBeVisible();

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText("NORMAL")).toBeVisible();
  await expect(page.getByText("No alerts captured yet.")).toBeVisible();
});
