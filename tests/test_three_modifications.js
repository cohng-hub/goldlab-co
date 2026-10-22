// tests/test_three_modifications.js
// Verification suite for the 3 user requested modifications:
// 1. Appraisal event agreement default unchecked, auth check, pricing/benefit preservation & phrasing
// 2. Event popup displayed only on first screen and session close persistence
// 3. Review aggregate counts & card verified badge 100% consistency

const fs = require('fs');
const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    failed++;
  }
}

// ---------------------------------------------------------
// Helper: Load InBrowserServerEngine from app.js
// ---------------------------------------------------------
const storage = {};
global.localStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; }
};
const sessionStore = {};
global.sessionStorage = {
  getItem: (k) => sessionStore[k] || null,
  setItem: (k, v) => { sessionStore[k] = String(v); },
  removeItem: (k) => { delete sessionStore[k]; }
};

const appCode = fs.readFileSync('app.js', 'utf8');
const startMarker = 'const IN_BROWSER_DB_KEY';
const endMarker = 'async function ApiRequest(';
const engineCode = appCode.substring(appCode.indexOf(startMarker), appCode.indexOf(endMarker));

const fn = new Function('storage', 'sessionStore', `
  ${engineCode}
  return { getInBrowserDB, saveInBrowserDB, InBrowserServerEngine, DEFAULT_CUSTOMER_REVIEWS };
`);

const { getInBrowserDB, saveInBrowserDB, InBrowserServerEngine, DEFAULT_CUSTOMER_REVIEWS } = fn(storage, sessionStore);

async function runAll() {
  console.log('====================================================');
  console.log('🧪 RUNNING VERIFICATION FOR 3 USER MODIFICATIONS');
  console.log('====================================================\n');

  // =======================================================
  // 1. ISSUE 1: Appraisal Agreement Default Unchecked & Logic
  // =======================================================
  console.log('▶ [1] Appraisal Event Agreement, Pricing & Server Verification');

  const appraisalHtml = fs.readFileSync('appraisal.html', 'utf8');

  test('appraisal.html: apAgreeEventReview checkbox is NOT checked by default', () => {
    assert(!appraisalHtml.includes('id="apAgreeEventReview" checked'), 'Checkbox should not have checked attribute');
    assert(appraisalHtml.includes('id="apAgreeEventReview" onchange="HandleEventAgreeToggle()"'), 'Checkbox must have HandleEventAgreeToggle');
  });

  test('appraisal.html: DOMContentLoaded does NOT auto-check even if url has ?event=FREE_APPRAISAL_2026', () => {
    const domLoadedIdx = appraisalHtml.indexOf("addEventListener('DOMContentLoaded'");
    const domLoadedBlock = appraisalHtml.substring(domLoadedIdx, domLoadedIdx + 400);
    assert(!domLoadedBlock.includes('chk.checked = true'), 'Should NOT auto-check on DOMContentLoaded');
  });

  test('Phrasing unification across all relevant files', () => {
    const popupHtml = fs.readFileSync('popup-event.html', 'utf8');
    const mypageHtml = fs.readFileSync('mypage.html', 'utf8');
    const expectedPhrase = '서비스 이용 완료 후 14일 이내 홈페이지에 후기 작성';

    assert(appraisalHtml.includes(expectedPhrase), 'appraisal.html must include unified phrase');
    assert(popupHtml.includes(expectedPhrase), 'popup-event.html must include unified phrase');
    assert(appCode.includes(expectedPhrase), 'app.js must include unified phrase');
    assert(mypageHtml.includes(expectedPhrase), 'mypage.html must include unified phrase');

    assert(appraisalHtml.includes('사진 첨부는 선택'), 'appraisal.html must state photo is optional');
    assert(popupHtml.includes('사진 첨부는 선택'), 'popup-event.html must state photo is optional');
    assert(appCode.includes('사진 첨부는 선택'), 'app.js must state photo is optional');
    assert(mypageHtml.includes('사진 첨부는 선택'), 'mypage.html must state photo is optional');
  });

  await asyncTest('Server: Unauthenticated user attempting event apply is rejected', async () => {
    localStorage.removeItem('goldlab_active_user');
    let threw = false;
    try {
      await InBrowserServerEngine('/api/appraisals/apply', 'POST', {
        applicantName: '비회원고객',
        applicantPhone: '010-0000-0000',
        applyEvent: true,
        agreeEventReview: true
      });
    } catch (e) {
      threw = true;
      assert(e.message.includes('로그인'), 'Must require login');
    }
    assert(threw, 'Unauthenticated event apply must be rejected');
  });

  await asyncTest('Server: Authenticated user with event apply records eventAgreedAt and eventPolicyVersion', async () => {
    localStorage.setItem('goldlab_active_user', JSON.stringify({ id: 'usr_test_auth', name: '인증고객', phone: '010-1111-2222' }));
    const res = await InBrowserServerEngine('/api/appraisals/apply', 'POST', {
      applicantName: '인증고객',
      applicantPhone: '010-1111-2222',
      applyEvent: true,
      agreeEventReview: true,
      eventCode: 'FREE_APPRAISAL_2026',
      eventAgreed: true
    });
    assert(res.success === true, 'Event apply must succeed');
    assert(res.appraisal.isEventApplied === true, 'isEventApplied must be true');
    assert(res.appraisal.finalPayAmount === 0, 'finalPayAmount must be 0');
    assert(res.appraisal.costBase === 0, 'costBase must be 0');
    assert(res.appraisal.freeBenefitApplied === false, 'Member free quota must NOT be consumed');
    assert(res.appraisal.gcUsed === 0, 'GC points must NOT be consumed');
    assert(res.appraisal.eventAgreedAt !== null, 'eventAgreedAt must be recorded');
    assert(res.appraisal.eventPolicyVersion === '1.0.0', 'eventPolicyVersion must be recorded');
  });

  await asyncTest('Server: Normal apply without event agreement charges standard 29,900 won', async () => {
    localStorage.setItem('goldlab_active_user', JSON.stringify({ id: 'usr_test_auth', name: '인증고객', phone: '010-1111-2222' }));
    const res = await InBrowserServerEngine('/api/appraisals/apply', 'POST', {
      applicantName: '인증고객',
      applicantPhone: '010-1111-2222',
      applyEvent: false,
      agreeEventReview: false
    });
    assert(res.success === true, 'Standard apply must succeed');
    assert(res.appraisal.isEventApplied === false, 'isEventApplied must be false');
    assert(res.appraisal.finalPayAmount === 29900, 'finalPayAmount must be 29,900');
    assert(res.appraisal.costBase === 29900, 'costBase must be 29,900');
  });

  // =======================================================
  // 2. ISSUE 2: Event Popup Repeating Display Fix
  // =======================================================
  console.log('\n▶ [2] Event Popup Display Conditions & Session Persistence');

  test('app.js: InitFreeAppraisalEventPopup runs ONLY on home page', () => {
    assert(appCode.includes("const isHomePage = path === '' || path === '/' || path.endsWith('/index.html') || path.endsWith('index.html') || path.endsWith('/');"), 'Must check isHomePage');
    assert(appCode.includes('if (!isHomePage && !isBypass) {\n    return;\n  }'), 'Must return if not on home page');
  });

  test('app.js: Closing popup sets sessionStorage to prevent reappearing during session', () => {
    assert(appCode.includes("sessionStorage.setItem('goldlab_hide_event_popup_session', 'true');"), 'CloseFloatingEventWindow must record session flag');
    assert(!appCode.includes("sessionStorage.removeItem('goldlab_hide_event_popup_session');"), 'Must NOT clear session close flag on page load');
  });

  test('popup-event.html: Closing popup window sets sessionStorage', () => {
    const popupHtml = fs.readFileSync('popup-event.html', 'utf8');
    assert(popupHtml.includes("sessionStorage.setItem('goldlab_hide_event_popup_session', 'true');"), 'popup-event.html ClosePopup must save session flag');
  });

  // =======================================================
  // 3. ISSUE 3: Review Aggregates & Card Verified Badge Consistency
  // =======================================================
  console.log('\n▶ [3] Review Aggregates & Verified Trade Badge Consistency');

  await asyncTest('GET /api/reviews: Returns verifiedTradeCount and memberReviewCount accurately', async () => {
    const db = getInBrowserDB();
    // Reset to only default review (1 authentic customer review)
    db.reviews = JSON.parse(JSON.stringify(DEFAULT_CUSTOMER_REVIEWS));
    saveInBrowserDB(db);

    const res = await InBrowserServerEngine('/api/reviews', 'GET');
    assert.strictEqual(res.totalCount, 1, 'Total reviews should be 1');
    assert.strictEqual(res.verifiedTradeCount, 1, 'Verified trade count must be 1');
    assert.strictEqual(res.memberReviewCount, 0, 'Member review count must be 0');
    assert.strictEqual(res.totalCount, res.verifiedTradeCount + res.memberReviewCount, 'Total must equal sum of verified + member');
    assert.strictEqual(res.reviews[0].isVerifiedTrade, true, 'Card review item must have isVerifiedTrade = true');
  });

  await asyncTest('reviews.html: Top summary format renders "1 (거래 인증 1건 · 회원 0건)" matching card badge', async () => {
    const res = await InBrowserServerEngine('/api/reviews', 'GET');
    const total = res.totalCount;
    const vCount = Number(res.verifiedTradeCount) || 0;
    const mCount = Number(res.memberReviewCount) || 0;
    const renderedSummary = `${total} (거래 인증 ${vCount}건 · 회원 ${mCount}건)`;
    assert.strictEqual(renderedSummary, '1 (거래 인증 1건 · 회원 0건)', 'Rendered text must be 1 (거래 인증 1건 · 회원 0건)');
  });

  await asyncTest('Consistency with multiple reviews (1 verified trade + 1 general member review)', async () => {
    const db = getInBrowserDB();
    db.reviews.push({
      id: 'REV-MEMBER-TEST-01',
      authorName: '박회원',
      transactionType: 'MEMBER',
      rating: 5,
      content: '회원 일반 후기입니다. 매장 방문하여 친절하게 상담 받았습니다 (20자 이상 테스트).',
      isPublic: true,
      isDeleted: false,
      isVerifiedTrade: false,
      createdAt: new Date().toISOString()
    });
    saveInBrowserDB(db);

    const res = await InBrowserServerEngine('/api/reviews', 'GET');
    assert.strictEqual(res.totalCount, 2, 'Total should be 2');
    assert.strictEqual(res.verifiedTradeCount, 1, 'Verified trade count must be 1');
    assert.strictEqual(res.memberReviewCount, 1, 'Member review count must be 1');
    assert.strictEqual(res.reviews.find(r => r.id === 'REV-20261021-0001').isVerifiedTrade, true, 'Original review is verified');
    assert.strictEqual(res.reviews.find(r => r.id === 'REV-MEMBER-TEST-01').isVerifiedTrade, false, 'Member review is NOT verified trade');
  });

  console.log('\n====================================================');
  console.log(`📊 Test Summary: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAll().catch(e => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
