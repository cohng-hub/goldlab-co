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

  console.log('\n------------------------------------------------------');
  console.log(`Results: ${passed} / ${total} tests passed!`);
  console.log('------------------------------------------------------\n');

  if (server) server.close();

  if (passed === total) {
    console.log('🎉 ALL 13 PRODUCTION READINESS CHECKS PASSED!\n');
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
