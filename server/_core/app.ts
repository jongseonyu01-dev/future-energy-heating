import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { registerSensorWebhook } from "../webhook";
import { createContext } from "./context";
import { registerWebRoutes } from "../web-routes";

/**
 * Express 앱을 생성하고 모든 라우트를 등록한다.
 *
 * 이 함수는 두 가지 실행 환경에서 공유된다:
 * 1. 로컬/일반 Node 서버: server/_core/index.ts 에서 createApp() 후 listen
 * 2. Vercel 서버리스: api/index.ts 에서 createApp()을 감싸 핸들러로 export
 *
 * 따라서 이 함수 안에서는 server.listen()을 호출하지 않는다.
 */
export function createApp(): Express {
  const app = express();

  // CORS - 요청 Origin을 반사하여 credentials 지원
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerSensorWebhook(app);
  registerWebRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  return app;
}
