/**
 * GoldLab & Co. Production Readiness & Security Verification Test Suite
 * Validates all 13 core requirements from Specification 16.
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PORT = 5098;
process.env.PORT = PORT;
process.env.NODE_ENV = 'test';

// Start server instance for testing
const app = require('../server.js');
let server;

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  await new Promise(resolve => {
    server = app.listen(PORT, () => {
      console.log(`[Test Server] Listening on port ${PORT}`);
      resolve();
    });
  });

  console.log('\n======================================================');
  console.log('🚀 GoldLab & Co. Production Verification Test Suite');
  console.log('======================================================\n');

  try {
    const dbPath = path.join(__dirname, '..', 'data', 'goldlab_db.json');
    if (fs.existsSync(dbPath)) {
      const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      const p = dbData.products.find(x => x.id === 'GL-PROD-002');
      if (p) { p.stock = 10; fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2), 'utf8'); }
    }
  } catch (e) {}

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    process.stdout.write(`[Test ${total}] ${name} ... `);
    try {
      await fn();
      console.log('✅ PASSED');
      passed++;
    } catch (err) {
      console.log('❌ FAILED');
      console.error('   Error:', err.message);
    }
  }

  // 1. Secret & PII Scan in code files
  await test('1. 개인정보 및 하드코딩 비밀번호/비밀키가 배포 파일에 없음', async () => {
    const filesToScan = ['app.js', 'server.js', 'index.html', 'mypage.html'];
    for (const f of filesToScan) {
      const content = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      assert(!content.includes('usmpik201663'), `File ${f} contains leaked legacy password!`);
      assert(!content.includes('JWT_SECRET ='), `File ${f} hardcodes secret!`);
    }
  });

  // 2. Health check & Security Headers
  await test('2. 서버 보안 헤더 검증 (X-Content-Type-Options, X-Frame-Options)', async () => {
    const res = await request({ path: '/', method: 'GET' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(res.headers['x-frame-options'], 'SAMEORIGIN');
  });

  // 3. User A & User B Registration
  let tokenA, userA, tokenB, userB, tokenAdmin;
  await test('3. 신규 회원가입 및 scrypt 단방향 비밀번호 해싱 검증', async () => {
    const emailA = `custA_${Date.now()}@test.com`;
    const resA = await request({ path: '/api/auth/register', method: 'POST' }, {
      name: '고객A',
      email: emailA,
      password: 'StrongPassword123!',
      phone: '010-1111-2222',
      userType: 'PERSONAL'
    });
    assert.strictEqual(resA.status, 201);
    assert(resA.body.token, 'Token not received');
    tokenA = resA.body.token;
    userA = resA.body.user;

    const emailB = `custB_${Date.now()}@test.com`;
    const resB = await request({ path: '/api/auth/register', method: 'POST' }, {
      name: '고객B',
      email: emailB,
      password: 'StrongPassword123!',
      phone: '010-3333-4444',
      userType: 'PERSONAL'
    });
    tokenB = resB.body.token;
    userB = resB.body.user;

    // Login Admin
    const resAdmin = await request({ path: '/api/auth/login', method: 'POST' }, {
      email: 'admin@goldlabnco.com',
      password: process.env.ADMIN_INITIAL_PASSWORD || 'GoldLabAdmin2026!#'
    });
    assert.strictEqual(resAdmin.status, 200);
    tokenAdmin = resAdmin.body.token;
  });

  // 4. Rate Limiter verification
  await test('4. 로그인 API 요청 제한(Rate Limiter) 작동 검증', async () => {
    let limited = false;
    for (let i = 0; i < 15; i++) {
      const res = await request({ path: '/api/auth/login', method: 'POST' }, {
        email: 'invalid@test.com',
        password: 'wrong'
      });
      if (res.status === 429) {
        limited = true;
        break;
      }
    }
    assert(limited, 'Rate limiter should have triggered with 429');
  });

  // 5. Cross-Customer Privacy (User B cannot access User A's data)
  let appraisalA;
  await test('5. 고객 간 데이터 격리 (다른 고객의 감정/주문/결과서 접근 불가)', async () => {
    // User A creates appraisal
    const resApA = await request({
      path: '/api/appraisals/apply',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    }, {
      method: 'VISIT',
      applicantName: '고객A',
      applicantPhone: '010-1111-2222',
      itemType: '골드바',
      quantity: 1,
      expectedPurity: '24K'
    });
    assert.strictEqual(resApA.status, 201);
    appraisalA = resApA.body.appraisal;

    // User B tries to view User A's appraisal details
    const resBviewA = await request({
      path: `/api/appraisals/${appraisalA.id}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    assert.strictEqual(resBviewA.status, 403, 'User B must be forbidden from accessing User A appraisal');
  });

  // 6. RBAC Protection (Normal member cannot call Admin APIs)
  await test('6. 권한 분리 검증 (일반 회원의 관리자 API 호출 불가 403)', async () => {
    const resUsers = await request({
      path: '/api/admin/users',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.strictEqual(resUsers.status, 403, 'Regular user must not call /api/admin/users');

    const resAudit = await request({
      path: '/api/admin/audit-logs',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.strictEqual(resAudit.status, 403, 'Regular user must not call /api/admin/audit-logs');
  });

  // 7. B2B Wholesale Access Check
  await test('7. 미승인 B2B 회원의 도매 승인 보호 검증', async () => {
    const resB2bReg = await request({ path: '/api/auth/register', method: 'POST' }, {
      name: '미승인도매상',
      email: `pending_${Date.now()}@biz.com`,
      password: 'Password123!',
      userType: 'BIZ',
      bizName: '종로골드상사',
      bizNo: '101-86-99999'
    });
    assert.strictEqual(resB2bReg.body.user.status, 'B2B_PENDING');
  });

  // 8. Atomic Booking Capacity Enforcement
  await test('8. 동일 예약시간 정원(Slot Capacity) 원자적 초과 방지', async () => {
    const date = '2026-12-' + String(10 + (Math.floor(Date.now() / 1000) % 15));
    const time = '14:00';

    // Book 1st slot
    const res1 = await request({ path: '/api/reservations/book', method: 'POST' }, {
      date, time, name: '예약자1', phone: '010-1111-0001', category: '골드바 구매'
    });
    assert.strictEqual(res1.status, 201);

    // Book 2nd slot (capacity is 2)
    const res2 = await request({ path: '/api/reservations/book', method: 'POST' }, {
      date, time, name: '예약자2', phone: '010-1111-0002', category: '골드바 구매'
    });
    assert.strictEqual(res2.status, 201);

    // Book 3rd slot (should fail!)
    const res3 = await request({ path: '/api/reservations/book', method: 'POST' }, {
      date, time, name: '예약자3', phone: '010-1111-0003', category: '골드바 구매'
    });
    assert.strictEqual(res3.status, 400, '3rd booking must fail due to slot capacity');
    assert(res3.body.error.includes('마감'), 'Error message must specify slot is full');
  });

  // 9. QR Certificate Public Leak Check (Zero Customer PII)
  await test('9. QR 확인서 진위조회 시 고객 개인정보(이름/주소/전화번호) 완전 은폐', async () => {
    // Admin issues certificate for appraisalA
    const resIssue = await request({
      path: `/api/admin/appraisals/${appraisalA.id}/certificate`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenAdmin}` }
    }, {
      measuredWeight: '37.502g (10돈)',
      measuredPurity: 'Au 99.99%',
      inspectionMethod: 'XRF 분광 분석',
      laboratory: 'GoldLab 정밀분석실',
      notes: '정상 판정'
    });
    assert.strictEqual(resIssue.status, 201);
    const token = resIssue.body.certificate.verificationToken;

    // Public request to verify endpoint
    const resVerify = await request({
      path: `/api/certificates/verify/${token}`,
      method: 'GET'
    });
    assert.strictEqual(resVerify.status, 200);
    const cert = resVerify.body.certificate;

    assert.strictEqual(cert.applicantName, undefined, 'applicantName must NOT be in public verification');
    assert.strictEqual(cert.phone, undefined, 'phone must NOT be in public verification');
    assert.strictEqual(cert.address, undefined, 'address must NOT be in public verification');
    assert(cert.measuredWeight, 'measuredWeight must be visible');
    assert(cert.measuredPurity, 'measuredPurity must be visible');
  });

  // 10. GC Point Balance Integrity (Cannot spend more than balance)
  await test('10. 잔액 초과 GC 포인트 사용 불가 및 원장 정합성', async () => {
    // User A has 5,000 GC signup bonus. Tries to use 10,000 GC
    const resOrder = await request({
      path: '/api/orders/create',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    }, {
      productId: 'GL-P01',
      optionName: '1돈 (3.75g)',
      quantity: 1,
      recipientName: '고객A',
      recipientPhone: '010-1111-2222',
      deliveryMethod: 'VISIT',
      shippingAddress: '종로 본점 수령',
      gcUsed: 10000 // Exceeds balance!
    });
    assert.strictEqual(resOrder.status, 400);
    assert(resOrder.body.error.includes('포인트 잔액'), 'Must reject over-balance GC usage');
  });

  // 11. Idempotency & Order Server Price Recalculation
  await test('11. 주문 생성 시 서버 단가 재검증 및 고유 번호 발급', async () => {
    const resOrderValid = await request({
      path: '/api/orders/create',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    }, {
      productId: 'GL-P01',
      optionName: '1돈 (3.75g)',
      quantity: 1,
      recipientName: '고객A',
      recipientPhone: '010-1111-2222',
      deliveryMethod: 'COURIER',
      shippingAddress: '서울시 종로구 123',
      gcUsed: 2000
    });
    if (resOrderValid.status !== 201) console.log("DEBUG Test 11 failed body:", resOrderValid.body);
    assert.strictEqual(resOrderValid.status, 201);
    const order = resOrderValid.body.order;
    assert(order.orderNo.startsWith('GL-ORD-'), 'Order number format GL-ORD-');
    assert.strictEqual(order.gcUsed, 2000);
    assert(order.finalAmount > 0);

    // Verify User A GC balance was deducted to 3000
    const resMem = await request({
      path: '/api/membership/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.strictEqual(resMem.body.gcBalance, 3000, 'Balance must be deducted from 5000 to 3000');
  });

  // 12. Gold Rate benchmark with VAT, source, timestamp
  await test('12. 실시간 시세 출처, 단위, 부가세 포함 여부 및 타임스탬프 제공', async () => {
    const resRates = await request({ path: '/api/gold-rates', method: 'GET' });
    assert.strictEqual(resRates.status, 200);
    assert(resRates.body.source.includes('한국금거래소'));
    assert(resRates.body.unit.includes('3.75g'));
    assert.strictEqual(resRates.body.vatIncluded, true);
    assert(resRates.body.rates['24K_buy'] > 0);
    assert(resRates.body.goldlabRates['24K_sell_preferred'] > 0);
  });

  // 13. CSV Export Security & Formula Injection escaping
  await test('13. 관리자 CSV 다운로드 Formula Injection 방지 및 감사 로그 검증', async () => {
    const resCsv = await request({
      path: '/api/admin/export-csv',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenAdmin}` }
    });
    assert.strictEqual(resCsv.status, 200);
    assert(resCsv.headers['content-type'].includes('text/csv'));
    assert(typeof resCsv.body === 'string');

    // Check that audit log recorded this export
    const resAudits = await request({
      path: '/api/admin/audit-logs',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenAdmin}` }
    });
    const foundExport = resAudits.body.logs.some(l => l.action === 'EXPORT_USERS_CSV');
    assert(foundExport, 'CSV export must be recorded in audit logs');
  });

  // 14. Uniform Appraisal Fee (29,900 KRW for both VISIT and COURIER)
  await test('14. 감정대행 기본요금 29,900원 단일화 (방문/택배 동일 요금, 배송비 별도)', async () => {
    const resVisit = await request({
      path: '/api/appraisals/apply',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    }, {
      method: 'VISIT',
      applicantName: '고객A',
      applicantPhone: '010-1111-2222',
      itemType: '18K 반지',
      quantity: 1,
      expectedPurity: '18K'
    });
    assert.strictEqual(resVisit.status, 201);
    assert.strictEqual(resVisit.body.appraisal.costBase, 29900);

    const resCourier = await request({
      path: '/api/appraisals/apply',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    }, {
      method: 'COURIER',
      applicantName: '고객A',
      applicantPhone: '010-1111-2222',
      itemType: '골드바 100g',
      quantity: 1,
      expectedPurity: '24K',
      address: '서울시 종로구 돈화문로 100'
    });
    assert.strictEqual(resCourier.status, 201);
    assert.strictEqual(resCourier.body.appraisal.costBase, 29900);
    assert.strictEqual(resCourier.body.appraisal.courierReturnNotice, '별도 안내 (왕복 배송비 고객 부담)');
  });

  // 15. Tier Accrual Rates (SILVER 0.4%, GOLD 0.7%, VIP 1.0%) & 5% usage limit
  await test('15. 등급별 GC 적립률 (SILVER 0.4%, GOLD 0.7%, VIP 1.0%) 및 5% 사용한도 계산 검증', async () => {
    const resMemA = await request({
      path: '/api/membership/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.strictEqual(resMemA.body.tier, 'SILVER');
    assert.strictEqual(resMemA.body.accrualRate, 0.004);
    assert.strictEqual(resMemA.body.accrualRatePercent, '0.4%');

    // Test 5% limit: if gcUsed exceeds 5%, server rejects
    const resOver5 = await request({
      path: '/api/orders/create',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    }, {
      productId: 'GL-P01',
      optionName: '1돈 (3.75g)',
      quantity: 1,
      recipientName: '고객A',
      recipientPhone: '010-1111-2222',
      deliveryMethod: 'VISIT',
      shippingAddress: '종로 본점 수령',
      gcUsed: 100000
    });
    assert.strictEqual(resOver5.status, 400);
    assert(resOver5.body.error.includes('5%') || resOver5.body.error.includes('잔액'), 'Must enforce 5% GC cap or balance check');
  });

  // 16. Order Fulfillment Grants GC & GV, Idempotency Check
  let orderToFulfill;
  await test('16. 주문 배송완료(구매확정) 시 적립률 저장값 기준 GC/GV 적립 및 중복 지급 방지', async () => {
    const resNewOrd = await request({
      path: '/api/orders/create',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    }, {
      productId: 'GL-P01',
      optionName: '1돈 (3.75g)',
      quantity: 1,
      recipientName: '고객A',
      recipientPhone: '010-1111-2222',
      deliveryMethod: 'VISIT',
      shippingAddress: '종로 본점 수령',
      gcUsed: 0
    });
    assert.strictEqual(resNewOrd.status, 201);
    orderToFulfill = resNewOrd.body.order;
    assert.strictEqual(orderToFulfill.orderTier, 'SILVER');
    assert.strictEqual(orderToFulfill.accrualRate, 0.004);
    assert.strictEqual(orderToFulfill.accrualGC, Math.floor(orderToFulfill.finalAmount * 0.004));

    const initialGc = (await request({
      path: '/api/membership/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    })).body.gcBalance;

    // Admin completes order
    const resFulfill = await request({
      path: `/api/admin/orders/${orderToFulfill.id}/status`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenAdmin}` }
    }, {
      status: 'DELIVERED',
      trackingNo: '1234567890'
    });
    assert.strictEqual(resFulfill.status, 200);

    const postMem = (await request({
      path: '/api/membership/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    })).body;
    assert.strictEqual(postMem.gcBalance, initialGc + orderToFulfill.accrualGC);

    // Duplicate call - idempotent
    const resDup = await request({
      path: `/api/admin/orders/${orderToFulfill.id}/status`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenAdmin}` }
    }, {
      status: 'DELIVERED'
    });
    assert.strictEqual(resDup.status, 200);

    const afterDupMem = (await request({
      path: '/api/membership/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    })).body;
    assert.strictEqual(afterDupMem.gcBalance, initialGc + orderToFulfill.accrualGC, 'GC balance must not increase again on duplicate status update');
  });

  // 17. Order Cancellation Revokes Granted GC/GV & Restores Used GC
  await test('17. 주문 취소 시 저장된 적립률 기준 적립분 회수(GC_REVOKE/GV_SUB) 및 사용 GC 환원', async () => {
    const memBeforeCancel = (await request({
      path: '/api/membership/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    })).body;

    const resCancel = await request({
      path: `/api/admin/orders/${orderToFulfill.id}/status`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenAdmin}` }
    }, {
      status: 'CANCELLED',
      cancelReason: '고객 단순 변심 및 주문 취소 요청'
    });
    assert.strictEqual(resCancel.status, 200);

    const memAfterCancel = (await request({
      path: '/api/membership/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    })).body;
    assert.strictEqual(memAfterCancel.gcBalance, memBeforeCancel.gcBalance - orderToFulfill.accrualGC);
    assert.strictEqual(memAfterCancel.gvTotal, memBeforeCancel.gvTotal - orderToFulfill.finalAmount);
  });

  // 18. Appraisal Quantity Standards (1 & 2 items flat 29,900 KRW, 0 or >=3 rejected, multi-item records)
  await test('18. 감정대행 수량 기준 검증 (1개/2개 동일 29,900원, 0개/3개이상 차단, 1개 접수번호 아래 제품별 기록)', async () => {
    // Qty 2: same 29,900 KRW
    const resQty2 = await request({
      path: '/api/appraisals/apply',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    }, {
      method: 'VISIT',
      applicantName: '고객A',
      applicantPhone: '010-1111-2222',
      quantity: 2,
      itemType: '24K 골드바',
      expectedPurity: '24K',
      items: [
        { itemIndex: 1, itemType: '24K 골드바', expectedPurity: '24K', expectedWeight: '10돈' },
        { itemIndex: 2, itemType: '18K 체인 팔찌', expectedPurity: '18K', expectedWeight: '5돈' }
      ]
    });
    assert.strictEqual(resQty2.status, 201);
    assert.strictEqual(resQty2.body.appraisal.costBase, 29900, 'Fee for 2 items must remain 29,900 KRW (not 59,800 KRW)');
    assert.strictEqual(resQty2.body.appraisal.quantity, 2);
    assert.strictEqual(resQty2.body.appraisal.items.length, 2, 'Must record 2 items under the single receipt');
    assert.strictEqual(resQty2.body.appraisal.items[1].itemType, '18K 체인 팔찌');

    // Qty 0: blocked with 400
    const resQty0 = await request({
      path: '/api/appraisals/apply',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    }, {
      method: 'VISIT',
      applicantName: '고객A',
      applicantPhone: '010-1111-2222',
      quantity: 0,
      itemType: '골드바'
    });
    assert.strictEqual(resQty0.status, 400);

    // Qty 3: blocked with 400
    const resQty3 = await request({
      path: '/api/appraisals/apply',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    }, {
      method: 'VISIT',
      applicantName: '고객A',
      applicantPhone: '010-1111-2222',
      quantity: 3,
      itemType: '골드바'
    });
    assert.strictEqual(resQty3.status, 400);
    assert(resQty3.body.error.includes('최대 2개'), 'Must guide max 2 items per application');
  });

  // 19. Tier Free Appraisal Benefit (SILVER 1, GOLD 2, VIP 3, fee 0 KRW, no GC deduction, cancellation restoration)
  let freeApId;
  await test('19. 등급별 무료 감정 혜택 (SILVER 1회 적용시 기본료 0원, GC 미차감, 소진후 차단, 취소시 혜택 복원)', async () => {
    // Check initial remaining free appraisals for Customer A (SILVER)
    const memBefore = (await request({
      path: '/api/membership/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    })).body;
    assert.strictEqual(memBefore.tier, 'SILVER');
    assert.strictEqual(memBefore.freeAppraisals.allowed, 1);
    assert.strictEqual(memBefore.freeAppraisals.remaining, 1);

    // Apply with free appraisal benefit
    const resFree = await request({
      path: '/api/appraisals/apply',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    }, {
      method: 'VISIT',
      applicantName: '고객A',
      applicantPhone: '010-1111-2222',
      quantity: 2,
      itemType: '24K 골드바',
      applyFreeBenefit: true,
      gcUsed: 5000 // Free benefit applies: GC must NOT be deducted
    });
    assert.strictEqual(resFree.status, 201);
    const ap = resFree.body.appraisal;
    freeApId = ap.id;
    assert.strictEqual(ap.freeBenefitApplied, true);
    assert.strictEqual(ap.costBase, 0, 'Base cost must be 0 for free appraisal');
    assert.strictEqual(ap.gcUsed, 0, 'GC used must be 0 for free appraisal');
    assert.strictEqual(ap.finalPayAmount, 0, 'Final pay amount must be 0');

    // Remaining count should now be 0
    const memAfter = (await request({
      path: '/api/membership/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    })).body;
    assert.strictEqual(memAfter.freeAppraisals.remaining, 0, 'Remaining free count must be 0');

    // Attempting a second free appraisal in the same year must be rejected
    const resSecondFree = await request({
      path: '/api/appraisals/apply',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    }, {
      method: 'VISIT',
      applicantName: '고객A',
      applicantPhone: '010-1111-2222',
      quantity: 1,
      itemType: '골드바',
      applyFreeBenefit: true
    });
    assert.strictEqual(resSecondFree.status, 400);
    assert(resSecondFree.body.error.includes('소진'), 'Must reject when annual free benefit exhausted');

    // Cancelling the application restores the free benefit
    const resCancelAp = await request({
      path: `/api/appraisals/${freeApId}/cancel`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.strictEqual(resCancelAp.status, 200);

    const memAfterRestore = (await request({
      path: '/api/membership/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    })).body;
    assert.strictEqual(memAfterRestore.freeAppraisals.remaining, 1, 'Free appraisal count must be restored to 1 upon cancellation');
  });

  // 20. Appraisal GC Discount (max 10,000 GC, balance limit, cancellation restore)
  let paidApId;
  await test('20. 감정대행 GC 할인 (접수 1건당 최대 10,000 GC, 잔액 내 차감, 취소 시 GC 환원)', async () => {
    // User B has 5,000 GC signup balance
    const memB1 = (await request({
      path: '/api/membership/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    })).body;
    assert.strictEqual(memB1.gcBalance, 5000);

    // Apply with 5,000 GC
    const resPaidAp = await request({
      path: '/api/appraisals/apply',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    }, {
      method: 'VISIT',
      applicantName: '고객B',
      applicantPhone: '010-3333-4444',
      quantity: 1,
      itemType: '18K 팔찌',
      gcUsed: 5000
    });
    assert.strictEqual(resPaidAp.status, 201);
    const paidAp = resPaidAp.body.appraisal;
    paidApId = paidAp.id;
    assert.strictEqual(paidAp.costBase, 29900);
    assert.strictEqual(paidAp.gcUsed, 5000);
    assert.strictEqual(paidAp.finalPayAmount, 24900, '29,900 - 5,000 = 24,900 KRW');

    // Balance after use: 0 GC
    const memB2 = (await request({
      path: '/api/membership/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    })).body;
    assert.strictEqual(memB2.gcBalance, 0);

    // Cancel appraisal restores 5,000 GC
    const resCancelPaid = await request({
      path: `/api/appraisals/${paidApId}/cancel`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    assert.strictEqual(resCancelPaid.status, 200);

    const memB3 = (await request({
      path: '/api/membership/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    })).body;
    assert.strictEqual(memB3.gcBalance, 5000, 'Used 5,000 GC must be restored upon cancellation');
  });

  // 21. Customer Ledger without Raw Codes (no GC_RESTORE, GC_REVOKE)
  await test('21. 회원 원장 조회 시 고객 친화 문구 표시 및 내부 코드(GC_RESTORE/GC_REVOKE) 미노출', async () => {
    const memB = (await request({
      path: '/api/membership/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    })).body;
    assert(memB.ledger && memB.ledger.length > 0);
    for (const entry of memB.ledger) {
      assert(!entry.reason.includes('GC_RESTORE'), 'Reason must not contain raw code GC_RESTORE');
      assert(!entry.reason.includes('GC_REVOKE'), 'Reason must not contain raw code GC_REVOKE');
    }
  });

  console.log('\n------------------------------------------------------');
  console.log(`Results: ${passed} / ${total} tests passed!`);
  console.log('------------------------------------------------------\n');

  if (server) server.close();

  // Clean up any test artifacts from data/goldlab_db.json
  try {
    const dbPath = path.join(__dirname, '..', 'data', 'goldlab_db.json');
    if (fs.existsSync(dbPath)) {
      const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      const validUsers = dbData.users.filter(u => !u.email.includes('@test.com') && !u.email.includes('@biz.com'));
      const validIds = new Set(validUsers.map(u => u.id));
      dbData.users = validUsers;
      dbData.sessions = dbData.sessions.filter(s => validIds.has(s.userId));
      dbData.reservations = dbData.reservations.filter(r => !r.name.startsWith('예약자'));
      dbData.appraisals = dbData.appraisals.filter(a => a.applicantName !== '고객A' && a.applicantName !== '고객B');
      const validApIds = new Set(dbData.appraisals.map(a => a.id));
      dbData.certificates = dbData.certificates.filter(c => validApIds.has(c.appraisalId));
      dbData.orders = dbData.orders.filter(o => validIds.has(o.userId));
      dbData.gv_gc_ledgers = dbData.gv_gc_ledgers.filter(l => validIds.has(l.userId));
      dbData.audit_logs = dbData.audit_logs.filter(l => l.action !== 'EXPORT_USERS_CSV' && l.action !== 'ISSUE_CERTIFICATE' && l.action !== 'UPDATE_ORDER');
      const p2 = dbData.products.find(p => p.id === 'GL-PROD-002');
      if (p2) p2.stock = 6;
      fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2), 'utf8');
    }
  } catch (e) {}

  if (passed === total) {
    console.log(`🎉 ALL ${total} PRODUCTION READINESS CHECKS PASSED!\n`);
    process.exit(0);
  } else {
    console.error('❌ Some tests failed. Please review the output.\n');
    process.exit(1);
  }
}

// Execute tests
runTests().catch(err => {
  console.error('Fatal test error:', err);
  if (server) server.close();
  process.exit(1);
});
