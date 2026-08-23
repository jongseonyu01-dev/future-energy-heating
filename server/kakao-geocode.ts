const KAKAO_GEOCODE_TIMEOUT_MS = 5_000;
const KAKAO_GEOCODE_CACHE_MS = 10 * 60 * 1000;
const KAKAO_GEOCODE_CACHE_MAX = 500;

export type KakaoGeocodeOutcome =
  | { ok: true; lat: number; lng: number }
  | {
      ok: false;
      reason: "invalid_input" | "not_configured" | "not_found" | "timeout" | "upstream";
    };

const kakaoGeocodeCache = new Map<string, {
  expiresAt: number;
  result: Extract<KakaoGeocodeOutcome, { ok: true }>;
}>();
const kakaoGeocodeInFlight = new Map<string, Promise<KakaoGeocodeOutcome>>();

export function normalizeKakaoAddress(rawAddress: unknown): string | null {
  if (typeof rawAddress !== "string") return null;
  const address = rawAddress.replace(/\s+/g, " ").trim();
  return address.length >= 2 && address.length <= 200 ? address : null;
}

async function requestKakaoGeocode(address: string): Promise<KakaoGeocodeOutcome> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) return { ok: false, reason: "not_configured" };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), KAKAO_GEOCODE_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
      {
        headers: { Authorization: `KakaoAK ${apiKey}` },
        signal: controller.signal,
      },
    );
    if (!response.ok) return { ok: false, reason: "upstream" };

    const payload = await response.json() as {
      documents?: Array<{ x?: string; y?: string }>;
    };
    const document = payload.documents?.[0];
    if (!document) return { ok: false, reason: "not_found" };

    const lat = Number(document.y);
    const lng = Number(document.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, reason: "not_found" };
    }
    return { ok: true, lat, lng };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error && error.name === "AbortError" ? "timeout" : "upstream",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 브라우저 프록시와 기사 출발 경로가 함께 사용하는 서버 전용 지오코딩.
 * 성공 좌표만 짧게 캐시하고 동일 주소 동시 요청은 한 번의 upstream 호출로 합친다.
 */
export async function geocodeKoreanAddress(rawAddress: unknown): Promise<KakaoGeocodeOutcome> {
  const address = normalizeKakaoAddress(rawAddress);
  if (!address) return { ok: false, reason: "invalid_input" };

  const now = Date.now();
  const cached = kakaoGeocodeCache.get(address);
  if (cached && cached.expiresAt > now) return cached.result;
  if (cached) kakaoGeocodeCache.delete(address);

  const existing = kakaoGeocodeInFlight.get(address);
  if (existing) return existing;

  const pending = requestKakaoGeocode(address).then((result) => {
    if (result.ok) {
      if (kakaoGeocodeCache.size >= KAKAO_GEOCODE_CACHE_MAX) {
        const oldestKey = kakaoGeocodeCache.keys().next().value as string | undefined;
        if (oldestKey) kakaoGeocodeCache.delete(oldestKey);
      }
      kakaoGeocodeCache.set(address, {
        expiresAt: Date.now() + KAKAO_GEOCODE_CACHE_MS,
        result,
      });
    }
    return result;
  }).finally(() => {
    kakaoGeocodeInFlight.delete(address);
  });
  kakaoGeocodeInFlight.set(address, pending);
  return pending;
}
