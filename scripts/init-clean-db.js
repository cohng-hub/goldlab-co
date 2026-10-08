const fs = require('fs');
const path = require('path');
const { hashPassword } = require('../server/auth');

const DB_FILE = path.join(__dirname, '..', 'data', 'goldlab_db.json');

const adminEmail = process.env.ADMIN_EMAIL || 'admin@goldlabnco.com';
const adminPass = process.env.ADMIN_INITIAL_PASSWORD || 'GoldLab2026!MasterSecure';

const cleanDB = {
  version: '2.0.0',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  users: [
    {
      id: 'usr_admin_001',
      email: adminEmail.toLowerCase().trim(),
      passwordHash: hashPassword(adminPass),
      name: '황미숙 대표 (관리자)',
      phone: '010-4017-4988',
      userType: 'MASTER',
      role: 'MASTER_ADMIN',
      tier: '👑 MASTER ADMIN',
      twoFactorEnabled: false,
      twoFactorSecret: null,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ],
  sessions: [],
  password_resets: [],
  appraisals: [],
  certificates: [],
  reservations: [],
  products: [
    {
      id: 'GL-PROD-001',
      name: '24K 순금 포춘 골드바 10돈 (37.5g)',
      category: 'GOLDBAR_24K',
      purity: '24K (순도 99.99%)',
      weightGrams: 37.5,
      weightTolerance: '±0.01g',
      dimensions: '가로 22mm × 세로 36mm',
      price: 7020000,
      priceValidUntil: '당일 영업 마감 시까지 (한국금거래소 기준시세 변동 연동)',
      stock: 15,
      isCustomOrder: false,
      dispatchLeadDays: 1,
      photos: ['assets/sample_goldbar.png'],
      description: '공인 홀마크 정품 인증 각인 및 보안 블리스터 밀봉 패키지 동봉. 순도 99.99% 보증.',
      terms: '귀금속 시세 연동 상품으로 결제 완료 후 단순 변심에 의한 취소/환불이 제한될 수 있습니다.',
      status: 'ACTIVE'
    },
    {
      id: 'GL-PROD-002',
      name: '24K 순금 투자용 미니 골드바 1돈 (3.75g)',
      category: 'GOLDBAR_24K',
      purity: '24K (순도 99.99%)',
      weightGrams: 3.75,
      weightTolerance: '±0.01g',
      dimensions: '가로 11mm × 세로 18mm',
      price: 715000,
      priceValidUntil: '당일 영업 마감 시까지',
      stock: 30,
      isCustomOrder: false,
      dispatchLeadDays: 1,
      photos: ['assets/sample_goldbar.png'],
      description: '소액 투자 및 비상금 보관용 1돈 미니 골드바. 선물용 케이스 기본 제공.',
      terms: '귀금속 특성상 실물 포장 개봉 시 반품 불가.',
      status: 'ACTIVE'
    },
    {
      id: 'GL-PROD-003',
      name: '18K 클래식 샤인 체인 팔찌 (남녀공용)',
      category: 'BRACELET_18K',
      purity: '18K (순도 75.0%)',
      weightGrams: 18.75,
      weightTolerance: '±0.05g (수작업 특성상 미세 오차 발생)',
      dimensions: '길이 18cm / 19cm / 20cm 선택 가능',
      price: 2650000,
      priceValidUntil: '2026.12.31',
      stock: 5,
      isCustomOrder: true,
      dispatchLeadDays: 7,
      photos: ['assets/sample_necklace.png'],
      description: '숙련된 장인의 정밀 프레스 및 광택 마감. 이중 안전 잠금장치 탑재.',
      terms: '주문 제작 상품으로 제작 착수 후 옵션 변경 및 단순 변심 취소 불가.',
      status: 'ACTIVE'
    }
  ],
  orders: [],
  gv_gc_ledgers: [],
  inquiries: [],
  audit_logs: [],
  settings: {
    siteName: 'GoldLab&co',
    appraisal: {
      visitPrice: 29000,
      deliveryPrice: 39000,
      returnShippingFee: 6000,
      isPricePublished: false,
      priceReviewNotice: '위 감정대행 수수료는 검토 중인 초안으로 운영자 확정 후 공지됩니다.'
    },
    membership: {
      gcEarnRateGoldbarPercent: 0.1,
      gcEarnRateJewelryPercent: 1.0,
      gcMaxUsePercent: 5.0,
      gcValidityDays: 365,
      gcRuleDescription: '1 GC = 1원 할인 / 유상충전·예치금·현금화·양도 불가'
    },
    reservation: {
      capacityPerSlot: 2,
      startHour: 10,
      endHour: 18,
      slotDurationMinutes: 30,
      closedDays: [0]
    },
    business: {
      companyName: '골드랩 (GoldLab&co)',
      ceo: '황미숙',
      bizNo: '101-86-77777',
      mailOrderNo: '제 20205-서울종로-XXXX 호 (원본 신고증 확인 대상 항목)',
      address: '서울특별시 종로구 돈화문로 12길',
      tel: '02-765-8888',
      csEmail: 'cs@goldlabnco.com'
    }
  }
};

fs.writeFileSync(DB_FILE, JSON.stringify(cleanDB, null, 2), 'utf8');
console.log('Clean persistent database initialized successfully.');
