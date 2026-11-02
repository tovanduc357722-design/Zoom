import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  ConflictException,
  ValidationPipe,
} from "@nestjs/common";
import { IsEmail, IsString, IsUUID, Length } from "class-validator";
import type { Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { db } from "./db";
import {
  authenticate,
  createSession,
  digest,
  hashPassword,
  publicUser,
  verifyPassword,
} from "./security";
class LoginDto {
  @IsEmail() email!: string;
  @IsString() @Length(12, 128) password!: string;
}
class RegisterDto extends LoginDto {
  @IsString() @Length(2, 100) name!: string;
  @IsUUID() facilityId!: string;
}
@Controller("auth")
export class AuthController {
  private cookie(res: Response, token: string) {
    res.cookie("hc_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 3600_000,
      path: "/",
    });
  }
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("register")
  async register(
    @Body(
      new ValidationPipe({
        expectedType: RegisterDto,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const facility = await db.facility.findUnique({
      where: { id: body.facilityId },
    });
    if (!facility) throw new ConflictException("Cơ sở không tồn tại");
    try {
      const user = await db.user.create({
        data: {
          email: body.email.toLowerCase(),
          name: body.name,
          passwordHash: hashPassword(body.password),
          role: "PATIENT",
          tenantId: facility.tenantId,
          facilityId: facility.id,
        },
      });
      this.cookie(res, await createSession(user.id));
      return publicUser(user);
    } catch (error: any) {
      if (error.code === "P2002")
        throw new ConflictException("Email đã được sử dụng");
      throw error;
    }
  }
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("login")
  async login(
    @Body(
      new ValidationPipe({
        expectedType: LoginDto,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await db.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });
    const valid = verifyPassword(
      body.password,
      user?.passwordHash ?? hashPassword("constant-dummy-password"),
    );
    if (!user || !valid)
      throw new UnauthorizedException("Thông tin đăng nhập không đúng");
    this.cookie(res, await createSession(user.id));
    return publicUser(user);
  }
  @Get("me") async me(@Req() req: Request) {
    return publicUser(await authenticate(req.headers.cookie));
  }
  @Post("logout") async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("hc_session="))
      ?.slice(11);
    if (token)
      await db.session.deleteMany({ where: { tokenHash: digest(token) } });
    res.clearCookie("hc_session", { path: "/" });
    return { ok: true };
  }
}
