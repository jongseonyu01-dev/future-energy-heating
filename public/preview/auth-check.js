// 비공개 테스트 페이지 인증 체크
// 모든 preview 페이지 상단에서 호출됨
(function() {
  var path = window.location.pathname;
  
  // gate.html 자체는 체크 불필요
  if (path.endsWith('/gate.html')) return;
  
  // admin 경로는 자체 로그인이 있으므로 제외
  if (path.indexOf('/preview/admin/') !== -1) return;
  
  // 인증 확인 (sessionStorage)
  if (sessionStorage.getItem('preview_auth') !== 'ok') {
    // 현재 URL을 returnUrl로 저장하여 인증 후 돌아올 수 있게 함
    sessionStorage.setItem('preview_return', window.location.href);
    window.location.replace('/preview/gate.html');
  }
})();
