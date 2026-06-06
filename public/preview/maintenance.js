/**
 * 퓨처에너지테크 홈페이지 점검 모드 스크립트
 *
 * 점검 모드 ON/OFF 설정:
 *   MAINTENANCE_MODE = true  → 점검 모드 (외부 고객에게 안내 화면 표시)
 *   MAINTENANCE_MODE = false → 정상 공개 모드
 *
 * 관리자 미리보기 비밀번호:
 *   PREVIEW_PASSWORD 값을 변경하여 관리자 전용 비밀번호를 설정할 수 있습니다.
 */

(function () {
  var MAINTENANCE_MODE = true;          // ← true: 점검 모드 / false: 정상 공개
  var PREVIEW_PASSWORD = "fet2025admin"; // ← 관리자 미리보기 비밀번호 (변경 가능)
  var BYPASS_KEY = "fet_preview_ok";    // sessionStorage 키 (변경 불필요)

  // 이미 관리자 인증된 경우 바이패스
  if (sessionStorage.getItem(BYPASS_KEY) === "1") return;

  // 점검 모드가 꺼져 있으면 아무것도 하지 않음
  if (!MAINTENANCE_MODE) return;

  // 현재 페이지가 관리자 페이지이면 점검 모드 적용 안 함
  var path = window.location.pathname;
  if (path.indexOf("/preview/admin/") !== -1) return;

  // 점검 안내 화면 HTML 생성
  var html = [
    '<style>',
    '  *{box-sizing:border-box;margin:0;padding:0;}',
    '  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#F0F9FF;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}',
    '  .card{background:#fff;border-radius:24px;box-shadow:0 8px 40px rgba(0,0,0,.10);max-width:480px;width:100%;padding:48px 36px;text-align:center;}',
    '  .logo{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:32px;}',
    '  .logo-icon{width:48px;height:48px;background:linear-gradient(135deg,#0284C7,#0EA5E9);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;}',
    '  .logo-text{text-align:left;}',
    '  .logo-text .ko{font-size:20px;font-weight:800;color:#1E293B;}',
    '  .logo-text .en{font-size:12px;color:#64748B;font-weight:600;}',
    '  .badge{display:inline-block;background:#FEF3C7;color:#D97706;font-size:13px;font-weight:700;padding:6px 16px;border-radius:20px;margin-bottom:24px;}',
    '  h1{font-size:22px;font-weight:800;color:#1E293B;margin-bottom:12px;}',
    '  .desc{font-size:15px;color:#64748B;line-height:1.7;margin-bottom:36px;}',
    '  .contact-box{background:#F0F9FF;border-radius:16px;padding:24px;margin-bottom:32px;}',
    '  .contact-box p{font-size:14px;color:#64748B;margin-bottom:12px;}',
    '  .tel-btn{display:block;padding:14px;border-radius:12px;font-size:16px;font-weight:700;text-decoration:none;margin-bottom:10px;transition:opacity .15s;}',
    '  .tel-btn:hover{opacity:.85;}',
    '  .tel-main{background:#0284C7;color:#fff;}',
    '  .tel-mobile{background:#0EA5E9;color:#fff;}',
    '  .admin-toggle{font-size:13px;color:#94A3B8;cursor:pointer;text-decoration:underline;margin-top:8px;display:inline-block;}',
    '  .admin-form{display:none;margin-top:16px;}',
    '  .admin-form input{width:100%;padding:10px 14px;border:1px solid #CBD5E1;border-radius:10px;font-size:14px;margin-bottom:8px;outline:none;}',
    '  .admin-form button{width:100%;padding:11px;background:#1E293B;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;}',
    '  .admin-form button:hover{background:#334155;}',
    '  .err{color:#EF4444;font-size:13px;margin-top:4px;display:none;}',
    '</style>',
    '<div class="card">',
    '  <div class="logo">',
    '    <div class="logo-icon">🌐</div>',
    '    <div class="logo-text">',
    '      <div class="ko">퓨처에너지테크</div>',
    '      <div class="en">Future Energy Tech</div>',
    '    </div>',
    '  </div>',
    '  <div class="badge">🔧 홈페이지 준비 중</div>',
    '  <h1>홈페이지 준비 중입니다</h1>',
    '  <p class="desc">더 나은 서비스를 제공하기 위해 홈페이지를 준비하고 있습니다.<br/>난방 고장 접수 및 긴급 상담은 아래 번호로 연락해 주세요.</p>',
    '  <div class="contact-box">',
    '    <p>📞 상담 및 긴급 출동 연락처</p>',
    '    <a href="tel:031-8042-7310" class="tel-btn tel-main">대표전화 031-8042-7310</a>',
    '    <a href="tel:010-5754-7310" class="tel-btn tel-mobile">휴대전화 010-5754-7310</a>',
    '  </div>',
    '  <span class="admin-toggle" onclick="document.querySelector(\'.admin-form\').style.display=\'block\';this.style.display=\'none\';">관리자 미리보기</span>',
    '  <div class="admin-form">',
    '    <input type="password" id="maint-pw" placeholder="관리자 비밀번호 입력" onkeydown="if(event.key===\'Enter\')checkPw()"/>',
    '    <button onclick="checkPw()">확인</button>',
    '    <div class="err" id="maint-err">비밀번호가 올바르지 않습니다.</div>',
    '  </div>',
    '</div>',
    '<script>',
    'function checkPw(){',
    '  var pw=document.getElementById("maint-pw").value;',
    '  if(pw==="' + PREVIEW_PASSWORD + '"){',
    '    sessionStorage.setItem("' + BYPASS_KEY + '","1");',
    '    location.reload();',
    '  } else {',
    '    document.getElementById("maint-err").style.display="block";',
    '  }',
    '}',
    '<\/script>'
  ].join('\n');

  // 현재 페이지 전체를 점검 안내 화면으로 교체
  document.open();
  document.write('<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>퓨처에너지테크 - 홈페이지 준비 중</title></head><body>' + html + '</body></html>');
  document.close();
})();
