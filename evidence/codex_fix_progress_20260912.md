# Codex 재검수 보완 진행 기록

## 2026-09-12 KST — preview 및 홈페이지 안내 범위

- 인증 보완 review API는 Vercel preview deployment `dpl_Mgc4TtbBugMo5tTY3cXrFfvySVF7`으로 배포했으며, URL은 `https://futureenergytech-bnsrgrrvs-futureenergytech.vercel.app`이다. source는 합성 단가·합성 기사별 접수·메모리 보고·`smsSubstituted`만 포함하며 운영 DB와 문자 provider import가 없다.
- 기존 review preview exception URL `futureenergytech-wlvr2pr81-futureenergytech.vercel.app`은 새 URL 교체 전 재보호 대상으로 선택했다. Vercel Authentication은 Standard Protection 상태로 유지된다. 새 URL은 아직 exception을 추가하지 않았다.
- 운영 홈페이지의 실제 GitHub repository `jongseonyu01-dev/futureenergytech`에는 iPhone 카드의 문구만 변경한 commit `bd5e3d0c4d910b00ba91c2505aaee2cba8eaac36`과 재배포 commit `760d7a2222722ba8580fa9a0d5b58e3a9266cc42`이 있다.
- production deployment `dpl_CFUbTv7AWHetifvRMpQcJBdNRTZn`은 READY이며, 실제 `/web/download.html`에서 iPhone 준비 문구와 Android `/download/driver/latest` 링크를 확인했다. 견적 화면·단가·Android 다운로드 handler는 변경하지 않았다.
