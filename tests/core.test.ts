import "dotenv/config";
import "reflect-metadata";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { io, Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import { db } from "../apps/api/src/db";
import { createApp } from "../apps/api/src/app";
import { CallService, calls, assertTransition } from "../apps/api/src/calls";
import type { INestApplication } from "@nestjs/common";
process.env.NODE_ENV = "test";
let app: INestApplication;
let server: any;
let patientCookie: string,
  doctorCookie: string,
  otherCookie: string,
  extraCookie: string,
  adminCookie: string;
let doctorId: string;
const sockets: Socket[] = [];
const post = (cookie: string, path: string, body: object = {}) =>
  request(server)
    .post(`/api/v1${path}`)
    .set("Cookie", cookie)
    .set("X-Requested-With", "HealthConnect")
    .send(body);
async function login(email: string) {
  const r = await post("", "/auth/login", {
    email,
    password: "DemoHealth@2026",
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { cookie: r.headers["set-cookie"][0].split(";")[0], user: r.body };
}
async function online() {
  await post(doctorCookie, "/doctors/availability", {
    status: "ONLINE",
  }).expect(201);
}
async function create(cookie = patientCookie) {
  const r = await post(cookie, "/calls", { doctorId }).set(
    "Idempotency-Key",
    randomUUID(),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
async function finish() {
  for (const c of await db.call.findMany({
    where: { state: { in: ["RINGING", "MEETING_READY", "IN_PROGRESS"] } },
  })) {
    const user = await db.user.findUniqueOrThrow({
      where: { id: c.state === "RINGING" ? c.patientId : c.doctorId },
    });
    await calls.action(
      user,
      c.id,
      c.state === "RINGING" ? "cancel" : "complete",
    );
  }
}
before(async () => {
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  server = app.getHttpServer();
  ({ cookie: patientCookie } = await login("patient@demo.vn"));
  ({
    cookie: doctorCookie,
    user: { id: doctorId },
  } = await login("doctor@demo.vn"));
  ({ cookie: otherCookie } = await login("patient1@demo.vn"));
  ({ cookie: extraCookie } = await login("patient-extra0@demo.vn"));
  ({ cookie: adminCookie } = await login("admin@demo.vn"));
  await finish();
});
after(async () => {
  for (const s of sockets) s.disconnect();
  await finish();
  await app.close();
  await db.$disconnect();
});
test("authentication, validation, role escalation and CSRF protections", async () => {
  await request(server).get("/api/v1/doctors").expect(401);
  await post("", "/auth/login", {
    email: "patient@demo.vn",
    password: "incorrect-password",
  }).expect(401);
  await request(server)
    .post("/api/v1/auth/login")
    .send({ email: "patient@demo.vn", password: "DemoHealth@2026" })
    .expect(403);
  await post("", "/auth/register", {
    email: `${randomUUID()}@demo.vn`,
    password: "DemoHealth@2026",
    name: "Test",
    facilityId: "10000000-0000-4000-8000-000000000001",
    role: "DOCTOR",
  }).expect(400);
  await post(patientCookie, "/doctors/availability", {
    status: "ONLINE",
  }).expect(403);
  await post(patientCookie, "/calls", { doctorId: "invalid" })
    .set("Idempotency-Key", randomUUID())
    .expect(400);
});
test("register creates only a patient; logout revokes session", async () => {
  const email = `test-${randomUUID()}@example.vn`;
  const r = await post("", "/auth/register", {
    email,
    password: "NewPatient@2026",
    name: "Bệnh nhân kiểm thử",
    facilityId: "10000000-0000-4000-8000-000000000001",
  }).expect(201);
  assert.equal(r.body.role, "PATIENT");
  assert.equal(r.body.passwordHash, undefined);
  const cookie = r.headers["set-cookie"][0].split(";")[0];
  await post(cookie, "/auth/logout").expect(201);
  await request(server)
    .get("/api/v1/auth/me")
    .set("Cookie", cookie)
    .expect(401);
  await db.user.delete({ where: { email } });
});
test("tenant scoping and facility admin cannot make calls", async () => {
  const r = await request(server)
    .get("/api/v1/doctors")
    .set("Cookie", otherCookie)
    .expect(200);
  assert.ok(r.body.length > 0);
  assert.ok(!r.body.some((d: any) => d.id === doctorId));
  await post(otherCookie, "/calls", { doctorId })
    .set("Idempotency-Key", randomUUID())
    .expect(404);
  await post(adminCookie, "/calls", { doctorId })
    .set("Idempotency-Key", randomUUID())
    .expect(403);
});
test("offline doctor rejects direct call", async () => {
  await post(doctorCookie, "/doctors/availability", {
    status: "OFFLINE",
  }).expect(201);
  await post(patientCookie, "/calls", { doctorId })
    .set("Idempotency-Key", randomUUID())
    .expect(409);
});
test("online call, idempotency, accept, authorized join, complete and manual online policy", async () => {
  await online();
  const key = randomUUID();
  const c = await post(patientCookie, "/calls", { doctorId })
    .set("Idempotency-Key", key)
    .expect(201);
  const repeat = await post(patientCookie, "/calls", { doctorId })
    .set("Idempotency-Key", key)
    .expect(201);
  assert.equal(c.body.id, repeat.body.id);
  await post(extraCookie, `/calls/${c.body.id}/accept`).expect(404);
  await post(patientCookie, `/calls/${c.body.id}/accept`).expect(403);
  const accepted = await Promise.all([
    post(doctorCookie, `/calls/${c.body.id}/accept`),
    post(doctorCookie, `/calls/${c.body.id}/accept`),
  ]);
  assert.ok(accepted.every((r) => r.status === 201));
  assert.equal(
    await db.consultation.count({ where: { callId: c.body.id } }),
    1,
  );
  assert.equal(accepted[0].body.state, "MEETING_READY");
  assert.equal(accepted[0].body.consultation.meeting.provider, "mock");
  assert.ok(!JSON.stringify(accepted[0].body).includes("passwordHash"));
  await post(doctorCookie, "/doctors/availability", {
    status: "ONLINE",
  }).expect(409);
  await post(otherCookie, `/calls/${c.body.id}/join`).expect(404);
  await post(extraCookie, `/calls/${c.body.id}/join`).expect(404);
  await post(patientCookie, `/calls/${c.body.id}/join`).expect(201);
  await post(doctorCookie, `/calls/${c.body.id}/complete`).expect(201);
  const doctor = await db.user.findUniqueOrThrow({ where: { id: doctorId } });
  assert.equal(doctor.availability, "OFFLINE");
});
test("two patients racing reserve one doctor; busy doctor cannot receive second call", async () => {
  await online();
  const results = await Promise.all([
    post(patientCookie, "/calls", { doctorId }).set(
      "Idempotency-Key",
      randomUUID(),
    ),
    post(extraCookie, "/calls", { doctorId }).set(
      "Idempotency-Key",
      randomUUID(),
    ),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const c = results.find((r) => r.status === 201)!.body;
  await post(doctorCookie, `/calls/${c.id}/accept`).expect(201);
  await post(extraCookie, "/calls", { doctorId })
    .set("Idempotency-Key", randomUUID())
    .expect(409);
  await post(doctorCookie, `/calls/${c.id}/complete`).expect(201);
});
test("reject, cancel and forbidden transitions", async () => {
  await online();
  let c = await create();
  await post(doctorCookie, `/calls/${c.id}/reject`).expect(201);
  await post(doctorCookie, `/calls/${c.id}/accept`).expect(409);
  await online();
  c = await create();
  await post(patientCookie, `/calls/${c.id}/cancel`).expect(201);
  await post(doctorCookie, `/calls/${c.id}/accept`).expect(409);
  assert.equal(await db.consultation.count({ where: { callId: c.id } }), 0);
  assert.throws(() => assertTransition("COMPLETED", "RINGING"));
});
test("timeout survives new service instance and prevents late accept", async () => {
  await online();
  const c = await create();
  await db.call.update({
    where: { id: c.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await new CallService().tick();
  assert.equal(
    (await db.call.findUniqueOrThrow({ where: { id: c.id } })).state,
    "TIMEOUT",
  );
  await post(doctorCookie, `/calls/${c.id}/accept`).expect(409);
});
test("mock meeting provider failure releases doctor without duplicate creation", async () => {
  await online();
  const c = await create();
  let attempts = 0;
  const broken = new CallService({
    async createMeeting() {
      attempts++;
      throw new Error("private upstream detail");
    },
  });
  const doctor = await db.user.findUniqueOrThrow({ where: { id: doctorId } });
  const result = await broken.action(doctor, c.id, "accept");
  assert.equal(result.state, "FAILED");
  await broken.action(doctor, c.id, "accept");
  assert.equal(attempts, 1);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: doctorId } })).availability,
    "OFFLINE",
  );
});
test("stale heartbeat expires ringing call; active consultation preserved after restart", async () => {
  await online();
  const c = await create();
  await db.user.update({
    where: { id: doctorId },
    data: { heartbeatAt: new Date(0) },
  });
  await calls.tick();
  assert.equal(
    (await db.call.findUniqueOrThrow({ where: { id: c.id } })).state,
    "TIMEOUT",
  );
  await online();
  const running = await create();
  await post(doctorCookie, `/calls/${running.id}/accept`).expect(201);
  await db.user.update({
    where: { id: doctorId },
    data: { heartbeatAt: new Date(0) },
  });
  await new CallService().tick();
  assert.equal(
    (await db.call.findUniqueOrThrow({ where: { id: running.id } })).state,
    "MEETING_READY",
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: doctorId } })).availability,
    "BUSY",
  );
  await post(doctorCookie, `/calls/${running.id}/complete`).expect(201);
});
test("authenticated realtime incoming event, tenant isolation and disconnect recovery", async () => {
  const url = await app.getUrl();
  const connect = async (cookie: string) => {
    const s = io(url, {
      extraHeaders: { Cookie: cookie },
      transports: ["websocket"],
      reconnection: false,
    });
    sockets.push(s);
    await new Promise<void>((resolve, reject) => {
      s.once("connect", () => resolve());
      s.once("connect_error", reject);
    });
    return s;
  };
  const anonymous = io(url, { transports: ["websocket"], reconnection: false });
  sockets.push(anonymous);
  await new Promise<void>((resolve, reject) => {
    anonymous.once("connect_error", () => resolve());
    anonymous.once("connect", () =>
      reject(new Error("anonymous socket connected")),
    );
  });
  const ds = await connect(doctorCookie),
    outsider = await connect(otherCookie);
  let leaked = false;
  outsider.on("call:incoming", () => {
    leaked = true;
  });
  await online();
  const incoming = new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("missing event")), 3000);
    ds.once("call:incoming", (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
  const c = await create();
  assert.equal((await incoming).id, c.id);
  assert.equal(leaked, false);
  await post(patientCookie, `/calls/${c.id}/cancel`).expect(201);
  await online();
  ds.disconnect();
  await new Promise((r) => setTimeout(r, 1300));
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: doctorId } })).availability,
    "OFFLINE",
  );
  outsider.disconnect();
});
test("application restart retains accepted consultation and expires persisted ringing request", async () => {
  await online();
  const c = await create();
  await post(doctorCookie, `/calls/${c.id}/accept`).expect(201);
  await app.close();
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  server = app.getHttpServer();
  const read = await request(server)
    .get(`/api/v1/calls/${c.id}`)
    .set("Cookie", patientCookie)
    .expect(200);
  assert.equal(read.body.state, "MEETING_READY");
  await post(doctorCookie, `/calls/${c.id}/complete`).expect(201);
  await online();
  const pending = await create();
  await db.call.update({
    where: { id: pending.id },
    data: { expiresAt: new Date(0) },
  });
  await app.close();
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  server = app.getHttpServer();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.equal(
    (await db.call.findUniqueOrThrow({ where: { id: pending.id } })).state,
    "TIMEOUT",
  );
});
