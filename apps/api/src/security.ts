import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import { db } from "./db";
export const digest = (v: string) =>
  createHash("sha256").update(v).digest("hex");
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(hash, "hex"),
  );
}
export async function authenticate(cookie = "") {
  const token = cookie
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("hc_session="))
    ?.slice(11);
  if (!token) throw new UnauthorizedException("Vui lòng đăng nhập");
  const session = await db.session.findUnique({
    where: { tokenHash: digest(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date())
    throw new UnauthorizedException("Phiên đã hết hạn");
  return session.user;
}
export function publicUser(user: Awaited<ReturnType<typeof authenticate>>) {
  const { id, name, role, tenantId, facilityId, specialty, availability } =
    user;
  return { id, name, role, tenantId, facilityId, specialty, availability };
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.session.create({
    data: {
      userId,
      tokenHash: digest(token),
      expiresAt: new Date(Date.now() + 8 * 3600_000),
    },
  });
  return token;
}
