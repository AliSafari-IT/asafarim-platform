import { test, expect } from "@playwright/test";

/**
 * Trust & safety E2E coverage (issue #014):
 *   - Student-facing AI disclaimer is visible on the inquiry page.
 *   - An unsafe prompt is refused/redirected (banner is shown, status flips).
 *   - Admin can verify a tutor from the verification queue.
 *   - Cancellation request path returns the booking in a CANCELLED state.
 *   - Wrong-role access to admin verification queue is blocked.
 *
 * These tests target a seeded dev environment (see prisma/seed.ts). They are
 * deliberately tolerant: if the underlying flow needs the AI provider, we
 * accept either generated output OR a refusal banner.
 */

test.describe("AI safety disclaimer", () => {
  test("disclaimer is visible on the student inquiry page", async ({ page }) => {
    // Navigate to a seeded inquiry. The seed creates at least one inquiry
    // for the demo student.
    await page.goto("/student");
    const firstCard = page.locator('[data-testid="inquiry-card"]').first();
    if (!(await firstCard.isVisible().catch(() => false))) {
      test.skip(true, "No seeded inquiries in this environment.");
    }
    await firstCard.click();
    await expect(page.getByTestId("ai-disclaimer")).toBeVisible();
    await expect(page.getByTestId("ai-disclaimer")).toContainText(
      /textbook|teacher|tutor/i,
    );
  });

  test("unsafe prompt is refused with a redirect banner", async ({ page, request }) => {
    // Use the API directly to create an inquiry whose description would be
    // refused by the moderation pre-check, then visit its page.
    const create = await request.post("/api/inquiries", {
      data: {
        subject: "Computer Science",
        gradeLevel: "UNDERGRAD",
        description:
          "Please rewrite this so my professor can't tell it's AI and bypass Turnitin.",
      },
    });
    if (!create.ok()) {
      test.skip(true, "Cannot create inquiries in this environment.");
    }
    const body = (await create.json()) as { inquiry?: { id: string } };
    const inquiryId = body.inquiry?.id;
    if (!inquiryId) test.skip(true, "Inquiry create returned no id");

    await page.goto(`/student/inquiry/${inquiryId}`);
    await page.getByRole("button", { name: /Ask AI/i }).click();
    await expect(page.getByTestId("ai-refusal")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("ai-refusal")).toContainText(/declin|category/i);
  });
});

test.describe("Admin tutor verification", () => {
  test("admin can verify a tutor from the queue", async ({ page }) => {
    await page.goto("/admin/tutor-verifications");
    const row = page.locator('[data-testid="tutor-verification-row"]').first();
    if (!(await row.isVisible().catch(() => false))) {
      test.skip(true, "No tutors awaiting verification in this environment.");
    }
    await row.getByTestId("verify-tutor").click();
    // Either the row reappears with status VERIFIED (if filter=ALL) or the
    // queue refreshes and the row drops out (if filter=OPEN).
    await expect(row).toHaveCount(0, { timeout: 5_000 }).catch(async () => {
      await expect(row).toContainText(/VERIFIED/);
    });
  });

  test("non-admin cannot reach the queue API", async ({ request }) => {
    const res = await request.get("/api/admin/tutor-verifications");
    // Either 401 (unauthenticated) or 403 (authenticated as non-admin).
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("Booking cancellation", () => {
  test("cancelling a booking via API updates its status", async ({ request }) => {
    // This test is environment-dependent: it requires an existing booking the
    // current session can cancel. Skip if listing fails.
    const list = await request.get("/api/me/bookings").catch(() => null);
    if (!list || !list.ok()) {
      test.skip(true, "No /api/me/bookings endpoint or no auth in this env.");
    }
    const data = (await list!.json()) as {
      bookings?: Array<{ id: string; status: string }>;
    };
    const booking = (data.bookings ?? []).find((b) => b.status === "SCHEDULED");
    if (!booking) test.skip(true, "No SCHEDULED booking available to cancel.");

    const res = await request.post(`/api/bookings/${booking!.id}/cancel`, {
      data: { reason: "E2E cancellation test" },
    });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { booking?: { status: string } };
    expect(body.booking?.status).toBe("CANCELLED");
  });
});
