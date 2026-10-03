// 공통 헤더 렌더링
function renderHeader(activePage) {
  const nav = [
    { href: '/web/about.html', label: '회사소개' },
    { href: '/web/report.html', label: '난방 고장 접수' },
    { href: '/web/pipe-cleaning.html', label: '배관청소 신청' },
    { href: '/web/leak-sensor.html', label: '누수센서' },
    { href: '/web/branches.html', label: '지사 찾기' },
    { href: '/web/reviews.html', label: '고객 후기' },
    { href: '/web/faq.html', label: 'FAQ' },
    { href: '/web/contact.html', label: '고객센터' },
  ];
  return `
  <header style="background:#fff;border-bottom:1px solid #e5e7eb;padding:0 24px;height:64px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <a href="/web/index.html" style="display:flex;align-items:center;gap:10px;text-decoration:none">
      <div style="width:36px;height:36px;background:#e85d04;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px">🔥</div>
      <div><div style="font-size:18px;font-weight:700;color:#e85d04">퓨처에너지</div><div style="font-size:11px;color:#6b7280">난방케어 서비스</div></div>
    </a>
    <nav style="display:flex;gap:4px;align-items:center" id="desktopNav">
      ${nav.map(n => `<a href="${n.href}" style="padding:6px 10px;border-radius:6px;font-size:13px;color:#1f2937;text-decoration:none;${activePage===n.href?'background:#fff3ec;color:#e85d04;font-weight:600':''}">${n.label}</a>`).join('')}
      <a href="/web/download.html" style="padding:6px 12px;border-radius:6px;font-size:13px;background:#e85d04;color:#fff;font-weight:600;text-decoration:none">앱 다운로드</a>
    </nav>
    <button onclick="document.getElementById('mobileNav').classList.toggle('open')" style="display:none;background:none;border:none;cursor:pointer;padding:8px" id="hamburger">
      <div style="width:22px;height:2px;background:#1f2937;margin:5px 0;border-radius:2px"></div>
      <div style="width:22px;height:2px;background:#1f2937;margin:5px 0;border-radius:2px"></div>
      <div style="width:22px;height:2px;background:#1f2937;margin:5px 0;border-radius:2px"></div>
    </button>
  </header>
  <div id="mobileNav" style="display:none;background:#fff;border-bottom:1px solid #e5e7eb;padding:12px 24px">
    ${nav.map(n => `<a href="${n.href}" style="display:block;padding:10px 0;font-size:15px;border-bottom:1px solid #e5e7eb;text-decoration:none;color:#1f2937">${n.label}</a>`).join('')}
    <a href="/web/download.html" style="display:block;padding:10px 0;font-size:15px;border-bottom:1px solid #e5e7eb;text-decoration:none;color:#e85d04;font-weight:700">📱 앱 다운로드</a>
    <a href="/web/admin/login.html" style="display:block;padding:10px 0;font-size:15px;text-decoration:none;color:#e85d04;font-weight:700">🔐 직원 로그인</a>
  </div>
  <style>@media(max-width:768px){#desktopNav{display:none!important}#hamburger{display:block!important}#mobileNav.open{display:block!important}}</style>
  `;
}
