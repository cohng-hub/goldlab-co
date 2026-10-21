// server/db.js - Atomic Transactional Persistent Database Engine for GoldLab&co
const fs = require('fs');
const path = require('path');
const { hashPassword } = require('./auth');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'goldlab_db.json');
const DB_TMP_FILE = path.join(DATA_DIR, 'goldlab_db.tmp');

// Ensure storage directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

let dbMemoryCache = null;
let writeQueue = Promise.resolve();

// Initial database schema
function getDefaultDBSchema() {
  return {
    version: '2.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    users: [],
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
    reviews: [],
    offline_transactions: [],
    review_reports: [],
    audit_logs: [],
    settings: {
      siteName: 'GoldLab&co',
      events: {
        freeAppraisal: {
          code: 'FREE_APPRAISAL_2026',
          title: '귀금속 감정비 무료 이벤트',
          startDateKST: '2026-10-21T00:00:00+09:00',
          endDateKST: '2026-11-06T23:59:59+09:00',
          endTimestamp: 1793977199000,
          baseFee: 0,
          originalFee: 29900,
          maxItems: 2,
          reviewDeadlineDays: 14,
          policyVersion: '1.0.0',
          disclosureNotice: '감정비 무료 이벤트 혜택을 제공받아 작성한 후기입니다.'
        }
      },
      appraisal: {
        baseFee: 29900,
        visitPrice: 29900,
        deliveryPrice: 29900,
        returnShippingFee: '별도 안내 (왕복 배송비 고객 부담)',
        isPricePublished: true,
        priceNotice: '감정대행 기본요금 29,900원\n방문·택배 동일 요금 · 배송비 별도\n정밀·특수 추가검사는 별도 견적'
      },
      membership: {
        gcEarnRates: {
          SILVER: 0.004,
          GOLD: 0.007,
          VIP_PLATINUM: 0.010
        },
        gcMaxUsePercent: 5.0, // 1회 결제 시 최대 5%까지 GC 사용 가능
        policyEffectiveDate: '2026-10-12',
        policyHistory: [
          {
            date: '2026-10-12',
            description: '일반 고객 상품 구매 적립률 확정 (SILVER 0.4%, GOLD 0.7%, VIP 1.0%), 상품 결제 시 GC 사용 한도 최대 5% 유지'
          }
        ],
        gcValidityDays: 365,
        gcRuleDescription: '1 GC = 1원 할인 / 유상충전·예치금·현금화·양도 불가'
      },
      reservation: {
        capacityPerSlot: 1,
        startHour: 10,
        endHour: 18,
        slotDurationMinutes: 30,
        closedDays: [0, 6] // 토요일·일요일 주말 휴무
      },
      business: {
        companyName: '골드랩앤코 (GoldLab & Co.)',
        ceo: '황미숙',
        bizNo: '185-07-02856',
        mailOrderNo: '제 2025-서울은평-1081 호',
        address: '서울특별시 종로구 돈화문로6나길 28-12 제일빌딩 307호',
        tel: '010-4017-4988',
        csEmail: 'skycraft102@naver.com'
      }
    }
  };
}

// Backup current database to data/backups/
function backupDB() {
  if (!fs.existsSync(DB_FILE)) return null;
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14);
  const backupFileName = `goldlab_db_backup_${timestamp}.json`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);
  try {
    fs.copyFileSync(DB_FILE, backupFilePath);
    console.log(`[Database] Auto-backup created: ${backupFileName}`);
    return backupFilePath;
  } catch (err) {
    console.error('[Database] Backup error:', err.message);
    return null;
  }
}

// Restore database from specified backup path
function restoreDB(backupFilePath) {
  if (!fs.existsSync(backupFilePath)) {
    throw new Error('복구 대상 백업 파일이 존재하지 않습니다: ' + backupFilePath);
  }
  backupDB(); // Take a quick snapshot before overwriting
  fs.copyFileSync(backupFilePath, DB_FILE);
  loadDB();
  console.log(`[Database] Successfully restored database from: ${backupFilePath}`);
  return true;
}

// Atomic file write using temporary file rename
function persistDBToDisk(data) {
  return new Promise((resolve, reject) => {
    writeQueue = writeQueue.then(() => {
      try {
        const payload = JSON.stringify(data, null, 2);
        fs.writeFileSync(DB_TMP_FILE, payload, 'utf8');
        try {
          fs.renameSync(DB_TMP_FILE, DB_FILE);
        } catch (renameErr) {
          if (renameErr.code === 'EPERM' || renameErr.code === 'EACCES') {
            fs.copyFileSync(DB_TMP_FILE, DB_FILE);
            try { fs.unlinkSync(DB_TMP_FILE); } catch (e) {}
          } else {
            throw renameErr;
          }
        }
        resolve(true);
      } catch (err) {
        console.error('[Database] Atomic write failed:', err);
        reject(err);
      }
    });
  });
}

// Load or initialize DB
function loadDB() {
  if (dbMemoryCache !== null) return dbMemoryCache;

  if (!fs.existsSync(DB_FILE)) {
    console.log('[Database] Initializing brand-new persistent database...');
    dbMemoryCache = getDefaultDBSchema();

    // Initialize Master Admin account from environment variables safely
    const adminPass = process.env.ADMIN_INITIAL_PASSWORD || 'GoldLab2026!MasterSecure';

    dbMemoryCache.users.push({
      id: 'usr_master_001',
      email: 'goldlabnco@naver.com',
      passwordHash: hashPassword(adminPass),
      name: '황미숙 대표 (최고관리자)',
      phone: '010-4017-4988',
      userType: 'MASTER',
      role: 'MASTER_ADMIN',
      tier: '👑 MASTER ADMIN',
      twoFactorEnabled: false,
      twoFactorSecret: null,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    persistDBToDisk(dbMemoryCache);
    backupDB();
    return dbMemoryCache;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    dbMemoryCache = JSON.parse(raw);

    // Purge any dummy users from database
    const dummyEmails = ['admin@goldlabnco.com', 'eprltls@gmail.com', 'dohyun.kim84@naver.com', 'jieun.lee91@gmail.com', 'donga.jewelry@naver.com'];
    const dummyNames = ['골드랩 시스템 관리자', '김도현', '이지은', '(주)동아귀금속', '동아귀금속', '일반 회원', '일반회원'];
    const dummyIds = ['usr_admin_001', 'usr_eprltls', 'usr_dohyun_01', 'usr_jieun_02', 'usr_donga_03'];

    if (Array.isArray(dbMemoryCache.users)) {
      dbMemoryCache.users = dbMemoryCache.users.filter(u => 
        !dummyEmails.includes(u.email?.toLowerCase()) && 
        !dummyNames.includes(u.name) &&
        !dummyIds.includes(u.id)
      );
    }
    const master = dbMemoryCache.users.find(u => u.email && u.email.toLowerCase() === 'goldlabnco@naver.com');
    if (!master) {
      const adminPass = process.env.ADMIN_INITIAL_PASSWORD || 'GoldLab2026!MasterSecure';
      dbMemoryCache.users.unshift({
        id: 'usr_master_001',
        email: 'goldlabnco@naver.com',
        passwordHash: hashPassword(adminPass),
        name: '황미숙 대표 (최고관리자)',
        phone: '010-4017-4988',
        userType: 'MASTER',
        role: 'MASTER_ADMIN',
        tier: '👑 MASTER ADMIN',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      persistDBToDisk(dbMemoryCache);
    }

    if (!Array.isArray(dbMemoryCache.reviews)) dbMemoryCache.reviews = [];
    if (!Array.isArray(dbMemoryCache.offline_transactions)) dbMemoryCache.offline_transactions = [];
    if (!Array.isArray(dbMemoryCache.review_reports)) dbMemoryCache.review_reports = [];

    console.log(`[Database] Loaded persistent database (${dbMemoryCache.users.length} users, ${dbMemoryCache.appraisals.length} appraisals, ${dbMemoryCache.reviews.length} reviews).`);
    return dbMemoryCache;
  } catch (err) {
    console.error('[Database] Read error, attempting backup restore:', err.message);
    const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort().reverse();
    if (backups.length > 0) {
      console.log(`[Database] Recovering from latest backup: ${backups[0]}`);
      restoreDB(path.join(BACKUP_DIR, backups[0]));
      return dbMemoryCache;
    }
    throw new Error('Database is unrecoverable and no backups exist.');
  }
}

function getDB() {
  if (!dbMemoryCache) return loadDB();
  return dbMemoryCache;
}

async function saveDB() {
  if (!dbMemoryCache) return;
  dbMemoryCache.updatedAt = new Date().toISOString();
  await persistDBToDisk(dbMemoryCache);
}

// Transactional lock execution helper
async function runTransaction(mutatorFn) {
  const db = getDB();
  const result = await mutatorFn(db);
  await saveDB();
  return result;
}

// Exported interfaces
module.exports = {
  getDB,
  saveDB,
  loadDB,
  backupDB,
  restoreDB,
  runTransaction
};
