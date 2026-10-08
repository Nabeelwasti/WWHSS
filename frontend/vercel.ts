export const config = {
  rewrites: [
    {
      source: "/api/:path*",
      destination: "https://wwhss-backend-nabeel-wasti.vercel.app/api/:path*",
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
      source: "/api/:path*",
      headers: [
        { key: "x-vercel-enable-rewrite-caching", value: "0" },
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
