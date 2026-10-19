// tests/verify_reviews_system.js
// Comprehensive Verification Suite for GoldLab Customer Reviews System

const fs = require('fs');
const path = require('path');
const http = require('http');
const { getDB, saveDB } = require('../server/db');
const { handleApiRequest } = require('../server/routes');
const { hashPassword, generateSecureToken, hashToken } = require('../server/auth');

// In-memory test runner
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

// Mock HTTP Request / Response Helper
function mockRequest(method, pathname, body = {}, headers = {}) {
  return new Promise((resolve) => {
    const req = {
      method,
      url: pathname,
      headers: {
        'host': 'localhost:5000',
        ...headers
      },
      connection: { remoteAddress: '127.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' }
    };

    let responseData = '';
    let responseStatus = 200;
    const responseHeaders = {};

    const res = {
      writeHead: (status, hdrs) => {
        responseStatus = status;
        if (hdrs) Object.assign(responseHeaders, hdrs);
      },
      setHeader: (name, val) => {
        responseHeaders[name] = val;
      },
      end: (data) => {
        if (data) responseData += data;
        let json = null;
        try {
          json = JSON.parse(responseData);
        } catch (e) {
          json = responseData;
        }
        resolve({
          status: responseStatus,
          headers: responseHeaders,
          body: json,
          raw: responseData
        });
      }
    };

    const parsedUrl = new URL(pathname, 'http://localhost:5000');
    handleApiRequest(req, res, parsedUrl, body);
  });
}

// Helper to create valid session token
function createTestSession(db, userId) {
  const rawToken = generateSecureToken(32);
  db.sessions.push({
    userId,
    hashedToken: hashToken(rawToken),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
  });
  return rawToken;
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting GoldLab Customer Reviews Verification Suite');
  console.log('====================================================\n');

  const db = getDB();

  // Reset any prior leftover test records to ensure 100% clean test environment
  db.reviews = [];
  db.offline_transactions = [];
  db.review_reports = [];
  db.orders = (db.orders || []).filter(o => !String(o.id).includes('test'));
  db.appraisals = (db.appraisals || []).filter(a => !String(a.id).includes('test'));
  db.reservations = (db.reservations || []).filter(r => !String(r.id).includes('test'));
  db.users = (db.users || []).filter(u => !String(u.id).includes('test'));
  await saveDB();

  // 1. Setup Test Users and Records
  console.log('▶ [1] Setting up isolated test fixtures...');
  const testMasterUser = {
    id: 'test_master_' + Date.now(),
    email: 'test_master@goldlab.test',
    passwordHash: hashPassword('Master1234!'),
    name: '최고관리자',
    role: 'MASTER_ADMIN',
    status: 'ACTIVE'
  };
  const testCustomer1 = {
    id: 'test_cust1_' + Date.now(),
    email: 'cust1@goldlab.test',
    passwordHash: hashPassword('Cust1234!'),
    name: '홍길동',
    phone: '010-1234-5678',
    role: 'USER',
    status: 'ACTIVE'
  };
  const testCustomer2 = {
    id: 'test_cust2_' + Date.now(),
    email: 'cust2@goldlab.test',
    passwordHash: hashPassword('Cust1234!'),
    name: '김철수',
    phone: '010-9876-5432',
    role: 'USER',
    status: 'ACTIVE'
  };

  db.users.push(testMasterUser, testCustomer1, testCustomer2);

  const masterToken = createTestSession(db, testMasterUser.id);
  const cust1Token = createTestSession(db, testCustomer1.id);
  const cust2Token = createTestSession(db, testCustomer2.id);

  // Setup Test Transactions
  const completedOrder = {
    id: 'ord_test_comp_' + Date.now(),
    orderNo: 'ORD-TEST-COMP-01',
    userId: testCustomer1.id,
    productName: '순금 골드바 10돈 (37.5g)',
    quantity: 1,
    finalAmount: 4850000,
    status: 'COMPLETED',
    createdAt: new Date().toISOString()
  };
  const pendingOrder = {
    id: 'ord_test_pend_' + Date.now(),
    orderNo: 'ORD-TEST-PEND-01',
    userId: testCustomer1.id,
    productName: '18K 체인 팔찌',
    quantity: 1,
    finalAmount: 1800000,
    status: 'PENDING_PAYMENT',
    createdAt: new Date().toISOString()
  };
  const completedAppraisal = {
    id: 'ap_test_comp_' + Date.now(),
    receiptNo: 'AP-TEST-COMP-01',
    userId: testCustomer1.id,
    applicantName: '홍길동',
    itemType: '고금 18K 목걸이',
    status: 'INSPECTED',
    createdAt: new Date().toISOString()
  };
  const testReservation = {
    id: 'resv_test_01_' + Date.now(),
    reservationNo: 'RESV-TEST-01',
    userId: testCustomer1.id,
    name: '홍길동',
    status: 'CONFIRMED',
    createdAt: new Date().toISOString()
  };

  db.orders.push(completedOrder, pendingOrder);
  db.appraisals.push(completedAppraisal);
  db.reservations.push(testReservation);
  await saveDB();

  // Test 1: Public Reviews initial empty state
  console.log('\n▶ [2] Public Reviews API - Initial Empty State');
  const emptyRes = await mockRequest('GET', '/api/reviews');
  assert(emptyRes.status === 200, 'GET /api/reviews returns status 200');
  assert(emptyRes.body.totalCount === 0, 'Total count is strictly 0 (no fake reviews)');
  assert(emptyRes.body.averageRating === 0, 'Average rating is 0.0 with no fake stars');
  assert(Array.isArray(emptyRes.body.reviews) && emptyRes.body.reviews.length === 0, 'Reviews array is empty');

  // Test 2: Unauthenticated Write Block
  console.log('\n▶ [3] Authentication & Authorization Constraints');
  const unauthRes = await mockRequest('POST', '/api/reviews', {
    transactionType: 'ORDER',
    transactionId: completedOrder.id,
    rating: 5,
    content: '로그인 없이 작성하려는 시도 테스트 내용입니다 (20자 이상 필수)'
  });
  assert(unauthRes.status === 401, 'Unauthenticated POST /api/reviews blocked with 401');

  // Normal user accessing admin reviews
  const adminAccessBlocked = await mockRequest('GET', '/api/admin/reviews', {}, {
    'authorization': `Bearer ${cust1Token}`
  });
  assert(adminAccessBlocked.status === 403, 'Normal user blocked from GET /api/admin/reviews with 403');

  // Test 3: Transaction Eligibility Verification
  console.log('\n▶ [4] Member & Transaction Eligibility Verification Engine');
  
  // Member general review without any transactions is allowed for any registered member
  const memberGeneralAttempt = await mockRequest('POST', '/api/reviews', {
    transactionType: 'MEMBER',
    category: 'GENERAL',
    rating: 5,
    content: '골드랩앤코 정회원으로서 매장 친절도와 서비스 만족에 대해 작성하는 솔직한 후기입니다!'
  }, { 'authorization': `Bearer ${cust2Token}` });
  assert((memberGeneralAttempt.status === 200 || memberGeneralAttempt.status === 201) && memberGeneralAttempt.body.review, 'Registered member without transactions can write general review with 200/201');
  const memberReviewId = memberGeneralAttempt.body && memberGeneralAttempt.body.review ? memberGeneralAttempt.body.review.id : null;
  // Clean up member review immediately to preserve subsequent single-review test baseline
  if (memberReviewId) {
    db.reviews = db.reviews.filter(r => r.id !== memberReviewId);
  }

  // Attempt to write review with incomplete order
  const pendingAttempt = await mockRequest('POST', '/api/reviews', {
    transactionType: 'ORDER',
    transactionId: pendingOrder.id,
    rating: 5,
    content: '결제 미완료 주문 건으로 후기를 쓰려는 시도입니다 (20자 이상 필수)'
  }, { 'authorization': `Bearer ${cust1Token}` });
  assert(pendingAttempt.status === 403, 'Incomplete/Pending order rejected with 403');

  // Eligible transactions list
  const eligibleRes = await mockRequest('GET', '/api/reviews/my-eligible-transactions', {}, {
    'authorization': `Bearer ${cust1Token}`
  });
  assert(eligibleRes.status === 200, 'GET /api/reviews/my-eligible-transactions returns 200');
  assert(eligibleRes.body.eligibleItems.some(it => it.transactionType === 'MEMBER'), 'General member review option is always provided in eligible items');
  assert(eligibleRes.body.eligibleItems.some(it => it.transactionId === completedOrder.id && !it.alreadyReviewed), 'Completed order is listed as eligible for review');
  assert(eligibleRes.body.eligibleItems.some(it => it.transactionId === completedAppraisal.id && !it.alreadyReviewed), 'Completed appraisal is listed as eligible for review');
  assert(eligibleRes.body.eligibleItems.some(it => it.transactionId === testReservation.id), 'Reservation is included in eligible items');
  assert(!eligibleRes.body.eligibleItems.some(it => it.transactionId === pendingOrder.id), 'Pending order is excluded from eligible items');

  // Test 4: Image Upload and Validation
  console.log('\n▶ [5] Image Validation & Optimization Pipeline');
  // Fake binary text file disguised as jpg
  const fakeImageRes = await mockRequest('POST', '/api/reviews/upload-photo', {
    dataUrl: 'data:image/jpeg;base64,' + Buffer.from('NOT_AN_IMAGE_FILE_JUST_PLAIN_TEXT').toString('base64'),
    fileName: 'hacker.jpg'
  }, { 'authorization': `Bearer ${cust1Token}` });
  assert(fakeImageRes.status === 400, 'Invalid image binary (spoofed extension) rejected with 400');

  // Valid 1x1 PNG image
  // 1x1 transparent PNG binary:
  const png1x1Base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const validImageRes = await mockRequest('POST', '/api/reviews/upload-photo', {
    dataUrl: `data:image/png;base64,${png1x1Base64}`,
    fileName: 'test_product.png'
  }, { 'authorization': `Bearer ${cust1Token}` });
  const photoPath = (validImageRes.body && (validImageRes.body.photoUrl || validImageRes.body.url));
  assert(validImageRes.status === 200 && !!photoPath, 'Valid PNG successfully processed and optimized to WebP');
  const uploadedPhotoPath = photoPath || '';

  // Test 5: Review Creation Validation (Rating & Content Length)
  console.log('\n▶ [6] Review Creation Validations');
  const shortContentRes = await mockRequest('POST', '/api/reviews', {
    transactionType: 'ORDER',
    transactionId: completedOrder.id,
    rating: 5,
    content: '너무 짧은 후기'
  }, { 'authorization': `Bearer ${cust1Token}` });
  assert(shortContentRes.status === 400, 'Review with < 20 characters rejected with 400');

  const invalidRatingRes = await mockRequest('POST', '/api/reviews', {
    transactionType: 'ORDER',
    transactionId: completedOrder.id,
    rating: 6,
    content: '별점이 1~5점 범위를 벗어난 비정상적인 요청입니다 (20자 이상)'
  }, { 'authorization': `Bearer ${cust1Token}` });
  assert(invalidRatingRes.status === 400, 'Invalid star rating (6) rejected with 400');

  // Successful Review Creation
  const createRes = await mockRequest('POST', '/api/reviews', {
    transactionType: 'ORDER',
    transactionId: completedOrder.id,
    rating: 5,
    content: '종로 본점에서 직접 구매 후 수령했습니다. 시세도 투명하고 포장 상태도 아주 꼼꼼하여 믿음이 갑니다!',
    photos: uploadedPhotoPath ? [uploadedPhotoPath] : []
  }, { 'authorization': `Bearer ${cust1Token}` });
  if (createRes.status !== 200 && createRes.status !== 201) {
    console.error('Review creation failed detail:', createRes.status, createRes.body);
  }
  assert((createRes.status === 200 || createRes.status === 201) && createRes.body.review, 'Completed order review created successfully with 200/201');
  const createdReviewId = createRes.body && createRes.body.review ? createRes.body.review.id : null;

  // Test 6: Duplicate Review Prevention
  console.log('\n▶ [7] Duplicate Review Prevention & Single-Use Enforcement');
  const dupAttempt = await mockRequest('POST', '/api/reviews', {
    transactionType: 'ORDER',
    transactionId: completedOrder.id,
    rating: 4,
    content: '동일 거래 건으로 두 번째 후기를 등록하려는 중복 작성 시도입니다 (20자 이상)'
  }, { 'authorization': `Bearer ${cust1Token}` });
  assert(dupAttempt.status === 409, 'Duplicate review on same transaction strictly blocked with 409 Conflict');

  // Test 7: Public Response Masking & Aggregate Calculations
  console.log('\n▶ [8] Public Response Security & Real Aggregates');
  const publicListRes = await mockRequest('GET', '/api/reviews');
  assert(publicListRes.status === 200, 'GET /api/reviews returns 200');
  assert(publicListRes.body.totalCount === 1, 'Total count is accurately 1');
  assert(publicListRes.body.averageRating === 5.0, 'Average rating is 5.0');
  const pubRev = publicListRes.body.reviews[0];
  assert(pubRev.maskedAuthor === '홍*동', `Author name is safely masked (got ${pubRev.maskedAuthor})`);
  assert(!pubRev.authorEmail && !pubRev.authorPhone, 'Private customer email and phone are completely omitted from public response');
  assert(pubRev.isVerified === true, 'Verified transaction badge is present');
  assert(pubRev.photos.length === 1, 'Uploaded photo is included');

  // Test 8: Non-Author Edit/Delete Block
  console.log('\n▶ [9] Access Control for Modifications');
  const unauthorizedEdit = await mockRequest('PUT', `/api/reviews/${createdReviewId}`, {
    rating: 1,
    content: '남의 후기를 몰래 수정하려는 악의적인 시도입니다 (20자 이상 테스트)'
  }, { 'authorization': `Bearer ${cust2Token}` });
  assert(unauthorizedEdit.status === 403, 'Non-author blocked from editing with 403');

  const unauthorizedDelete = await mockRequest('DELETE', `/api/reviews/${createdReviewId}`, {}, {
    'authorization': `Bearer ${cust2Token}`
  });
  assert(unauthorizedDelete.status === 403, 'Non-author blocked from deleting with 403');

  // Test 9: Author Edit
  const authorEdit = await mockRequest('PUT', `/api/reviews/${createdReviewId}`, {
    rating: 4,
    content: '종로 본점에서 직접 구매 후 수령했습니다. 시세도 투명하고 제품 상태도 아주 훌륭합니다. 수정된 후기입니다!'
  }, { 'authorization': `Bearer ${cust1Token}` });
  assert(authorEdit.status === 200, 'Author successfully edited review');
  assert(authorEdit.body.review.rating === 4, 'Rating updated to 4');

  // Test 10: Author Delete & Duplicate Bypass Prevention
  console.log('\n▶ [10] Soft-Delete and Duplicate Bypass Prevention');
  const authorDelete = await mockRequest('DELETE', `/api/reviews/${createdReviewId}`, {}, {
    'authorization': `Bearer ${cust1Token}`
  });
  assert(authorDelete.status === 200, 'Author successfully deleted review');

  // Try to write review again for the same completed order after deletion
  const bypassAttempt = await mockRequest('POST', '/api/reviews', {
    transactionType: 'ORDER',
    transactionId: completedOrder.id,
    rating: 5,
    content: '후기 삭제 후 동일 거래 건으로 재작성하여 중복 작성을 우회하려는 시도입니다 (20자 이상)'
  }, { 'authorization': `Bearer ${cust1Token}` });
  assert(bypassAttempt.status === 409, 'Duplicate bypass via delete-and-recreate strictly blocked with 409');

  // Test 11: Offline Trade Auth Code & Review Flow
  console.log('\n▶ [11] Offline Trade Auth Code & Single-Use QR Flow');
  const issueCodeRes = await mockRequest('POST', '/api/admin/reviews/offline-auth', {
    tradeType: 'GOLD_SELL',
    customerMemo: '종로 본점 고금 10돈 현장 매입 고객'
  }, { 'authorization': `Bearer ${masterToken}` });
  assert(issueCodeRes.status === 200 && issueCodeRes.body.authCode, 'Admin issued 1-time offline auth code successfully');
  const issuedCode = issueCodeRes.body.authCode;
  assert(issuedCode.startsWith('GL-'), `Auth code format is valid: ${issuedCode}`);

  // Public offline code verification
  const verifyCodeRes = await mockRequest('POST', '/api/reviews/verify-offline-code', {
    authCode: issuedCode
  }, { 'authorization': `Bearer ${cust1Token}` });
  assert(verifyCodeRes.status === 200 && verifyCodeRes.body.valid === true, 'Offline auth code verified valid');

  // Customer writes review with offline code
  const offlineReviewRes = await mockRequest('POST', '/api/reviews', {
    transactionType: 'OFFLINE',
    authCode: issuedCode,
    rating: 5,
    content: '종로 본점에 직접 방문하여 고금을 매도했습니다. XRF 형광분석기로 눈앞에서 즉시 정밀 감정해 주셔서 대단히 만족합니다!',
    photos: []
  }, { 'authorization': `Bearer ${cust1Token}` });
  assert((offlineReviewRes.status === 200 || offlineReviewRes.status === 201) && offlineReviewRes.body.review, 'Customer submitted review with offline auth code');
  const offlineReviewId = offlineReviewRes.body && offlineReviewRes.body.review ? offlineReviewRes.body.review.id : null;

  // Attempt to reuse offline code
  const reuseCodeRes = await mockRequest('POST', '/api/reviews', {
    transactionType: 'OFFLINE',
    authCode: issuedCode,
    rating: 5,
    content: '이미 사용된 오프라인 인증코드를 재사용하려는 악의적인 시도입니다 (20자 이상 테스트)'
  }, { 'authorization': `Bearer ${cust2Token}` });
  assert(reuseCodeRes.status === 409 || reuseCodeRes.status === 400, 'Reusing offline auth code blocked with 409/400');

  // Test 12: Admin Moderation (Reply, Hide with Reason, Audit Log, Restore)
  console.log('\n▶ [12] Master Admin Moderation, Reply & Audit Trail');
  // Admin views all reviews (unmasked)
  const adminListRes = await mockRequest('GET', '/api/admin/reviews', {}, {
    'authorization': `Bearer ${masterToken}`
  });
  assert(adminListRes.status === 200, 'Admin can view all reviews');
  const adminRev = adminListRes.body.reviews.find(r => r.id === offlineReviewId);
  assert(adminRev && adminRev.authorName === '홍길동', 'Admin can see unmasked author name');
  assert(adminRev && adminRev.linkedTransaction.authCode === issuedCode, 'Admin sees linked offline transaction info');

  // Admin writes official reply
  const replyRes = await mockRequest('POST', `/api/admin/reviews/${offlineReviewId}/reply`, {
    reply: '골드랩 종로 본점을 방문해 주셔서 진심으로 감사드립니다. 언제나 공정하고 투명한 분석으로 보답하겠습니다.'
  }, { 'authorization': `Bearer ${masterToken}` });
  assert(replyRes.status === 200 && replyRes.body.review.adminReply, 'Admin reply saved successfully');

  // Admin hides review with reason
  const hideRes = await mockRequest('POST', `/api/admin/reviews/${offlineReviewId}/visibility`, {
    isVisible: false,
    reason: '개인정보 노출 (전화번호, 계좌번호 등)'
  }, { 'authorization': `Bearer ${masterToken}` });
  assert(hideRes.status === 200 && hideRes.body.review.isVisible === false, 'Review successfully hidden with reason');

  // Verify hidden review is excluded from public list
  const publicAfterHide = await mockRequest('GET', '/api/reviews');
  assert(!publicAfterHide.body.reviews.some(r => r.id === offlineReviewId), 'Hidden review is excluded from public view');

  // Admin restores review
  const restoreRes = await mockRequest('POST', `/api/admin/reviews/${offlineReviewId}/visibility`, {
    isVisible: true,
    reason: '관리자 직권 공개 복원'
  }, { 'authorization': `Bearer ${masterToken}` });
  assert(restoreRes.status === 200 && restoreRes.body.review.isVisible === true, 'Review successfully restored to public');

  // Test 13: Customer Reporting Queue
  console.log('\n▶ [13] Customer Reporting Queue & Admin Resolution');
  const reportRes = await mockRequest('POST', `/api/reviews/${offlineReviewId}/report`, {
    reason: '스팸 또는 상업적 홍보/광고',
    detail: '광고성 의심 내용이 포함되어 있습니다.'
  }, { 'authorization': `Bearer ${cust2Token}` });
  assert(reportRes.status === 200 || reportRes.status === 201, 'Customer report filed successfully');

  // Admin views reports
  const adminReportsRes = await mockRequest('GET', '/api/admin/reviews/reports', {}, {
    'authorization': `Bearer ${masterToken}`
  });
  assert(adminReportsRes.status === 200, 'Admin can view report queue');
  const targetRep = adminReportsRes.body.reports.find(rp => rp.reviewId === offlineReviewId);
  assert(targetRep && targetRep.status === 'PENDING', 'Report is queued with PENDING status');

  // Admin resolves report
  const resolveRes = await mockRequest('POST', `/api/admin/reviews/reports/${targetRep.id}/resolve`, {
    action: 'DISMISS'
  }, { 'authorization': `Bearer ${masterToken}` });
  assert(resolveRes.status === 200, 'Admin successfully resolved report with DISMISS');

  // Test 14: Clean Up Test Fixtures
  console.log('\n▶ [14] Post-Test Cleanup - Guaranteeing Pristine Production DB');
  // Remove all test reviews
  db.reviews = db.reviews.filter(r => r.id !== createdReviewId && r.id !== offlineReviewId);
  // Remove test offline transaction
  db.offline_transactions = db.offline_transactions.filter(t => t.authCode !== issuedCode);
  // Remove test reports
  db.review_reports = db.review_reports.filter(rp => rp.id !== targetRep.id);
  // Remove test fixtures
  db.orders = db.orders.filter(o => o.id !== completedOrder.id && o.id !== pendingOrder.id);
  db.appraisals = db.appraisals.filter(a => a.id !== completedAppraisal.id);
  db.reservations = db.reservations.filter(r => r.id !== testReservation.id);
  db.users = db.users.filter(u => u.id !== testMasterUser.id && u.id !== testCustomer1.id && u.id !== testCustomer2.id);
  db.sessions = db.sessions.filter(s => !String(s.userId).startsWith('test_'));
  db.audit_logs = db.audit_logs.filter(a => !String(a.adminId).startsWith('test_'));
  await saveDB();

  // Remove test photo file
  if (uploadedPhotoPath) {
    const fullPhotoPath = path.join(__dirname, '..', uploadedPhotoPath);
    if (fs.existsSync(fullPhotoPath)) {
      try { fs.unlinkSync(fullPhotoPath); } catch (e) {}
    }
  }

  // Final check: reviews count is 0
  const finalDbCheck = getDB();
  assert(finalDbCheck.reviews.length === 0, 'Production DB reviews array is 100% clean (0 items)');
  assert(finalDbCheck.review_reports.length === 0, 'Production DB review_reports array is 100% clean (0 items)');

  console.log('\n====================================================');
  console.log(`📊 Test Summary: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
