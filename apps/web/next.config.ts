import type { NextConfig } from "next";
const config: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:4000/api/:path*",
      },
      {
        source: "/socket.io/:path*",
        destination: "http://127.0.0.1:4000/socket.io/:path*",
      },
    ];
  },
};
export default config;
