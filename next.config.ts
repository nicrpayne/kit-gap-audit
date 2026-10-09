import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit", "fontkit", "dejavu-fonts-ttf"],
  outputFileTracingIncludes: {
    "/api/reports/*/pdf": ["./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf", "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf", "./node_modules/dejavu-fonts-ttf/LICENSE"],
    "/api/report-access/*/pdf": ["./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf", "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf", "./node_modules/dejavu-fonts-ttf/LICENSE"],
  },
};

export default nextConfig;
