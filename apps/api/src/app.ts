import "reflect-metadata";
import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Headers,
  Module,
  ValidationPipe,
  ParseUUIDPipe,
  ForbiddenException,
  Catch,
  HttpException,
  type ExceptionFilter,
  type ArgumentsHost,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { IsIn, IsUUID } from "class-validator";
import type { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { Server } from "socket.io";
import { AuthController } from "./auth";
import { authenticate } from "./security";
import { db } from "./db";
import { calls } from "./calls";

@Catch()
class SafeExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      response.status(error.getStatus()).json(error.getResponse());
      return;
    }
    console.error("Internal request failure");
    response
      .status(500)
      .json({ statusCode: 500, message: "Có lỗi máy chủ. Vui lòng thử lại." });
  }
}

class CreateCallDto {
  @IsUUID() doctorId!: string;
}
class AvailabilityDto {
  @IsIn(["ONLINE", "OFFLINE", "BREAK"]) status!: "ONLINE" | "OFFLINE" | "BREAK";
}
const validate = (type: any) =>
  new ValidationPipe({
    expectedType: type,
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
@Controller()
class HealthController {
  @Get("health") async health() {
    await db.$queryRaw`SELECT 1`;
    return { status: "ok", video: "DEMO", timezone: "Asia/Ho_Chi_Minh" };
  }
  @Get("facilities") async facilities() {
    return db.facility.findMany({
      select: { id: true, name: true, tenant: { select: { name: true } } },
      take: 100,
    });
  }
}
@Controller("doctors")
class DoctorsController {
  @Get() async list(@Req() req: Request) {
    const user = await authenticate(req.headers.cookie);
    const items = await db.user.findMany({
      where: {
        role: "DOCTOR",
        tenantId: user.tenantId,
        facilityId: user.facilityId,
      },
      select: {
        id: true,
        name: true,
        specialty: true,
        availability: true,
        heartbeatAt: true,
        facility: { select: { name: true } },
      },
      take: 50,
      orderBy: { name: "asc" },
    });
    return items.map(({ heartbeatAt, ...doctor }) => ({
      ...doctor,
      availability:
        doctor.availability === "ONLINE" &&
        (!heartbeatAt ||
          Date.now() - heartbeatAt.getTime() >
            Number(process.env.PRESENCE_TIMEOUT_SECONDS || 45) * 1000)
          ? "OFFLINE"
          : doctor.availability,
    }));
  }
  @Post("availability") async availability(
    @Req() req: Request,
    @Body(validate(AvailabilityDto)) body: AvailabilityDto,
  ) {
    return calls.availability(
      await authenticate(req.headers.cookie),
      body.status,
    );
  }
  @Post("heartbeat") async heartbeat(@Req() req: Request) {
    return calls.heartbeat(await authenticate(req.headers.cookie));
  }
}
@Controller("calls")
class CallsController {
  @Get() async list(@Req() req: Request) {
    return calls.list(await authenticate(req.headers.cookie));
  }
  @Get(":id") async get(
    @Req() req: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return calls.get(await authenticate(req.headers.cookie), id);
  }
  @Post() async create(
    @Req() req: Request,
    @Body(validate(CreateCallDto)) body: CreateCallDto,
    @Headers("idempotency-key") key: string,
  ) {
    if (!key || !/^[a-zA-Z0-9-]{8,100}$/.test(key))
      throw new ForbiddenException("Cần Idempotency-Key hợp lệ");
    return calls.create(
      await authenticate(req.headers.cookie),
      body.doctorId,
      key,
    );
  }
  @Post(":id/:action") async action(
    @Req() req: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("action") action: string,
  ) {
    if (!["accept", "reject", "cancel", "join", "complete"].includes(action))
      throw new ForbiddenException();
    return calls.action(
      await authenticate(req.headers.cookie),
      id,
      action as "accept" | "reject" | "cancel" | "join" | "complete",
    );
  }
}
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
  controllers: [
    HealthController,
    AuthController,
    DoctorsController,
    CallsController,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class AppModule {}
export async function createApp() {
  if (process.env.ZOOM_PROVIDER && process.env.ZOOM_PROVIDER !== "mock")
    throw new Error(
      "Only MockZoomProvider is implemented; real Zoom is not configured.",
    );
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === "test" ? false : ["error", "warn", "log"],
  });
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new SafeExceptionFilter());
  app.use(helmet());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (req.headers["x-requested-with"] !== "HealthConnect" ||
        (req.headers.origin &&
          req.headers.origin !==
            (process.env.WEB_ORIGIN || "http://localhost:3000")))
    )
      return res.status(403).json({ message: "Yêu cầu không hợp lệ" });
    next();
  });
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("HealthConnect — Phase 1 / DEMO")
      .setVersion("0.1")
      .addCookieAuth("hc_session")
      .build(),
  );
  SwaggerModule.setup("api/docs", app, document);
  const io = new Server(app.getHttpServer(), {
    path: "/socket.io",
    addTrailingSlash: false,
    cors: {
      origin: process.env.WEB_ORIGIN || "http://localhost:3000",
      credentials: true,
    },
    allowRequest: (req, callback) =>
      callback(
        null,
        !req.headers.origin ||
          req.headers.origin ===
            (process.env.WEB_ORIGIN || "http://localhost:3000"),
      ),
  });
  io.use(async (socket, next) => {
    try {
      socket.data.user = await authenticate(socket.request.headers.cookie);
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });
  io.on("connection", (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);
    const expiry = setInterval(async () => {
      try {
        await authenticate(socket.request.headers.cookie);
      } catch {
        socket.disconnect(true);
      }
    }, 15000);
    socket.on("doctor:heartbeat", async (_payload, ack) => {
      try {
        await authenticate(socket.request.headers.cookie);
        const result = await calls.heartbeat(user);
        if (typeof ack === "function") ack(result);
      } catch {
        socket.disconnect(true);
      }
    });
    socket.on("disconnect", () => {
      clearInterval(expiry);
      if (user.role === "DOCTOR")
        setTimeout(() => {
          if (!io.sockets.adapter.rooms.get(`user:${user.id}`)?.size)
            void calls.availability(user, "OFFLINE").catch(() => {});
        }, 1000).unref();
    });
  });
  const eventNames: Record<string, string> = {
    RINGING: "incoming",
    MEETING_READY: "meeting_ready",
    IN_PROGRESS: "started",
    REJECTED: "rejected",
    CANCELLED: "cancelled",
    TIMEOUT: "timeout",
    COMPLETED: "completed",
    FAILED: "failed",
  };
  calls.notify = (call) => {
    void (async () => {
      const participants = await io
        .in(`user:${call.patientId}`)
        .in(`user:${call.doctorId}`)
        .fetchSockets();
      for (const socket of participants) {
        try {
          await authenticate(socket.handshake.headers.cookie);
          socket.emit(`call:${eventNames[call.state] || "updated"}`, {
            id: call.id,
            state: call.state,
          });
        } catch {
          socket.disconnect(true);
        }
      }
    })().catch(() => console.error("Realtime delivery failed"));
  };
  let ticking = false;
  const timer = setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      await calls.tick();
    } catch {
      console.error("Call maintenance failed");
    } finally {
      ticking = false;
    }
  }, 1000);
  timer.unref();
  const close = app.close.bind(app);
  app.close = async () => {
    clearInterval(timer);
    io.close();
    await close();
  };
  await app.init();
  return app;
}
