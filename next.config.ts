import type { NextConfig } from "next";

const isProductionBuild = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // PDFKit metrics and PDF.js' Node worker resolve relative to their packages.
  serverExternalPackages: ["pdfkit", "pdfjs-dist"],
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
    // Page-data workers each load the server graph; keep builds within 8 GB.
    cpus: 1,
    staticGenerationMaxConcurrency: 4,
  },
  typescript: {
    // The production build only needs application sources. Test fixtures and
    // operational scripts are checked by their own commands and can otherwise
    // exhaust the build worker heap on constrained CI machines.
    tsconfigPath: isProductionBuild ? "tsconfig.build.json" : "tsconfig.json",
    // scripts/build.mjs sets this only after the standalone check succeeds.
    // Direct `next build` commands still perform the built-in check.
    ignoreBuildErrors: isProductionBuild && process.env.CELERIFLOW_TYPES_CHECKED === "1",
  },
  turbopack: {
    root: process.cwd(),
  },
  // Dynamic filesystem paths can make tracing pick up development archives.
  // These root folders are not runtime assets; public/docs is intentionally kept.
  outputFileTracingExcludes: {
    "/*": [
      "./docs/**/*",
      "./image/**/*",
      "./tests/**/*",
      "./.agent/**/*",
      "./.github/**/*",
      "./coverage/**/*",
      "./src/**/__tests__/**/*",
      "./src/**/*.test.ts",
      "./src/**/*.test.tsx",
      "./src/**/*.spec.ts",
      "./src/**/*.spec.tsx",
      "./AGENTS.md",
      "./CLAUDE.md",
      "./README.md",
      "./**/*.tsbuildinfo",
      "./.env",
      "./.env.*",
      "./npm-debug.log*",
      "./yarn-debug.log*",
      "./yarn-error.log*",
      "./.pnpm-debug.log*",
    ],
  },
  outputFileTracingIncludes: {
    "/api/assinatura-digital/ged": [
      "./node_modules/pdfjs-dist/package.json",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/@napi-rs/canvas*/**/*",
    ],
    "/api/transparencia/consultas/*": ["./node_modules/pdfkit/js/data/**/*"],
    "/api/transparencia/exemplos/*/*": ["./node_modules/pdfkit/js/data/**/*"],
    "/api/financeiro/relatorios": ["./node_modules/pdfkit/js/data/**/*"],
    "/api/frotas/relatorios": ["./node_modules/pdfkit/js/data/**/*"],
    "/api/saude/relatorios": ["./node_modules/pdfkit/js/data/**/*"],
    "/api/rh/demonstrativos/*": ["./node_modules/pdfkit/js/data/**/*"],
    "/api/rh/relatorios": ["./node_modules/pdfkit/js/data/**/*"],
    "/api/portal-servidor/demonstrativos/*": ["./node_modules/pdfkit/js/data/**/*"],
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        { key: "Content-Security-Policy-Report-Only", value: "default-src 'self'; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; upgrade-insecure-requests" },
      ],
    }];
  },
};

export default nextConfig;
