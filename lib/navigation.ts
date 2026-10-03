import { Alert, Linking, Platform } from "react-native";

/**
 * 한국 지도앱(카카오맵/네이버지도/T맵)으로 길찾기를 실행한다.
 *
 * 동작 방식:
 * 1. 사용자에게 지도앱 선택지를 보여준다.
 * 2. 선택한 앱의 URL scheme으로 실행을 시도한다.
 * 3. 앱이 설치되어 있지 않으면 해당 지도의 웹 페이지로 폴백한다.
 *
 * 목적지는 동/호수를 제외한 아파트 대표 주소까지만 전달한다.
 */

interface MapApp {
  key: string;
  label: string;
  /** 앱 실행용 scheme URL을 생성 */
  appUrl: (address: string) => string;
  /** 앱 미설치 시 웹 폴백 URL */
  webUrl: (address: string) => string;
}

const MAP_APPS: MapApp[] = [
  {
    key: "kakao",
    label: "카카오맵",
    // 카카오맵: 키워드 검색 후 길찾기
    appUrl: (a) => `kakaomap://search?q=${encodeURIComponent(a)}`,
    webUrl: (a) => `https://map.kakao.com/?q=${encodeURIComponent(a)}`,
  },
  {
    key: "naver",
    label: "네이버지도",
    appUrl: (a) => `nmap://search?query=${encodeURIComponent(a)}&appname=com.futureenergy.heatingcare`,
    webUrl: (a) => `https://map.naver.com/p/search/${encodeURIComponent(a)}`,
  },
  {
    key: "tmap",
    label: "T맵",
    appUrl: (a) => `tmap://search?name=${encodeURIComponent(a)}`,
    webUrl: (a) => `https://tmap.life/route/search?q=${encodeURIComponent(a)}`,
  },
];

/**
 * 지도앱 실행을 시도하고, 실패 시 웹으로 폴백한다.
 */
async function launchMap(app: MapApp, address: string) {
  const appUrl = app.appUrl(address);
  const webUrl = app.webUrl(address);

  // 웹 환경에서는 바로 웹 지도 열기
  if (Platform.OS === "web") {
    Linking.openURL(webUrl);
    return;
  }

  try {
    const supported = await Linking.canOpenURL(appUrl);
    if (supported) {
      await Linking.openURL(appUrl);
    } else {
      // 앱 미설치 → 웹 폴백
      await Linking.openURL(webUrl);
    }
  } catch {
    // scheme 실행 실패 → 웹 폴백
    try {
      await Linking.openURL(webUrl);
    } catch {
      Alert.alert("길찾기 오류", "지도를 열 수 없습니다. 주소를 확인해주세요.");
    }
  }
}

/**
 * 지도앱 선택 액션시트를 띄우고 길찾기를 실행한다.
 *
 * @param address 동/호수를 제외한 아파트 대표 주소
 */
export function openNavigation(address: string) {
  if (!address || !address.trim()) {
    Alert.alert("주소 없음", "목적지 주소가 없습니다.");
    return;
  }

  const trimmed = address.trim();

  // 웹은 선택지 없이 바로 카카오맵 웹으로
  if (Platform.OS === "web") {
    Linking.openURL(MAP_APPS[0].webUrl(trimmed));
    return;
  }

  const buttons = MAP_APPS.map((app) => ({
    text: app.label,
    onPress: () => launchMap(app, trimmed),
  }));

  Alert.alert(
    "길찾기",
    `목적지: ${trimmed}\n\n사용할 지도앱을 선택하세요.`,
    [
      ...buttons,
      { text: "취소", style: "cancel" as const },
    ],
  );
}
