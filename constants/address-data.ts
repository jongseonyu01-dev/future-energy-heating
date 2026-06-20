/**
 * 주소 선택 데이터 (단계형 선택 구조)
 *
 * 구조: 시/도 > 시/군/구 > 동/읍/면 > 아파트 단지
 *
 * 테스트 범위: 경기도 > 안산시 단원구 > 초지동 > 주요 아파트
 * 추후 안산 전체 → 경기 전체 → 전국 순서로 확장 가능.
 *
 * 각 아파트는 네비게이션 목적지로 사용할 대표 주소(roadAddress)를 가진다.
 * 동/호수는 별도 입력하며, 네비게이션에는 roadAddress까지만 전달한다.
 */

export interface ApartmentInfo {
  /** 아파트 단지명 (예: "초지역메이저타운푸르지오") */
  name: string;
  /** 네비게이션/지도 검색용 대표 도로명 주소 (동/호수 제외) */
  roadAddress: string;
  /** 단지 대표 위도 (고객 지도 목적지 마커 / ETA 계산용) */
  lat?: number;
  /** 단지 대표 경도 */
  lng?: number;
}

export interface DongInfo {
  /** 동/읍/면 이름 (예: "초지동") */
  name: string;
  /** 해당 동의 아파트 단지 목록 */
  apartments: ApartmentInfo[];
}

export interface SigunguInfo {
  /** 시/군/구 이름 (예: "안산시 단원구") */
  name: string;
  /** 해당 시군구의 동/읍/면 목록 */
  dongs: DongInfo[];
}

export interface SidoInfo {
  /** 시/도 이름 (예: "경기도") */
  name: string;
  /** 해당 시도의 시/군/구 목록 */
  sigungus: SigunguInfo[];
}

export const ADDRESS_DATA: SidoInfo[] = [
  {
    name: "경기도",
    sigungus: [
      {
        name: "안산시 단원구",
        dongs: [
          {
            name: "초지동",
            apartments: [
              { name: "초지역메이저타운푸르지오메트로단지", roadAddress: "경기도 안산시 단원구 초지동 산단로 지원", lat: 37.3219, lng: 126.8309 },
              { name: "초지역메이저타운푸르지오에코단지", roadAddress: "경기도 안산시 단원구 초지동 초지로", lat: 37.3231, lng: 126.8295 },
              { name: "그린빌1단지", roadAddress: "경기도 안산시 단원구 초지동 화랑로 그린빌", lat: 37.3175, lng: 126.8268 },
              { name: "그린빌2단지", roadAddress: "경기도 안산시 단원구 초지동 화랑로 그린빌2단지", lat: 37.3182, lng: 126.8281 },
              { name: "호수마을풍림아파트", roadAddress: "경기도 안산시 단원구 초지동 호수공원로 풍림", lat: 37.3148, lng: 126.8312 },
              { name: "호수마을한양아파트", roadAddress: "경기도 안산시 단원구 초지동 호수공원로 한양", lat: 37.3155, lng: 126.8326 },
              { name: "주공그린빌13단지", roadAddress: "경기도 안산시 단원구 초지동 초지로 주공13단지", lat: 37.3198, lng: 126.8253 },
              { name: "롯데캐슬더퍼스트", roadAddress: "경기도 안산시 단원구 초지동 초지로 롯데캐슬", lat: 37.3242, lng: 126.8338 },
              { name: "안산메트로타운푸르지오", roadAddress: "경기도 안산시 단원구 초지동 산단로 메트로타운", lat: 37.3225, lng: 126.8321 },
            ],
          },
          {
            name: "고잔동",
            apartments: [
              { name: "주공5단지", roadAddress: "경기도 안산시 단원구 고잔동 고잔로 주공5단지" },
              { name: "안산고잔푸르지오3차", roadAddress: "경기도 안산시 단원구 고잔동 고잔로 푸르지오3차" },
              { name: "라성리젠시빌", roadAddress: "경기도 안산시 단원구 고잔동 광덕대로 라성리젠시빌" },
              { name: "안산센트럴푸르지오", roadAddress: "경기도 안산시 단원구 고잔동 광덕대로 센트럴푸르지오" },
            ],
          },
          {
            name: "원곡동",
            apartments: [
              { name: "안산원곡주공1단지", roadAddress: "경기도 안산시 단원구 원곡동 원곡로 주공1단지" },
              { name: "푸르지오6차", roadAddress: "경기도 안산시 단원구 원곡동 원포공원로 푸르지오6차" },
            ],
          },
        ],
      },
      {
        name: "안산시 상록구",
        dongs: [
          {
            name: "사동",
            apartments: [
              { name: "안산그랑시티자이1차", roadAddress: "경기도 안산시 상록구 사동 해안로 그랑시티자이1차" },
              { name: "안산그랑시티자이2차", roadAddress: "경기도 안산시 상록구 사동 해안로 그랑시티자이2차" },
              { name: "푸른마을주공4단지", roadAddress: "경기도 안산시 상록구 사동 사세충열로 주공4단지" },
            ],
          },
          {
            name: "본오동",
            apartments: [
              { name: "본오주공아파트", roadAddress: "경기도 안산시 상록구 본오동 본오로 주공" },
              { name: "신안1차아파트", roadAddress: "경기도 안산시 상록구 본오동 사사동로 신안1차" },
            ],
          },
        ],
      },
    ],
  },
];

/** 시/도 목록 반환 */
export function getSidoList(): string[] {
  return ADDRESS_DATA.map((s) => s.name);
}

/** 특정 시/도의 시/군/구 목록 반환 */
export function getSigunguList(sido: string): string[] {
  const found = ADDRESS_DATA.find((s) => s.name === sido);
  return found ? found.sigungus.map((g) => g.name) : [];
}

/** 특정 시/도 + 시/군/구의 동/읍/면 목록 반환 */
export function getDongList(sido: string, sigungu: string): string[] {
  const s = ADDRESS_DATA.find((x) => x.name === sido);
  const g = s?.sigungus.find((x) => x.name === sigungu);
  return g ? g.dongs.map((d) => d.name) : [];
}

/** 특정 시/도 + 시/군/구 + 동의 아파트 목록 반환 */
export function getApartmentList(sido: string, sigungu: string, dong: string): ApartmentInfo[] {
  const s = ADDRESS_DATA.find((x) => x.name === sido);
  const g = s?.sigungus.find((x) => x.name === sigungu);
  const d = g?.dongs.find((x) => x.name === dong);
  return d ? d.apartments : [];
}

/** 특정 아파트의 대표 도로명 주소(네비 목적지) 반환 */
export function getApartmentRoadAddress(
  sido: string,
  sigungu: string,
  dong: string,
  apartmentName: string,
): string | undefined {
  const apts = getApartmentList(sido, sigungu, dong);
  return apts.find((a) => a.name === apartmentName)?.roadAddress;
}

/** 특정 아파트의 대표 좌표(위도/경도) 반환 - 고객 지도 목적지 마커용 */
export function getApartmentCoords(
  sido: string,
  sigungu: string,
  dong: string,
  apartmentName: string,
): { lat: number; lng: number } | undefined {
  const apts = getApartmentList(sido, sigungu, dong);
  const apt = apts.find((a) => a.name === apartmentName);
  if (apt && apt.lat !== undefined && apt.lng !== undefined) {
    return { lat: apt.lat, lng: apt.lng };
  }
  return undefined;
}

/**
 * 전체 주소 문자열 생성 (모든 화면 공통 사용)
 *
 * 형식: "경기도 안산시 단원구 초지동 초지역메이저타운 101동 1501호"
 * 시/도, 시군구, 동 정보가 없는 기존 데이터는 자동으로 생략된다.
 */
export function formatFullAddress(req: {
  sido?: string | null;
  sigungu?: string | null;
  eupmyeondong?: string | null;
  apartmentName?: string | null;
  dong?: string | null;
  ho?: string | null;
}): string {
  const region = [req.sido, req.sigungu, req.eupmyeondong]
    .filter((v) => v && v.trim())
    .join(" ");
  const building = [
    req.apartmentName,
    req.dong ? `${req.dong}동` : "",
    req.ho ? `${req.ho}호` : "",
  ]
    .filter((v) => v && v.trim())
    .join(" ");
  return [region, building].filter((v) => v).join(" ");
}

/**
 * 네비게이션 목적지 주소 생성 (동/호수 제외, 아파트 대표 주소까지만)
 *
 * roadAddress(대표 도로명 주소)가 있으면 우선 사용,
 * 없으면 "시도 시군구 동 아파트명" 으로 구성.
 */
export function formatNavAddress(req: {
  sido?: string | null;
  sigungu?: string | null;
  eupmyeondong?: string | null;
  apartmentName?: string | null;
  roadAddress?: string | null;
}): string {
  if (req.roadAddress && req.roadAddress.trim()) return req.roadAddress.trim();
  return [req.sido, req.sigungu, req.eupmyeondong, req.apartmentName]
    .filter((v) => v && v.trim())
    .join(" ");
}
