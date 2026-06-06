// 비공개 테스트 페이지 인증 체크
// 모든 preview 페이지 상단에서 호출됨
(function() {
  // gate.html 자체는 체크 불필요
  if (location.pathname.endsWith('/gate.html')) return;
  // admin 경로는 자체 로그인이 있으므로 제외
  if (location.pathname.includes('/admin/')) return;
  
  if (sessionStorage.getItem('preview_auth') !== 'ok') {
    location.replace('/preview/gate.html');
  }
})();
