import "dotenv/config";
import { db } from "../apps/api/src/db";
import { hashPassword } from "../apps/api/src/security";
async function seed() {
  if (process.env.SEED_DEMO !== "true" || process.env.NODE_ENV === "production")
    throw new Error("Demo seed requires SEED_DEMO=true outside production");
  for (const [index, name] of [
    "Sở Y tế Demo TP.HCM",
    "Sở Y tế Demo Đà Nẵng",
  ].entries()) {
    const tenantId = `00000000-0000-4000-8000-00000000000${index + 1}`;
    const facilityId = `10000000-0000-4000-8000-00000000000${index + 1}`;
    await db.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: { id: tenantId, name },
    });
    await db.facility.upsert({
      where: { id: facilityId },
      update: {},
      create: {
        id: facilityId,
        tenantId,
        name: index ? "Phòng khám Demo Đà Nẵng" : "Bệnh viện Demo Sài Gòn",
      },
    });
    for (const [role, email, display, specialty] of [
      [
        "DOCTOR",
        `doctor${index || ""}@demo.vn`,
        "BS. Nguyễn Minh Anh",
        "Nội tổng quát",
      ],
      ["PATIENT", `patient${index || ""}@demo.vn`, "Trần Hoàng An", null],
      ["PATIENT", `patient-extra${index}@demo.vn`, "Lê Minh Khang", null],
      ["FACILITY_ADMIN", `admin${index || ""}@demo.vn`, "Quản trị cơ sở", null],
    ] as const) {
      await db.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          name: display,
          role,
          tenantId,
          facilityId,
          specialty,
          passwordHash: hashPassword("DemoHealth@2026"),
        },
      });
    }
  }
  console.log(
    "Demo seed ready: patient@demo.vn / doctor@demo.vn (see README for local demo password).",
  );
}
seed().finally(() => db.$disconnect());
