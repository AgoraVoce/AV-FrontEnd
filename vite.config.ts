import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const publicOrigin = env.VITE_AV_API_ORIGIN?.trim();
  if (publicOrigin) {
    const url = new URL(publicOrigin);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new Error("VITE_AV_API_ORIGIN deve conter somente a origem HTTP(S) do backend, sem caminho, credenciais nem parâmetros.");
    }
    if (mode === "production" && url.protocol !== "https:") {
      throw new Error("Produção exige VITE_AV_API_ORIGIN com HTTPS.");
    }
  }
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: env.API_PROXY_TARGET || "http://127.0.0.1:3000",
          changeOrigin: true,
        },
        "/auth": {
          target: env.LEGACY_AUTH_PROXY_TARGET || "http://127.0.0.1:3001",
          changeOrigin: false,
        },
      },
    },
  };
});
