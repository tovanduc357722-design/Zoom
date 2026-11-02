import { test, expect } from "@playwright/test";
test("patient and doctor complete a realtime DEMO consultation", async ({
  browser,
}) => {
  const doctor = await browser.newContext(),
    patient = await browser.newContext();
  const d = await doctor.newPage(),
    p = await patient.newPage();
  for (const [page, email] of [
    [d, "doctor@demo.vn"],
    [p, "patient@demo.vn"],
  ] as const) {
    await page.goto("/");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill("DemoHealth@2026");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  }
  await expect(d.getByRole("heading", { name: /Chào bác sĩ/ })).toBeVisible();
  await d.getByRole("button", { name: "Bật Online", exact: true }).click();
  await expect(
    d.getByRole("heading", { name: "Bạn đang Online" }),
  ).toBeVisible();
  await p.reload();
  await p.getByRole("button", { name: "Gọi bác sĩ", exact: true }).click();
  await expect(
    d.getByRole("button", { name: "Chấp nhận", exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Chấp nhận", exact: true }).click();
  await expect(
    p.getByRole("heading", { name: "Phòng DEMO đã sẵn sàng" }),
  ).toBeVisible();
  await p.getByRole("button", { name: "Vào phòng DEMO", exact: true }).click();
  await expect(
    d.getByRole("heading", { name: "Đang trong phiên DEMO" }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Kết thúc phiên", exact: true }).click();
  await expect(
    d.getByRole("heading", { name: "Trạng thái: OFFLINE" }),
  ).toBeVisible();
  await p
    .getByRole("button", { name: "Lịch sử cuộc gọi", exact: true })
    .click();
  await expect(
    p.getByText("Đã hoàn tất", { exact: true }).first(),
  ).toBeVisible();
  await p.screenshot({
    path: "test-results/patient-history.png",
    fullPage: true,
  });
  await d.screenshot({
    path: "test-results/doctor-dashboard.png",
    fullPage: true,
  });
  await doctor.close();
  await patient.close();
});
test("mobile login has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Đăng nhập HealthConnect" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-login.png",
    fullPage: true,
  });
});
