# 🚀 로컬 AI 딥리서치 스레드 & X(트위터) 글 생성기 Pro

> **LM Studio 로컬 LLM** 및 **Google Gemini Flash**와 연동되는 단일 HTML(Standalone) 기반의 최첨단 3단계 소셜 미디어 바이럴 글 자동 생성 웹 애플리케이션입니다.

---

## ✨ 핵심 주요 기능

1. **⚡ 듀얼 AI 엔진 지원 (Dual Engine Switcher)**
   - **Google Gemini Flash (클라우드 AI - 추천)**: 글자 깨짐 0%, 초고속 3초 원고 작성, 무료 API 키 지원.
   - **LM Studio (로컬 AI)**: 인터넷 연결 없이 100% 오프라인 로컬 환경에서 프라이버시 유지 실행.

2. **🧠 3단계 딥리서치 파이프라인 (Deep Research Pipeline)**
   - **1단계 리서치**: 검색어/주제 다각도 분석, 타깃 독자층 페인포인트 추출.
   - **2단계 전략 설계**: 바이럴 후킹 앵글 선정 및 포스트별 역할(Story Chain) 청사진 구성.
   - **3단계 최종 원고 작성**: 클리프행어(Cliffhanger) 기반 연속 스토리 체인 원고 최종 완성.

3. **🔗 연속 스토리텔링 체인 (Sequential Story Chain)**
   - 포스트 1의 떡밥을 포스트 2가 받고, 포스트 3에서 해결책을 제시하며 마지막 포스트에서 저장/공유 유도 및 **"첫 번째 댓글 확인"** CTA로 이어지는 완벽한 옴니버스 원고 구성.

4. **✂️ 1초 글자 수 자동 축소 (Auto-Trim Helper)**
   - 소셜 플랫폼별 자수 제한(Threads 500자 / 𝕏 280자) 초과 시 원클릭으로 핵심 문장만 정제하는 축소 기능 제공.

---

## 🛠️ 실행 방법

```bash
# 1. 서버 실행 (LM Studio CORS 프록시 및 static 제공)
node server.js

# 2. 브라우저 접속
http://localhost:5000
```

---

## ⚙️ 기술 스택

- **Frontend**: React 18 (UMD), Babel Standalone, Tailwind CSS, Font Awesome 6, canvas-confetti
- **Backend/Proxy**: Node.js (Zero-dependency HTTP Server & CORS Proxy)
- **AI Integrations**: Google Generative Language REST API (`gemini-1.5-flash`, `gemini-2.0-flash`, `gemini-1.5-pro`), LM Studio Local Server (`http://127.0.0.1:1234`)
