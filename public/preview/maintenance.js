/**
 * 퓨처에너지테크 홈페이지 점검 모드 스크립트
 *
 * /preview 경로에서는 점검 모드를 비활성화합니다.
 * 비공개 테스트 홈페이지는 auth-check.js의 비밀번호 보호로 운영됩니다.
 */

(function () {
  // /preview 경로에서는 점검 모드 비활성화
  var MAINTENANCE_MODE = false;
  if (!MAINTENANCE_MODE) return;
})();
