"use client";
import { useCallback, useEffect, useState } from "react";
import { io } from "socket.io-client";
import {
  Activity,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  HeartPulse,
  Hospital,
  LogOut,
  Phone,
  PhoneOff,
  Search,
  ShieldCheck,
  Stethoscope,
  Video,
  X,
} from "lucide-react";
import { Button } from "../components/ui/button";
type User = { id: string; name: string; role: string; availability: string };
type Doctor = {
  id: string;
  name: string;
  specialty: string;
  availability: string;
  facility: { name: string };
};
type Call = {
  id: string;
  state: string;
  doctor: { name: string };
  patient: { name: string };
  createdAt: string;
};
const active = ["RINGING", "MEETING_READY", "IN_PROGRESS"];
const labels: Record<string, string> = {
  RINGING: "Đang chờ bác sĩ trả lời",
  MEETING_READY: "Phòng DEMO đã sẵn sàng",
  IN_PROGRESS: "Đang trong phiên DEMO",
  REJECTED: "Bác sĩ đã từ chối",
  CANCELLED: "Đã hủy",
  TIMEOUT: "Hết thời gian chờ",
  COMPLETED: "Đã hoàn tất",
  FAILED: "Không tạo được phòng DEMO",
};
async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "HealthConnect",
      "Idempotency-Key": crypto.randomUUID(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join(", ")
        : data.message || "Không thể kết nối. Vui lòng thử lại.",
    );
  return data;
}
export default function Home() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [doctors, setDoctors] = useState<Doctor[]>([]),
    [calls, setCalls] = useState<Call[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [specialty, setSpecialty] = useState("Tất cả"),
    [onlyOnline, setOnlyOnline] = useState(false),
    [tab, setTab] = useState("doctors"),
    [register, setRegister] = useState(false),
    [facilities, setFacilities] = useState<{ id: string; name: string }[]>([]),
    [connected, setConnected] = useState(false);
  const refresh = useCallback(async () => {
    const [d, c] = await Promise.all([api("/doctors"), api("/calls")]);
    setDoctors(d);
    setCalls(c);
  }, []);
  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setReady(true));
    api("/facilities")
      .then(setFacilities)
      .catch(() => setError("Không kết nối được máy chủ."));
  }, []);
  useEffect(() => {
    if (!user) return;
    void refresh().catch((e) => setError(e.message));
    const socket = io({ transports: ["polling"],
      addTrailingSlash: false, withCredentials: true });
    socket.on("connect", () => {
      setConnected(true);
      void refresh().catch(() => {});
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    socket.onAny((event: string) => {
      if (event.startsWith("call:"))
        void refresh().catch((e) => setError(e.message));
    });
    const timer = setInterval(() => {
      void refresh().catch((e) => setError(e.message));
      if (user.role === "DOCTOR")
        void api("/doctors/heartbeat", "POST").catch(() => {});
    }, 10000);
    return () => {
      clearInterval(timer);
      socket.disconnect();
    };
  }, [user, refresh]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setBusy(false);
    }
  }
  const current = calls.find((c) => active.includes(c.state));
  const doctorMode = user?.role === "DOCTOR";
  const filtered = doctors.filter(
    (d) =>
      `${d.name} ${d.specialty} ${d.facility.name}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (specialty === "Tất cả" || d.specialty === specialty) &&
      (!onlyOnline || d.availability === "ONLINE"),
  );
  if (!ready)
    return (
      <main className="loading">
        <HeartPulse size={36} /> Đang tải HealthConnect…
      </main>
    );
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-icon">
            <HeartPulse />
          </span>
          HealthConnect<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Hospital size={21} />
          </span>
          <div>
            <b>Y tế trực tuyến</b>
            <small>Môi trường thử nghiệm</small>
          </div>
        </div>
        <p className="nav-label">KHÔNG GIAN CỦA BẠN</p>
        <nav>
          <button
            className={tab === "doctors" ? "selected" : ""}
            onClick={() => setTab("doctors")}
          >
            <Stethoscope size={19} />
            {doctorMode ? "Bảng điều khiển" : "Tìm bác sĩ"}
            <span className="nav-count">01</span>
          </button>
          <button
            className={tab === "history" ? "selected" : ""}
            onClick={() => setTab("history")}
          >
            <CalendarDays size={19} />
            Lịch sử cuộc gọi
          </button>
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={25} />
          <b>Kết nối có kiểm soát</b>
          <p>Chỉ bạn và bác sĩ được chỉ định có quyền tham gia phiên tư vấn.</p>
        </div>
        <div className="sidebar-bottom">
          <span className="tiny-dot" />{" "}
          {connected ? "Realtime đã kết nối" : "HealthConnect • DEMO"}
        </div>
      </aside>
      <div className="main">
        <header>
          <div className="breadcrumb">
            HealthConnect <span>/</span>{" "}
            {doctorMode ? "Dành cho bác sĩ" : "Dành cho bệnh nhân"}
          </div>
          <div className="header-right">
            <span className="demo-badge">DEMO</span>
            <Bell size={19} />
            {user && (
              <>
                <span className="avatar small">
                  {user.name.split(" ").at(-1)?.[0]}
                </span>
                <span className="user-name">{user.name}</span>
                <button
                  className="icon-button"
                  aria-label="Đăng xuất"
                  onClick={() =>
                    run(async () => {
                      await api("/auth/logout", "POST");
                      setUser(null);
                      setCalls([]);
                    })
                  }
                >
                  <LogOut size={18} />
                </button>
              </>
            )}
          </div>
        </header>
        <main className="content">
          {error && (
            <div role="alert" className="alert error">
              {error}
              <button aria-label="Đóng lỗi" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert">
              {notice}
            </div>
          )}
          {!user ? (
            <>
              <section className="intro">
                <div className="eyebrow">
                  <span className="tiny-dot" /> CHĂM SÓC SỨC KHỎE, GẦN HƠN
                </div>
                <h1>
                  Sức khỏe của bạn.
                  <br />
                  <em>Sự quan tâm của chúng tôi.</em>
                </h1>
                <p>
                  Kết nối bệnh nhân với bác sĩ mọi lúc, mọi nơi.
                  <br />
                  Đăng nhập để tìm bác sĩ và trải nghiệm luồng tư vấn.
                </p>
                <div className="intro-pills">
                  <span>
                    <ShieldCheck size={17} /> Phân quyền theo cơ sở
                  </span>
                  <span>
                    <Video size={17} /> Cuộc gọi DEMO
                  </span>
                </div>
              </section>
              <section className="login-layout">
                <div className="welcome-card">
                  <div className="illustration">
                    <div className="orbit" />
                    <div className="medical-cross">
                      <HeartPulse size={65} />
                    </div>
                    <span className="float-badge">
                      <Check size={17} /> Luôn sẵn sàng lắng nghe
                    </span>
                  </div>
                  <h2>
                    Một kết nối nhỏ.
                    <br />
                    An tâm thêm mỗi ngày.
                  </h2>
                  <p>
                    Chọn bác sĩ, gửi yêu cầu và nhận phản hồi trực tiếp trên
                    cùng một nền tảng.
                  </p>
                  <p className="demo-note">
                    Bản phát triển dùng dữ liệu giả. Chưa có video hoặc dịch vụ
                    khám bệnh thật.
                  </p>
                </div>
                <form
                  className="login-card"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void run(async () => {
                      const body = register
                        ? {
                            email: data.get("email"),
                            password: data.get("password"),
                            name: data.get("name"),
                            facilityId: data.get("facilityId"),
                          }
                        : {
                            email: data.get("email"),
                            password: data.get("password"),
                          };
                      setUser(
                        await api(
                          `/auth/${register ? "register" : "login"}`,
                          "POST",
                          body,
                        ),
                      );
                    });
                  }}
                >
                  <span className="eyebrow">CHÀO MỪNG BẠN</span>
                  <h2>
                    {register
                      ? "Tạo tài khoản bệnh nhân"
                      : "Đăng nhập HealthConnect"}
                  </h2>
                  <p>Tiếp tục hành trình chăm sóc sức khỏe của bạn.</p>
                  {register && (
                    <>
                      <label>
                        Họ và tên
                        <input
                          name="name"
                          required
                          minLength={2}
                          maxLength={100}
                        />
                      </label>
                      <label>
                        Cơ sở y tế
                        <select name="facilityId" required>
                          {facilities.map((f) => (
                            <option value={f.id} key={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
                      placeholder="ban@example.com"
                      autoComplete="email"
                      required
                    />
                  </label>
                  <label>
                    Mật khẩu
                    <input
                      name="password"
                      type="password"
                      minLength={12}
                      maxLength={128}
                      autoComplete={
                        register ? "new-password" : "current-password"
                      }
                      required
                    />
                  </label>
                  <Button disabled={busy} type="submit">
                    {busy
                      ? "Đang xử lý…"
                      : register
                        ? "Tạo tài khoản"
                        : "Đăng nhập"}
                    <ArrowRight size={18} />
                  </Button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setRegister(!register)}
                  >
                    {register
                      ? "Đã có tài khoản? Đăng nhập"
                      : "Chưa có tài khoản? Đăng ký"}
                  </button>
                  <div className="demo-login">
                    <b>Tài khoản thử nghiệm</b>
                    <p>
                      Bệnh nhân: patient@demo.vn
                      <br />
                      Bác sĩ: doctor@demo.vn
                      <br />
                      Mật khẩu: DemoHealth@2026
                    </p>
                    <small>
                      Dùng hai hồ sơ trình duyệt khác nhau để thử gọi.
                    </small>
                  </div>
                </form>
              </section>
            </>
          ) : (
            <>
              <section className="page-title">
                <div>
                  <div className="eyebrow">
                    {doctorMode
                      ? "KHÔNG GIAN BÁC SĨ"
                      : "CHĂM SÓC SỨC KHỎE CHỦ ĐỘNG"}
                  </div>
                  <h1>
                    {doctorMode
                      ? `Chào bác sĩ ${user.name.replace("BS. ", "")}`
                      : tab === "history"
                        ? "Lịch sử cuộc gọi"
                        : "Hôm nay, bạn cảm thấy thế nào?"}
                  </h1>
                  <p>
                    {doctorMode
                      ? "Quản lý trạng thái và tiếp nhận yêu cầu tư vấn của bạn."
                      : "Tìm người lắng nghe, kết nối với bác sĩ phù hợp với bạn."}
                  </p>
                </div>
                <span className="date-label">
                  {new Intl.DateTimeFormat("vi-VN", {
                    dateStyle: "long",
                    timeZone: "Asia/Ho_Chi_Minh",
                  }).format(new Date())}
                </span>
              </section>
              {doctorMode && (
                <section className="availability-panel">
                  <div>
                    <div className="eyebrow">TRẠNG THÁI TIẾP NHẬN</div>
                    <h2>
                      {doctors.find((d) => d.id === user.id)?.availability ===
                      "ONLINE"
                        ? "Bạn đang Online"
                        : "Trạng thái: " +
                          (doctors.find((d) => d.id === user.id)
                            ?.availability || "OFFLINE")}
                    </h2>
                    <p>Sau mỗi cuộc gọi, hãy bật Online để nhận yêu cầu mới.</p>
                  </div>
                  <div className="button-row">
                    <Button
                      disabled={busy || !!current}
                      onClick={() =>
                        run(async () => {
                          await api("/doctors/availability", "POST", {
                            status: "ONLINE",
                          });
                          await refresh();
                        })
                      }
                    >
                      Bật Online
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy || !!current}
                      onClick={() =>
                        run(async () => {
                          await api("/doctors/availability", "POST", {
                            status: "OFFLINE",
                          });
                          await refresh();
                        })
                      }
                    >
                      Offline
                    </Button>
                  </div>
                </section>
              )}
              {current && (
                <section className="call-panel" aria-live="polite">
                  <div className="call-icon">
                    <Phone size={25} />
                  </div>
                  <div>
                    <span className="eyebrow">CUỘC GỌI HIỆN TẠI • DEMO</span>
                    <h2>{labels[current.state]}</h2>
                    <p>
                      {doctorMode
                        ? current.patient?.name
                        : current.doctor?.name}
                      {current.state === "RINGING"
                        ? " · Tự hết hạn sau 30 giây"
                        : ""}
                    </p>
                    {current.state !== "RINGING" && (
                      <p>
                        Đây là phòng mô phỏng, chưa truyền âm thanh hoặc hình
                        ảnh.
                      </p>
                    )}
                  </div>
                  <div className="button-row">
                    {(current.state === "RINGING"
                      ? doctorMode
                        ? ["accept", "reject"]
                        : ["cancel"]
                      : current.state === "MEETING_READY"
                        ? ["join", ...(doctorMode ? ["complete"] : [])]
                        : doctorMode
                          ? ["complete"]
                          : []
                    ).map((action) => (
                      <Button
                        key={action}
                        variant={
                          ["reject", "cancel"].includes(action)
                            ? "outline"
                            : "default"
                        }
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api(`/calls/${current.id}/${action}`, "POST");
                            await refresh();
                          })
                        }
                      >
                        {
                          (
                            {
                              accept: "Chấp nhận",
                              reject: "Từ chối",
                              cancel: "Hủy yêu cầu",
                              join: "Vào phòng DEMO",
                              complete: "Kết thúc phiên",
                            } as Record<string, string>
                          )[action]
                        }
                      </Button>
                    ))}
                  </div>
                </section>
              )}
              {tab === "history" || doctorMode ? (
                <section className="section-card">
                  <div className="section-heading">
                    <h2>
                      {doctorMode ? "Yêu cầu tư vấn" : "Các cuộc gọi của bạn"}
                    </h2>
                    <span>{calls.length} cuộc gọi gần nhất</span>
                  </div>
                  {!calls.length ? (
                    <div className="empty">
                      <CalendarDays size={32} />
                      <h3>Chưa có cuộc gọi nào</h3>
                      <p>
                        {doctorMode
                          ? "Bật Online để bắt đầu nhận yêu cầu."
                          : "Các yêu cầu tư vấn của bạn sẽ xuất hiện tại đây."}
                      </p>
                    </div>
                  ) : (
                    calls.map((c) => (
                      <div className="history-row" key={c.id}>
                        <span className="avatar">
                          <Stethoscope size={22} />
                        </span>
                        <div>
                          <b>{doctorMode ? c.patient?.name : c.doctor?.name}</b>
                          <small>
                            {new Intl.DateTimeFormat("vi-VN", {
                              dateStyle: "medium",
                              timeStyle: "short",
                              timeZone: "Asia/Ho_Chi_Minh",
                            }).format(new Date(c.createdAt))}
                          </small>
                        </div>
                        <span className="status-tag">
                          {labels[c.state] || c.state}
                        </span>
                      </div>
                    ))
                  )}
                </section>
              ) : (
                <>
                  <section className="hero">
                    <div>
                      <span className="eyebrow">SỰ QUAN TÂM ĐÚNG LÚC</span>
                      <h2>
                        Không phải đi xa.
                        <br />
                        Vẫn được lắng nghe.
                      </h2>
                      <p>
                        Tìm bác sĩ tại cơ sở của bạn và bắt đầu
                        <br />
                        một cuộc trò chuyện khi bác sĩ sẵn sàng.
                      </p>
                      <span className="hero-label">
                        <ShieldCheck size={17} /> Chỉ hiển thị bác sĩ thuộc cơ
                        sở của bạn
                      </span>
                    </div>
                    <div className="hero-art">
                      <div className="art-circle">
                        <Stethoscope size={95} strokeWidth={1.2} />
                      </div>
                      <span className="art-card">
                        <HeartPulse size={24} />
                        <span>
                          Chăm sóc tận tâm<small>Kết nối trực tiếp</small>
                        </span>
                      </span>
                      <span className="art-spark">+</span>
                    </div>
                  </section>
                  <section className="doctors-section">
                    <div className="section-heading">
                      <div>
                        <h2>Tìm bác sĩ phù hợp</h2>
                        <p>Đội ngũ tại cơ sở y tế của bạn</p>
                      </div>
                      <span className="status-tag">
                        <span className="tiny-dot" />
                        {
                          doctors.filter((d) => d.availability === "ONLINE")
                            .length
                        }{" "}
                        bác sĩ Online
                      </span>
                    </div>
                    <div className="search-row">
                      <label className="search-box">
                        <Search size={19} />
                        <input
                          aria-label="Tìm bác sĩ"
                          placeholder="Tìm theo tên bác sĩ, chuyên khoa…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={onlyOnline}
                          onChange={(e) => setOnlyOnline(e.target.checked)}
                        />{" "}
                        Chỉ bác sĩ Online
                      </label>
                    </div>
                    <div className="filter-row">
                      {[
                        "Tất cả",
                        ...new Set(doctors.map((d) => d.specialty)),
                      ].map((s) => (
                        <button
                          className={specialty === s ? "active" : ""}
                          key={s}
                          onClick={() => setSpecialty(s)}
                        >
                          {s === "Tất cả" ? (
                            <Activity size={16} />
                          ) : (
                            <Stethoscope size={16} />
                          )}{" "}
                          {s}
                        </button>
                      ))}
                    </div>
                    <div className="doctor-grid">
                      {filtered.length ? (
                        filtered.map((d) => (
                          <article className="doctor-card" key={d.id}>
                            <div className="doctor-top">
                              <span className="doctor-avatar">
                                <Stethoscope size={42} strokeWidth={1.2} />
                              </span>
                              <span
                                className={
                                  "availability " +
                                  (d.availability === "ONLINE" ? "online" : "")
                                }
                              >
                                <span className="tiny-dot" />
                                {d.availability === "ONLINE"
                                  ? "Online"
                                  : d.availability === "BUSY" ||
                                      d.availability === "RINGING"
                                    ? "Đang bận"
                                    : "Offline"}
                              </span>
                            </div>
                            <span className="specialty">{d.specialty}</span>
                            <h3>
                              {d.name}
                              <ShieldCheck size={17} />
                            </h3>
                            <p className="facility">
                              <Hospital size={15} />
                              {d.facility.name}
                            </p>
                            <div className="doctor-details">
                              <span>Thông tin mẫu</span>
                              <span>Chỉ dùng thử nghiệm</span>
                            </div>
                            <Button
                              disabled={
                                busy ||
                                d.availability !== "ONLINE" ||
                                !!current ||
                                user.role !== "PATIENT"
                              }
                              onClick={() =>
                                run(async () => {
                                  await api("/calls", "POST", {
                                    doctorId: d.id,
                                  });
                                  await refresh();
                                })
                              }
                            >
                              <Phone size={17} />
                              {d.availability === "ONLINE"
                                ? "Gọi bác sĩ"
                                : "Hiện chưa sẵn sàng"}
                            </Button>
                          </article>
                        ))
                      ) : (
                        <div className="empty">
                          <Search size={30} />
                          <h3>Chưa tìm thấy bác sĩ phù hợp</h3>
                          <p>
                            Thử thay đổi bộ lọc hoặc quay lại khi bác sĩ Online.
                          </p>
                        </div>
                      )}
                    </div>
                  </section>
                  <div className="support-strip">
                    <ShieldCheck size={26} />
                    <div>
                      <b>Trải nghiệm thử nghiệm, minh bạch từ đầu</b>
                      <p>
                        Cuộc gọi hiện dùng MockZoomProvider. Không dùng cho cấp
                        cứu hoặc khám bệnh thật.
                      </p>
                    </div>
                    <PhoneOff size={22} />
                  </div>
                </>
              )}
            </>
          )}
          <footer>
            <span>© HealthConnect 2026</span>
            <span>Nền tảng khám bệnh trực tuyến · DEMO</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
