# 기사 견적 격리 검수 API

이 폴더는 **Vercel preview 전용** 합성 검수 API입니다. 운영 홈페이지·공용 단가 DB·실제 고객 접수·SMS/알림톡 provider를 읽거나 쓰지 않습니다.

`prices.listActive`, `estimates.techRequest`, `estimates.listMyTechRequests`만 제공하며, 합성 접수 `90000001`과 합성 고객 정보만 수락합니다. 보고 내역은 serverless 인스턴스 메모리이며 영구 보관되지 않습니다. 검수 앱은 제출 성공 응답을 자체 세션에 표시하므로, 인스턴스 교체로 목록이 비어도 고객·운영 데이터에 접근하지 않습니다.
