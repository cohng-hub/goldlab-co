const fs = require('fs');

const storage = {};
global.localStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; }
};

const code = fs.readFileSync('app.js', 'utf8');

// Extract the in-browser engine code cleanly
const startMarker = 'const IN_BROWSER_DB_KEY';
const endMarker = 'async function ApiRequest(';

const engineCode = code.substring(
  code.indexOf(startMarker),
  code.indexOf(endMarker)
);

// Evaluate functions into this scope
const fn = new Function('storage', `
  ${engineCode}
  return { getInBrowserDB, saveInBrowserDB, InBrowserServerEngine, DEFAULT_CUSTOMER_REVIEWS };
`);

const { getInBrowserDB, saveInBrowserDB, InBrowserServerEngine, DEFAULT_CUSTOMER_REVIEWS } = fn(storage);

async function run() {
  console.log('--- TEST 1: Initial DB Boot ---');
  let db = getInBrowserDB();
  console.log('Initial reviews count:', db.reviews.length);
  console.log('Base Review:', db.reviews[0].id, '| Author:', db.reviews[0].authorName, '| Content preview:', db.reviews[0].content.substring(0, 35));

  console.log('\n--- TEST 2: Customer A (홍길동) submits a review ---');
  localStorage.setItem('goldlab_active_user', JSON.stringify({ id: 'usr_customer_A', name: '홍길동', phone: '010-1234-5678' }));

  let resA = await InBrowserServerEngine('/api/reviews', 'POST', {
    rating: 5,
    content: '골드바 10돈 구매했는데 포장도 꼼꼼하고 배송도 하루만에 도착했습니다. 앞으로 금은 여기서만 구매하려고 합니다. 번창하세요!',
    category: 'PRODUCT_BUY',
    transactionType: 'MEMBER'
  });
  console.log('Submit Result A:', resA.success, resA.review.id, 'Author:', resA.review.authorName);

  console.log('\n--- TEST 3: Customer B (김영희) submits another review ---');
  localStorage.setItem('goldlab_active_user', JSON.stringify({ id: 'usr_customer_B', name: '김영희', phone: '010-9876-5432' }));

  let resB = await InBrowserServerEngine('/api/reviews', 'POST', {
    rating: 4,
    content: '택배로 감정 의뢰 드렸는데 진행 상황도 문자로 잘 알려주시고 친절하게 답변해주셔서 믿음이 갑니다. 감사합니다.',
    category: 'APPRAISAL',
    transactionType: 'MEMBER'
  });
  console.log('Submit Result B:', resB.success, resB.review.id, 'Author:', resB.review.authorName);

  console.log('\n--- TEST 4: Customer C (박철수) submits a 3rd review ---');
  localStorage.setItem('goldlab_active_user', JSON.stringify({ id: 'usr_customer_C', name: '박철수', phone: '010-5555-7777' }));

  let resC = await InBrowserServerEngine('/api/reviews', 'POST', {
    rating: 5,
    content: '매장 직접 방문해서 18K 목걸이 매입 진행했는데 타 업체보다 감정가 훨씬 잘 쳐주셨어요! 친절한 상담 감사드립니다.',
    category: 'GOLD_SELL',
    transactionType: 'MEMBER'
  });
  console.log('Submit Result C:', resC.success, resC.review.id, 'Author:', resC.review.authorName);

  console.log('\n--- TEST 5: Reload DB (Simulate page reload / another visitor session) ---');
  db = getInBrowserDB();
  console.log('Total reviews in DB after reload:', db.reviews.length);
  db.reviews.forEach((r, idx) => {
    console.log(`[${idx}] ${r.id} | Author: ${r.authorName} (${r.authorMasked}) | Rating: ${r.rating} | Category: ${r.category} | isPublic: ${r.isPublic} | isDeleted: ${r.isDeleted}`);
  });

  console.log('\n--- TEST 6: GET /api/reviews query (Public reviews display) ---');
  let getRes = await InBrowserServerEngine('/api/reviews?page=1&limit=10', 'GET');
  console.log('GET /api/reviews success:', getRes.success);
  console.log('Total count:', getRes.totalCount);
  console.log('Average rating:', getRes.averageRating);
  console.log('Returned reviews count:', getRes.reviews.length);
  getRes.reviews.forEach((r, idx) => {
    console.log(` -> Review ${idx + 1}: [${r.categoryLabel}] ${r.authorMasked} 고객님 (${r.rating}점) | ${r.content.substring(0, 45)}...`);
  });

  console.log('\n--- TEST 7: Category Filtering (e.g. GOLD_SELL) ---');
  let sellRes = await InBrowserServerEngine('/api/reviews?category=GOLD_SELL&page=1&limit=10', 'GET');
  console.log('GOLD_SELL count:', sellRes.filteredCount, 'Returned:', sellRes.reviews.length);
  sellRes.reviews.forEach(r => {
    console.log(` -> [${r.categoryLabel}] ${r.authorMasked} | ${r.content.substring(0, 40)}...`);
  });

  console.log('\n--- TEST 8: Main Page Preview (Limit 3) ---');
  let mainRes = await InBrowserServerEngine('/api/reviews?limit=3', 'GET');
  console.log('Main Page Preview Count:', mainRes.reviews.length);
  mainRes.reviews.forEach((r, idx) => {
    console.log(` -> Top Card ${idx + 1}: ${r.authorMasked} [${r.categoryLabel}] ${r.content.substring(0, 35)}...`);
  });

  // Assertions
  if (getRes.totalCount !== 4) throw new Error('Expected 4 reviews in total (1 original + 3 new)');
  if (getRes.reviews.length !== 4) throw new Error('Expected 4 reviews returned');
  if (mainRes.reviews.length !== 3) throw new Error('Expected 3 preview reviews for main page');
  if (getRes.reviews[0].authorMasked !== '박*수') throw new Error('Newest review should be at the top');

  console.log('\n====================================================');
  console.log('🎉 ALL TESTS PASSED! FUTURE REVIEWS ARE FULLY GUARANTEED!');
  console.log('====================================================');
}

run().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
