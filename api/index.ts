import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "http";
import { createApp } from "../server/_core/app";

/**
 * Vercel 서버리스 진입점.
 *
 * vercel.json 의 rewrites 설정에 따라 모든 요청(/track, /api/location 등)이
 * 이 핸들러로 전달된다. Express 앱은 (req, res)를 직접 처리할 수 있으므로
 * 별도 listen 없이 핸들러로 위임한다.
 *
 * Express 앱 인스턴스는 콜드스타트 간 재사용을 위해 모듈 스코프에 캐싱한다.
 */
const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // Express 앱은 Node http (req,res) 시그니처와 호환된다.
  return (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
