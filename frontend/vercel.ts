type VercelConfig = {
  rewrites: Array<{ source: string; destination: string }>;
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};

const backendUrl = process.env.BACKEND_URL?.trim();

if (!backendUrl) {
  throw new Error("BACKEND_URL must be configured separately for Vercel Preview and Production deployments.");
}

if (!/^https:\/\//i.test(backendUrl) || /localhost|127\.0\.0\.1/i.test(backendUrl)) {
  throw new Error("BACKEND_URL must be an HTTPS non-local deployment origin.");
}

export const config: VercelConfig = {
  rewrites: [
    {
      source: "/api/:path*",
      destination: `${backendUrl.replace(/\/$/, "")}/api/:path*`,
    },
    {
      source: "/(.*)",
      destination: "/index.html",
    },
  ],
  headers: [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
      ],
    },
  ],
};
