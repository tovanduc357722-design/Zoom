import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { CallState, Prisma, User } from "@prisma/client";
import { db } from "./db";
import { MockZoomProvider, ZoomProvider } from "./zoom";
export const activeStates: CallState[] = [
  "PENDING",
  "RINGING",
  "ACCEPTED",
  "MEETING_CREATING",
  "MEETING_READY",
  "IN_PROGRESS",
];
const transitions: Partial<Record<CallState, CallState[]>> = {
  PENDING: ["RINGING"],
  RINGING: ["ACCEPTED", "REJECTED", "CANCELLED", "TIMEOUT"],
  ACCEPTED: ["MEETING_CREATING"],
  MEETING_CREATING: ["MEETING_READY", "FAILED"],
  MEETING_READY: ["IN_PROGRESS", "COMPLETED"],
  IN_PROGRESS: ["COMPLETED"],
};
export function assertTransition(from: CallState, to: CallState) {
  if (!transitions[from]?.includes(to))
    throw new ConflictException("Trạng thái cuộc gọi không hợp lệ");
}
export class CallService {
  notify: (call: any) => void = () => {};
  constructor(private provider: ZoomProvider = new MockZoomProvider()) {}
  private async lock(
    tx: Prisma.TransactionClient,
    doctorId: string,
    patientId: string,
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${doctorId}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${patientId}))`;
  }
  async get(user: User, id: string) {
    const call = await db.call.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        facilityId: user.facilityId,
        OR: [{ patientId: user.id }, { doctorId: user.id }],
      },
      include: {
        consultation: { include: { meeting: true } },
        doctor: { select: { name: true } },
        patient: { select: { name: true } },
      },
    });
    if (!call) throw new NotFoundException("Không tìm thấy cuộc gọi");
    return call;
  }
  async list(user: User) {
    return db.call.findMany({
      where: {
        tenantId: user.tenantId,
        facilityId: user.facilityId,
        OR: [{ patientId: user.id }, { doctorId: user.id }],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        doctor: { select: { name: true } },
        patient: { select: { name: true } },
      },
    });
  }
  async create(user: User, doctorId: string, key: string) {
    if (user.role !== "PATIENT") throw new ForbiddenException();
    const call = await db.$transaction(async (tx) => {
      await this.lock(tx, doctorId, user.id);
      const previous = await tx.call.findUnique({
        where: {
          patientId_idempotencyKey: { patientId: user.id, idempotencyKey: key },
        },
      });
      if (previous) {
        if (previous.doctorId !== doctorId)
          throw new ConflictException("Idempotency key đã dùng");
        return previous;
      }
      const doctor = await tx.user.findFirst({
        where: {
          id: doctorId,
          tenantId: user.tenantId,
          facilityId: user.facilityId,
          role: "DOCTOR",
        },
      });
      if (!doctor) throw new NotFoundException("Không tìm thấy bác sĩ");
      if (
        doctor.availability !== "ONLINE" ||
        !doctor.heartbeatAt ||
        Date.now() - doctor.heartbeatAt.getTime() > presenceMs()
      )
        throw new ConflictException("Bác sĩ hiện không sẵn sàng");
      if (
        await tx.call.count({
          where: {
            OR: [{ doctorId }, { patientId: user.id }],
            state: { in: activeStates },
          },
        })
      )
        throw new ConflictException("Bạn hoặc bác sĩ đang có cuộc gọi");
      const created = await tx.call.create({
        data: {
          tenantId: user.tenantId,
          facilityId: user.facilityId,
          patientId: user.id,
          doctorId,
          idempotencyKey: key,
          expiresAt: new Date(
            Date.now() + Number(process.env.CALL_TIMEOUT_SECONDS || 30) * 1000,
          ),
          state: "RINGING",
        },
      });
      await tx.user.update({
        where: { id: doctorId },
        data: { availability: "RINGING" },
      });
      return created;
    });
    this.notify(call);
    return call;
  }
  async action(
    user: User,
    id: string,
    action: "accept" | "reject" | "cancel" | "join" | "complete",
  ) {
    const existing = await this.get(user, id);
    const doctorAction = ["accept", "reject", "complete"].includes(action);
    if (
      (doctorAction &&
        (user.id !== existing.doctorId || user.role !== "DOCTOR")) ||
      (action === "cancel" && user.id !== existing.patientId)
    )
      throw new ForbiddenException();
    const result = await db.$transaction(async (tx) => {
      await this.lock(tx, existing.doctorId, existing.patientId);
      let call = await tx.call.findUniqueOrThrow({ where: { id } });
      const doctor = await tx.user.findUniqueOrThrow({
        where: { id: call.doctorId },
      });
      if (call.state === "RINGING" && call.expiresAt <= new Date()) {
        call = await tx.call.update({
          where: { id },
          data: { state: "TIMEOUT", endedAt: new Date() },
        });
        await tx.user.update({
          where: { id: doctor.id },
          data: { availability: "OFFLINE" },
        });
        return { call, expired: true };
      }
      const set = async (state: CallState) => {
        assertTransition(call.state, state);
        call = await tx.call.update({ where: { id }, data: { state } });
      };
      if (action === "accept") {
        if (
          ["MEETING_READY", "IN_PROGRESS", "COMPLETED", "FAILED"].includes(
            call.state,
          )
        )
          return { call };
        if (
          doctor.availability !== "RINGING" ||
          !doctor.heartbeatAt ||
          Date.now() - doctor.heartbeatAt.getTime() > presenceMs()
        )
          throw new ConflictException("Bác sĩ không còn sẵn sàng");
        await set("ACCEPTED");
        await tx.user.update({
          where: { id: doctor.id },
          data: { availability: "BUSY" },
        });
        await set("MEETING_CREATING");
        const consultation = await tx.consultation.create({
          data: { callId: id },
        });
        try {
          const meeting = await this.provider.createMeeting(id);
          await tx.zoomMeeting.create({
            data: { consultationId: consultation.id, ...meeting },
          });
          await set("MEETING_READY");
        } catch {
          await set("FAILED");
          await tx.user.update({
            where: { id: doctor.id },
            data: { availability: "OFFLINE" },
          });
          await tx.call.update({
            where: { id },
            data: { endedAt: new Date() },
          });
        }
      } else if (action === "join") {
        if (call.state === "IN_PROGRESS") return { call };
        await set("IN_PROGRESS");
      } else {
        const target = {
          reject: "REJECTED",
          cancel: "CANCELLED",
          complete: "COMPLETED",
        }[action] as CallState;
        if (call.state === target) return { call };
        await set(target);
        call = await tx.call.update({
          where: { id },
          data: { endedAt: new Date() },
        });
        await tx.user.update({
          where: { id: doctor.id },
          data: { availability: "OFFLINE" },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorId: user.id,
          targetId: id,
          action: `call:${action}`,
        },
      });
      return { call };
    });
    this.notify(result.call);
    if (result.expired)
      throw new ConflictException("Cuộc gọi đã hết thời gian chờ");
    return this.get(user, id);
  }
  async availability(user: User, status: "ONLINE" | "OFFLINE" | "BREAK") {
    if (user.role !== "DOCTOR") throw new ForbiddenException();
    return db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
      if (
        await tx.call.count({
          where: { doctorId: user.id, state: { in: activeStates } },
        })
      )
        throw new ConflictException("Đang có cuộc gọi");
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { availability: status, heartbeatAt: new Date() },
      });
      return { availability: updated.availability };
    });
  }
  async heartbeat(user: User) {
    if (user.role !== "DOCTOR") throw new ForbiddenException();
    await db.user.update({
      where: { id: user.id },
      data: { heartbeatAt: new Date() },
    });
    return { ok: true };
  }
  async tick() {
    const ringing = await db.call.findMany({
      where: {
        state: "RINGING",
        OR: [
          { expiresAt: { lte: new Date() } },
          {
            doctor: {
              heartbeatAt: { lt: new Date(Date.now() - presenceMs()) },
            },
          },
        ],
      },
    });
    for (const item of ringing) {
      const updated = await db.$transaction(async (tx) => {
        await this.lock(tx, item.doctorId, item.patientId);
        const call = await tx.call.findUniqueOrThrow({
          where: { id: item.id },
        });
        const doctor = await tx.user.findUniqueOrThrow({
          where: { id: item.doctorId },
        });
        if (
          call.state !== "RINGING" ||
          (call.expiresAt > new Date() &&
            doctor.heartbeatAt &&
            Date.now() - doctor.heartbeatAt.getTime() <= presenceMs())
        )
          return null;
        await tx.user.update({
          where: { id: item.doctorId },
          data: { availability: "OFFLINE" },
        });
        return tx.call.update({
          where: { id: item.id },
          data: { state: "TIMEOUT", endedAt: new Date() },
        });
      });
      if (updated) this.notify(updated);
    }
    await db.user.updateMany({
      where: {
        role: "DOCTOR",
        availability: "ONLINE",
        heartbeatAt: { lt: new Date(Date.now() - presenceMs()) },
      },
      data: { availability: "OFFLINE" },
    });
  }
}
export const presenceMs = () =>
  Number(process.env.PRESENCE_TIMEOUT_SECONDS || 45) * 1000;
export const calls = new CallService();
