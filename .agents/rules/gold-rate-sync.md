# 한국금거래소 시세 동기화 및 관리 규칙 (Gold Rate Sync Rules)

## 1. 시세 산출 및 동기화 원칙
- 골드랩 웹사이트의 금/귀금속 시세는 **한국금거래소(koreagoldx.co.kr) 공식 고시가**와 1원 단위 오차 없이 100% 일치해야 한다.
- 임의의 가상 변동 공식(`Math.sin`, `diffDays`, 가상 오프셋 등)이나 임의 배율 곱연산은 절대 사용하지 않는다.

## 2. 자동화 파이프라인 (1일 2회 정기 동기화)
- **실행 주기**: 매일 오전 10:00 KST, 오후 15:00 KST (1일 2회)
- **동기화 파이프라인**:
  1. `scripts/sync-kge-rates.js`: 한국금거래소 API(`https://koreagoldx.co.kr/api/main`)로부터 실시간 고시가 수집
  2. `.github/workflows/sync-gold-rates.yml`: GitHub Actions 클라우드에서 24시간 365일 무중단 스케줄 실행 및 자동 Git Commit & Push
  3. GitHub Pages: Push 즉시 최신 시세로 자동 실시간 배포

## 3. 필드 매핑 표준
- 24K 살 때: `officialPrice4.s_pure`
- 24K 팔 때: `officialPrice4.p_pure`
- 18K 팔 때: `officialPrice4.p_18k`
- 14K 팔 때: `officialPrice4.p_14k`
- 백금 PT 살 때 / 팔 때: `officialPrice4.s_white` / `officialPrice4.p_white`
- 은 AG 살 때 / 팔 때: `officialPrice4.s_silver` / `officialPrice4.p_silver` (단위: 1돈 / 3.75g)
