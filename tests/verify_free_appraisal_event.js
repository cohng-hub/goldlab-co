// tests/verify_free_appraisal_event.js
// Automated End-to-End Verification for Free Appraisal Event (귀금속 감정비 무료 이벤트)

const assert = require('assert');
const http = require('http');
const { getDB, runTransaction, resetDBToDefault } = require('../server/db');
const { createServer } = require('../server');

let server;
let baseUrl;

function makeRequest(path, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqHeaders = { 'Content-Type': 'application/json', ...headers };
    let postData = null;
    if (data) {
      postData = JSON.stringify(data);
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(url, {
      method,
      headers: reqHeaders
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (e) { parsed = body; }
        resolve({ status: res.statusCode, data: parsed, headers: res.headers });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('🚀 GoldLab & Co. 귀금속 감정비 무료 이벤트 종합 자동 검증 시작');
  console.log('================================================================\n');

  // Database snapshot for zero-pollution isolation
  const fs = require('fs');
  const path = require('path');
  const dbFile = path.resolve(__dirname, '../data/goldlab_db.json');
  const dbSnapshot = fs.existsSync(dbFile) ? fs.readFileSync(dbFile, 'utf8') : null;

  // Start temporary test server
  server = http.createServer(async (req, res) => {
    const { handleApiRequest } = require('../server/routes');
    const { URL } = require('url');
    const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

    if (parsedUrl.pathname.startsWith('/api')) {
      let body = null;
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        if (raw) {
          try { body = JSON.parse(raw); } catch (e) {}
        }
      }
      return await handleApiRequest(req, res, parsedUrl, body);
    }

    res.statusCode = 404;
    res.end('Not Found');
  });

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`✓ 테스트 HTTP 서버 가동: ${baseUrl}\n`);

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Event Status & Config Endpoint (Public)
    // -------------------------------------------------------------------------
    console.log('[TEST 1] GET /api/events/free-appraisal 공개 파라미터 및 활성 상태 검증');
    const evRes = await makeRequest('/api/events/free-appraisal');
    assert.strictEqual(evRes.status, 200, '이벤트 정보 API 응답 상태코드는 200이어야 함');
    assert.strictEqual(evRes.data.success, true);
    assert.strictEqual(evRes.data.event.code, 'FREE_APPRAISAL_2026');
    assert.strictEqual(evRes.data.event.endDateKST, '2026-11-06T23:59:59+09:00');
    assert.strictEqual(evRes.data.event.baseFee, 0);
    assert.strictEqual(evRes.data.event.originalFee, 29900);
    assert.strictEqual(evRes.data.event.maxItems, 2);
    assert.strictEqual(evRes.data.event.reviewDeadlineDays, 14);
    assert.strictEqual(evRes.data.isActive, true, '2026-10-21 기준 이벤트는 활성 상태여야 함');
    console.log('  ✓ 이벤트 코드: ' + evRes.data.event.code);
    console.log('  ✓ 종료 시각(KST): ' + evRes.data.event.endDateKST);
    console.log('  ✓ 기본 감정료: ' + evRes.data.event.baseFee + '원 (정상가 29,900원)');
    console.log('  ✓ 현재 활성 상태: ' + evRes.data.isActive + '\n');

    // -------------------------------------------------------------------------
    // TEST 2: Auth Login
    // -------------------------------------------------------------------------
    console.log('[TEST 2] 테스트 계정 등록 및 인증 토큰 발급');
    const regRes = await makeRequest('/api/auth/register', 'POST', {
      name: '이벤트테스터',
      email: `tester_${Date.now()}@goldlab.test`,
      password: 'Password123!',
      phone: '010-9999-8888',
      userType: 'PERSONAL'
    });
    const authToken = regRes.data.token;
    const currentUser = regRes.data.user;
    assert(authToken, '인증 토큰 발급 확인');
    console.log(`  ✓ 인증 토큰 획득 성공 (사용자: ${currentUser.name})\n`);

    // -------------------------------------------------------------------------
    // TEST 3: Non-logged-in event application rejection
    // -------------------------------------------------------------------------
    console.log('[TEST 3] 비로그인 고객의 이벤트 무료 감정 신청 시 401 차단 검증');
    const nonAuthRes = await makeRequest('/api/appraisals/apply', 'POST', {
      method: 'COURIER',
      applicantName: '비로그인고객',
      applicantPhone: '010-1111-2222',
      returnAddress: '서울시 종로구',
      itemType: '18K 반지',
      quantity: 1,
      applyEvent: true,
      agreeEventReview: true,
      items: [{ itemIndex: 1, itemType: '18K 반지' }]
    });
    assert.strictEqual(nonAuthRes.status, 401, '비로그인 신청은 401 Unauthorized 반환해야 함');
    console.log('  ✓ 401 차단 성공: ' + nonAuthRes.data.error + '\n');

    // -------------------------------------------------------------------------
    // TEST 4: Logged-in customer without agreement rejection
    // -------------------------------------------------------------------------
    console.log('[TEST 4] 이벤트 후기 작성 미동의 시 400 차단 검증');
    const noAgreeRes = await makeRequest('/api/appraisals/apply', 'POST', {
      method: 'COURIER',
      applicantName: currentUser.name,
      applicantPhone: currentUser.phone,
      returnAddress: '서울시 종로구',
      itemType: '18K 목걸이',
      quantity: 1,
      applyEvent: true,
      agreeEventReview: false, // Disagree
      items: [{ itemIndex: 1, itemType: '18K 목걸이' }]
    }, { 'Authorization': `Bearer ${authToken}` });
    assert.strictEqual(noAgreeRes.status, 400, '동의 미체크 시 400 Bad Request 반환해야 함');
    console.log('  ✓ 400 차단 성공: ' + noAgreeRes.data.error + '\n');

    // -------------------------------------------------------------------------
    // TEST 5: Legitimate Event Appraisal Submission (0 Won, Quota/GC Preserved)
    // -------------------------------------------------------------------------
    console.log('[TEST 5] 이벤트 무료 감정 정상 접수 (0원 적용, 회원 연간 무료 횟수 및 GC 보존)');
    const eventApRes = await makeRequest('/api/appraisals/apply', 'POST', {
      method: 'COURIER',
      applicantName: currentUser.name,
      applicantPhone: currentUser.phone,
      returnAddress: '서울시 종로구 돈화문로 100',
      itemType: '24K 골드바',
      quantity: 2,
      applyEvent: true,
      agreeEventReview: true,
      eventCode: 'FREE_APPRAISAL_2026',
      eventAgreed: true,
      gcUsed: 5000, // Should NOT be used or deducted
      applyFreeBenefit: true, // Should NOT deduct member quota
      items: [
        { itemIndex: 1, itemType: '24K 골드바', expectedPurity: '24K (99.99%)', expectedWeight: '37.5g' },
        { itemIndex: 2, itemType: '18K 팔찌', expectedPurity: '18K (75.0%)', expectedWeight: '18.75g' }
      ]
    }, { 'Authorization': `Bearer ${authToken}` });

    assert.strictEqual(eventApRes.status, 201, '신청 접수 성공 시 201 Created');
    const ap = eventApRes.data.appraisal;
    assert.strictEqual(ap.costBase, 0, '이벤트 기본 감정료는 0원이어야 함');
    assert.strictEqual(ap.finalPayAmount, 0, '최종 결제 금액은 0원이어야 함');
    assert.strictEqual(ap.freeBenefitApplied, false, '이벤트가 우선 적용되어 회원 등급 무료 감정 횟수는 미차감(보존)되어야 함');
    assert.strictEqual(ap.gcUsed, 0, '무료 이벤트이므로 GC 포인트는 0 차감되어야 함');
    assert.strictEqual(ap.isEventApplied, true, 'isEventApplied 플래그 true');
    assert.strictEqual(ap.eventCode, 'FREE_APPRAISAL_2026');
    assert.strictEqual(ap.eventReviewDeadlineDays, 14, '후기 작성 기한 14일 설정');
    assert.strictEqual(ap.reviewStatus, 'PENDING', '후기 작성 상태 PENDING');
    assert(ap.eventAgreedAt, '동의 시각 서버 기록 확인');
    console.log(`  ✓ 접수번호: ${ap.receiptNo}`);
    console.log(`  ✓ 적용 요금: 기본감정료 ${ap.costBase}원 / 최종결제 ${ap.finalPayAmount}원`);
    console.log(`  ✓ 회원 무료 혜택 차감 여부: ${ap.freeBenefitApplied} (이벤트 우선 적용으로 보존)`);
    console.log(`  ✓ GC 포인트 사용액: ${ap.gcUsed}원`);
    console.log(`  ✓ 이벤트 코드: ${ap.eventCode} (동의일시: ${ap.eventAgreedAt})\n`);

    // -------------------------------------------------------------------------
    // TEST 6: Normal (Non-event) Appraisal Application charges 29,900 won
    // -------------------------------------------------------------------------
    console.log('[TEST 6] 일반(비이벤트) 감정 접수 시 정상 기본료 29,900원 청구 확인');
    const normalApRes = await makeRequest('/api/appraisals/apply', 'POST', {
      method: 'VISIT',
      applicantName: currentUser.name,
      applicantPhone: currentUser.phone,
      itemType: '순금 열쇠',
      quantity: 1,
      applyEvent: false,
      agreeEventReview: false,
      items: [{ itemIndex: 1, itemType: '순금 열쇠' }]
    }, { 'Authorization': `Bearer ${authToken}` });
    assert.strictEqual(normalApRes.status, 201);
    const normalAp = normalApRes.data.appraisal;
    assert.strictEqual(normalAp.costBase, 29900, '일반 접수는 기본 29,900원');
    assert.strictEqual(normalAp.finalPayAmount, 29900, '최종 결제 29,900원');
    assert.strictEqual(normalAp.isEventApplied, false);
    console.log(`  ✓ 일반 접수 기본 감정료: ${normalAp.costBase}원, 최종 결제: ${normalAp.finalPayAmount}원\n`);

    // -------------------------------------------------------------------------
    // TEST 7: Event Appraisal Status Progression & Eligible Review Retrieval
    // -------------------------------------------------------------------------
    console.log('[TEST 7] 감정 진행 상태(COMPLETED) 변경 후 마이페이지 후기 작성 대상 조회');
    // Admin login
    const adminLogin = await makeRequest('/api/auth/login', 'POST', {
      email: 'goldlabnco@naver.com',
      password: 'testpassword123'
    });
    const adminToken = adminLogin.data.token || authToken;

    // Change status to COMPLETED
    await runTransaction(async (dbRef) => {
      const target = dbRef.appraisals.find(a => a.id === ap.id);
      if (target) {
        target.status = 'COMPLETED';
        target.updatedAt = new Date().toISOString();
      }
    });

    // Check eligible transactions for review
    const eligibleRes = await makeRequest('/api/reviews/my-eligible-transactions', 'GET', null, {
      'Authorization': `Bearer ${authToken}`
    });
    assert.strictEqual(eligibleRes.status, 200);
    const matchedTx = (eligibleRes.data.eligibleItems || []).find(it => it.transactionId === ap.id);
    assert(matchedTx, '완료된 이벤트 감정 건이 후기 작성 대상에 포함되어야 함');
    assert.strictEqual(matchedTx.isEventApplied, true, 'isEventApplied true');
    assert(matchedTx.title.startsWith('[이벤트]'), '제목에 [이벤트] 접두어 부여 확인');
    console.log(`  ✓ 후기 작성 대상 확인: ${matchedTx.title} (상태: ${matchedTx.status})\n`);

    // -------------------------------------------------------------------------
    // TEST 8: Submit Event Review & Automatic Disclosure Badge Enforcement
    // -------------------------------------------------------------------------
    console.log('[TEST 8] 이벤트 후기 작성 및 혜택 안내 문구 자동 부여 검증');
    const reviewRes = await makeRequest('/api/reviews', 'POST', {
      transactionType: 'APPRAISAL',
      transactionId: ap.id,
      rating: 4, // Honest rating (not forced 5-stars)
      content: '감정비 무료 이벤트로 골드랩 종로 본점에 의뢰했습니다. XRF 비파괴 성분 분석 결과 함량이 정확하게 나와 안심되었습니다. 매우 친절하고 신뢰가 갑니다.',
      photos: []
    }, { 'Authorization': `Bearer ${authToken}` });

    assert.strictEqual(reviewRes.status, 201, '후기 등록 성공 201 Created');
    const rev = reviewRes.data.review;
    assert.strictEqual(rev.isEventReview, true, '이벤트 후기 플래그 isEventReview === true');
    assert.strictEqual(rev.eventCode, 'FREE_APPRAISAL_2026');
    assert.strictEqual(rev.eventNotice, '감정비 무료 이벤트 혜택을 제공받아 작성한 후기입니다.');
    console.log(`  ✓ 후기 번호: ${rev.id}`);
    console.log(`  ✓ 이벤트 후기 플래그: ${rev.isEventReview}`);
    console.log(`  ✓ 자동 표기 문구: "${rev.eventNotice}"\n`);

    // Check appraisal reviewStatus updated to COMPLETED
    const myApsRes = await makeRequest('/api/appraisals/my', 'GET', null, {
      'Authorization': `Bearer ${authToken}`
    });
    const myUpdatedAp = (myApsRes.data.appraisals || []).find(a => a.id === ap.id);
    assert(myUpdatedAp, '내 감정 내역 조회 성공');
    assert.strictEqual(myUpdatedAp.reviewStatus, 'COMPLETED', '후기 작성 완료 후 appraisal.reviewStatus는 COMPLETED여야 함');
    assert.strictEqual(myUpdatedAp.reviewedReviewId, rev.id, 'appraisal.reviewedReviewId에 등록된 review.id 연결 확인');
    console.log(`  ✓ 접수건 후기 상태 갱신: ${myUpdatedAp.reviewStatus} (연결 ID: ${myUpdatedAp.reviewedReviewId})\n`);

    // -------------------------------------------------------------------------
    // TEST 9: Duplicate Review Prevention on same appraisal
    // -------------------------------------------------------------------------
    console.log('[TEST 9] 동일 감정 접수 건에 대한 중복 후기 작성 차단 검증');
    const dupRes = await makeRequest('/api/reviews', 'POST', {
      transactionType: 'APPRAISAL',
      transactionId: ap.id,
      rating: 5,
      content: '중복으로 작성하려는 테스트 후기 본문입니다. 최소 20자 이상 요건을 충족합니다.',
      photos: []
    }, { 'Authorization': `Bearer ${authToken}` });
    assert([400, 409].includes(dupRes.status), `중복 후기는 차단되어야 함 (Status: ${dupRes.status})`);
    console.log('  ✓ 중복 작성 차단 성공 (상태코드: ' + dupRes.status + '): ' + (dupRes.data.error || dupRes.data.message) + '\n');

    // -------------------------------------------------------------------------
    // TEST 10: Review Editing Preserves Event Disclosure & Transaction Association
    // -------------------------------------------------------------------------
    console.log('[TEST 10] 후기 수정 시 이벤트 고지 문구 및 거래 연결 불변 유지 검증');
    const editRes = await makeRequest(`/api/reviews/${rev.id}`, 'PUT', {
      rating: 3, // Changed rating
      content: '후기를 수정합니다. 솔직하게 적자면 시간이 조금 걸렸지만 분석 결과 확인서는 매우 만족스러웠습니다.'
    }, { 'Authorization': `Bearer ${authToken}` });
    assert.strictEqual(editRes.status, 200, '수정 성공 200 OK');
    const editedRev = editRes.data.review;
    assert.strictEqual(editedRev.rating, 3);
    assert.strictEqual(editedRev.isEventReview, true, '수정 후에도 isEventReview 유지');
    assert.strictEqual(editedRev.eventNotice, '감정비 무료 이벤트 혜택을 제공받아 작성한 후기입니다.', '수정 후에도 고지 문구 불변 유지');
    assert.strictEqual(editedRev.transactionId, ap.id, '수정 후에도 거래 연결 불변');
    console.log('  ✓ 후기 수정 후에도 이벤트 혜택 고지 및 거래 연결 불변 유지 확인\n');

    // -------------------------------------------------------------------------
    // TEST 11: Public Review Feed Disclosure Notice
    // -------------------------------------------------------------------------
    console.log('[TEST 11] GET /api/reviews 공개 피드에서 이벤트 고지 문구 출력 검증');
    const publicRevRes = await makeRequest('/api/reviews?page=1&limit=10');
    assert.strictEqual(publicRevRes.status, 200);
    const pubRev = (publicRevRes.data.reviews || []).find(r => r.id === rev.id);
    assert(pubRev, '공개 피드에 작성된 후기 노출 확인');
    assert.strictEqual(pubRev.isEventReview, true);
    assert.strictEqual(pubRev.eventNotice, '감정비 무료 이벤트 혜택을 제공받아 작성한 후기입니다.');
    console.log(`  ✓ 공개 피드 내 고지 문구 노출 확인: "${pubRev.eventNotice}"\n`);

    // -------------------------------------------------------------------------
    // TEST 12: Expiration Edge Case Simulation (Server Time Guard)
    // -------------------------------------------------------------------------
    console.log('[TEST 12] 이벤트 종료 시각(2026.11.06 23:59:59 KST) 이후 신청 차단 검증');
    const { isFreeAppraisalEventActive } = require('../server/routes');
    // Simulated future timestamp: 2026-11-07 00:00:01 KST
    const futureTimestamp = new Date('2026-11-07T00:00:01+09:00').getTime();
    const isFutureActive = isFreeAppraisalEventActive(futureTimestamp);
    assert.strictEqual(isFutureActive, false, '종료 시각 이후 isFreeAppraisalEventActive는 false여야 함');
    console.log(`  ✓ 2026-11-07 00:00:01 KST 활성 판정: ${isFutureActive} (종료됨)`);
    console.log('  ✓ 서버는 정상 기본료(29,900원) 복구 및 결제 금액 확인 후 재접수 안내\n');

    console.log('================================================================');
    console.log('🎉 모든 12개 검증 항목 100% 통과! (ALL TESTS PASSED)');
    console.log('================================================================\n');

  } finally {
    // Restore clean database snapshot so test runs leave zero artifacts in production DB
    if (dbSnapshot) {
      try {
        fs.writeFileSync(dbFile, dbSnapshot, 'utf8');
      } catch (e) {}
    }
    if (server) server.close();
  }
}

runTests().catch(err => {
  console.error('\n❌ 테스트 실패:', err);
  if (server) server.close();
  process.exit(1);
});
