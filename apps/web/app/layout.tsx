import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "HealthConnect | Khám bệnh trực tuyến",
  description: "Kết nối bệnh nhân với bác sĩ — bản thử nghiệm DEMO",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
