import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, query, orderBy, limit, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { productServices, industries, personas, situations, difficulties, securityProducts, cloudEnvironments } from '../js/data.js';
import { roleProfiles, industryProfiles, cloudEnvProfiles, securityProductProfiles, difficultyBehaviors, HINTS } from '../js/profiles.js';

// ============================================================
// CONFIG — 外部服務端點（需與 worker.js 部署對齊）
// ============================================================
const CONFIG = {
  // RAG 留空則停用，練習仍可正常進行（使用 profiles.js 的硬編碼設定）
  workerUrl: 'https://sales-roleplay-worker.awsjin510-roleplay.workers.dev',
  appToken: 'Ab99050863',
};

// Firebase 專案設定（Web API key 本來就是公開的，安全性靠 Firestore rules）
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAxoGcv67TnIYrn6ytO9psVOtybY0a0oW8",
  authDomain: "roleplay-training.firebaseapp.com",
  projectId: "roleplay-training",
  storageBucket: "roleplay-training.firebasestorage.app",
  messagingSenderId: "759367183812",
  appId: "1:759367183812:web:595bfc7e19c40344d58891",
};

// ============================================================
// DATA（清單與轉盤頁共用 js/data.js，設定檔共用 js/profiles.js）
// ============================================================
const SLOT_DATA = {
  產品服務: { icon: "🎯", items: productServices },
  產業: { icon: "🏢", items: industries },
  角色: { icon: "🧑‍💼", items: personas },
  情境: { icon: "📋", items: situations },
  難度: { icon: "🔥", color: "red", items: difficulties },
  資安項目: { icon: "🔒", items: securityProducts },
  雲端環境: { icon: "☁️", items: cloudEnvironments },
};
const BASE_CATEGORIES = Object.keys(SLOT_DATA).filter(c => c !== '雲端環境' && c !== '資安項目');
const ALL_CATEGORIES = Object.keys(SLOT_DATA);

// ============================================================
// API 常數
// ============================================================
const API_URL = 'https://api.anthropic.com/v1/messages';
const CHAT_MODEL = 'claude-sonnet-4-6';
const TEST_MODEL = 'claude-haiku-4-5-20251001';

function apiHeaders(apiKey) {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

// ============================================================
function getApiKey() { return localStorage.getItem('anthropic_api_key') || ''; }
function saveApiKey(k) { localStorage.setItem('anthropic_api_key', k.trim()); }
function clearApiKey() { localStorage.removeItem('anthropic_api_key'); }

// Firebase init（模組化 SDK，隨 bundle 打包，不再依賴 CDN）
let db = null;
let auth = null;
let authReady = Promise.resolve(null);
try {
  const app = initializeApp(FIREBASE_CONFIG);
  db = getFirestore(app);
  auth = getAuth(app);
  // 匿名登入讓 Firestore rules 的 `request.auth != null` 通過；背景執行、無 UI。
  // 若瀏覽器已有持久化的匿名帳號，SDK 會直接沿用而不會重新建立。
  authReady = signInAnonymously(auth).then(c => c.user).catch(e => { console.warn('anon auth failed', e); return null; });
} catch (e) { console.warn('Firebase init failed', e); }

// Practitioner name (stored locally per device)
function getUserName() { return localStorage.getItem('roleplay_username') || ''; }
function saveUserName(n) { localStorage.setItem('roleplay_username', n.trim()); }

// History — Firestore primary, localStorage backup
const HISTORY_KEY = 'roleplay_history';
const FS_COL = 'practice_records';

function getLocalHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]'); } catch{ return []; } }

async function getHistory() {
  if (db) {
    try {
      await authReady;
      const snap = await getDocs(query(collection(db, FS_COL), orderBy('date', 'desc'), limit(200)));
      return snap.docs.map(d => ({ ...d.data(), fsId: d.id }));
    } catch(e) { console.warn('Firestore read failed, using localStorage', e); }
  }
  return getLocalHistory();
}

async function saveHistory(record) {
  // localStorage backup
  const local = getLocalHistory();
  local.unshift(record);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(local.slice(0, 100)));
  // Firestore
  if (db) {
    try { await authReady; await addDoc(collection(db, FS_COL), record); }
    catch(e) { console.warn('Firestore save failed', e); }
  }
}

async function deleteHistory(fsId, localId) {
  const local = getLocalHistory().filter(r => r.id !== localId);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(local));
  if (db && fsId) {
    try { await authReady; await deleteDoc(doc(db, FS_COL, fsId)); }
    catch(e) { console.warn('Firestore delete failed', e); }
  }
}

function ApiKeyModal({ onSaved }) {
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  const [testing, setTesting] = useState(false);
  const save = async () => {
    if (!val.trim().startsWith('sk-ant-')) { setErr('格式不對，應以 sk-ant- 開頭'); return; }
    setTesting(true); setErr('');
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type':'application/json', 'x-api-key': val.trim(), 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' },
        body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:5, messages:[{role:'user',content:'hi'}] }),
      });
      if (res.status === 401) { setErr('API Key 無效，請重新確認'); setTesting(false); return; }
      if (!res.ok) { const d=await res.json().catch(()=>({})); setErr('驗證失敗：'+(d.error?.message||res.status)); setTesting(false); return; }
      saveApiKey(val.trim());
      onSaved();
    } catch(e) {
      setErr('連線失敗：' + e.message);
    }
    setTesting(false);
  };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999, padding:20 }}>
      <div style={{ background:'#111827', border:'1px solid rgba(99,102,241,0.3)', borderRadius:20, padding:32, maxWidth:440, width:'100%', boxShadow:'0 0 60px rgba(99,102,241,0.2)' }}>
        <div style={{ fontSize:28, textAlign:'center', marginBottom:8 }}>🔑</div>
        <h2 style={{ textAlign:'center', fontSize:18, fontWeight:800, marginBottom:6 }}>設定 Anthropic API Key</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, textAlign:'center', marginBottom:20, lineHeight:1.6 }}>
          到 <a href="https://console.anthropic.com/settings/keys" target="_blank" style={{color:'#a5b4fc'}}>console.anthropic.com</a> 取得 Key。<br/>
          Key 僅存在你的瀏覽器，不會上傳至伺服器。
        </p>
        <input value={val} onChange={e=>setVal(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&save()}
          placeholder="sk-ant-api03-..." type="password"
          style={{ width:'100%', padding:'12px 14px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:10, color:'white', fontSize:14, outline:'none', marginBottom:8 }}/>
        {err && <p style={{ color:'#fca5a5', fontSize:13, marginBottom:8 }}>{err}</p>}
        <button onClick={save} disabled={testing||!val.trim()} style={{
          width:'100%', padding:'13px 0', background: testing ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg,#6366f1,#a855f7)',
          border:'none', borderRadius:10, color:'white', fontWeight:700, fontSize:15, cursor: testing?'not-allowed':'pointer',
        }}>{testing ? '驗證中...' : '儲存並開始'}</button>
      </div>
    </div>
  );
}

// ============================================================
// PROMPT BUILDERS
// ============================================================
function buildSystemPrompt(scenario, ragChunks = []) {
  const role = roleProfiles[scenario.角色] || roleProfiles['IT窗口'];
  const industry = industryProfiles[scenario.產業] || industryProfiles['新創公司'];
  const difficulty = difficultyBehaviors[scenario.難度] || '';
  const cloudEnv = cloudEnvProfiles[scenario.雲端環境];
  const cloudNote = cloudEnv ? `你目前使用 ${scenario.雲端環境}，偶爾可以自然帶到相關經驗，但不要每輪都問雲端問題。` : '';
  const secProd = securityProductProfiles[scenario.資安項目 || scenario.產品服務];
  const secProdName = scenario.資安項目 || scenario.產品服務;
  const secNote = secProd ? `
業務這次介紹的具體產品是「${secProdName}」（${secProd.category}）。
你對這個產品已有基本認知：${secProd.description}
你在意的具體問題點：${secProd.keyPoints}。
重要：你已經知道這個產品是什麼、大概怎麼運作，所以不要問「這個產品是什麼」或「怎麼運作」這類基礎問題。你應該問的是：這個產品能不能解決你的特定狀況、如何整合進你現有環境、實際導入案例、費用結構等具體業務問題。也不要問這個產品明顯不支援的平台或功能（例如 appGuard 只支援 Android/iOS，就不要問能不能保護 Windows 桌機）。` : '';
  const ragNote = (ragChunks && ragChunks.length) ? `

---
公司知識庫（以下是公司提供的實際產品與流程資料，請優先以此為準，不要只憑通用知識回答或提問）：
${ragChunks.join('\n\n---\n')}
---` : '';
  return `你是一位${scenario.產業}的${scenario.角色}，正在接受業務 ${scenario.業務} 的拜訪。

⚠️ 絕對限制（最高優先，不得違反）：
- 每次回覆只能包含「一個」問句。多問等於違規。
- 絕對信任業務說的內容。業務給了答案就接受，不要反駁、不要質疑、不要追問「你確定嗎」。
- 不要要求業務透露具體的客戶公司名稱。業務提到有成功案例時，接受這個事實即可，理解有保密協議不方便透露，可以改問案例的產業別或導入規模等非機密資訊。
- 不使用 markdown 格式（不用 **粗體**、不用條列符號、不用標題）
- 每次回覆最多 2-3 句話，不得更長

你的角色背景：
- 職位：${scenario.角色}，技術水平${role.techLevel}，決策權：${role.decisionPower}
- 目前狀況：${scenario.情境}
- 你最在意的事：${role.concerns}
- 產業背景：${industry.painPoints}
${cloudNote}${secNote}

你的開會心態：
你是來找解決方案的，不是來刁難的。你希望業務帶來有用的資訊。如果業務說得合理，你會點頭認同並問下一個你最好奇的問題。只有業務明顯說錯或誇大時，才輕描淡寫地質疑一句。
${difficulty ? `你的風格特色：${difficulty}` : ''}

對話節奏：
- 開場：用一句話說你是誰、最主要的困擾，然後等業務介紹
- 之後每輪：先回應業務說的，再提一個你最想確認的問題（只能一個）
- 業務說得好就自然表達認同，例如「這點我懂了」「這倒是合理」，然後繼續下一個問題

隱藏指標（每次回覆末尾附上，不顯示給使用者）：
<!--METRICS:{"trust":數字,"interest":數字,"buyIntent":數字,"notes":"一句話記錄"}-->
初始值 trust=65, interest=65, buyIntent=55。業務說明清楚 +10 到 +18，普通回應 +3 到 +7，明顯答非所問或誇大才 -3 到 -5。${ragNote}`
}

function buildReviewPrompt(scenario, conversationLog, metricsHistory) {
  return `你是資深銷售培訓教練，請覆盤以下角色扮演練習。

情境：業務${scenario.業務}向${scenario.產業}的${scenario.角色}推銷${scenario.產品服務}，客戶情境「${scenario.情境}」，難度「${scenario.難度}」。

指標變化：${JSON.stringify(metricsHistory)}

對話記錄：
${conversationLog}

請用 JSON 格式回覆（不含其他文字）：
{"overallScore":75,"grade":"B","summary":"總結50字","strengths":["優點1","優點2"],"improvements":["改進1","改進2"],"missedOpportunities":["錯過機會1"],"keyMoment":"關鍵轉折描述","coachAdvice":"具體建議100字","metricsAnalysis":{"trustTrend":"上升","interestTrend":"持平","buyIntentTrend":"下降","analysis":"分析50字"}}`;
}

async function queryRAG(scenario) {
  if (!CONFIG.workerUrl || !CONFIG.appToken || !db) return [];
  const terms = [scenario.資安項目 || scenario.產品服務, scenario.產業, scenario.角色, scenario.情境].filter(Boolean).join(' ');
  if (!terms) return [];
  try {
    // 1) Embed query via Worker (Workers AI bge-base-en-v1.5)
    const embedRes = await fetch(CONFIG.workerUrl.replace(/\/$/, '') + '/embed', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'X-App-Token': CONFIG.appToken },
      body: JSON.stringify({ text: terms }),
      signal: AbortSignal.timeout(3000),
    });
    if (!embedRes.ok) return [];
    const { values } = await embedRes.json();
    if (!values || !Array.isArray(values)) return [];

    // 2) Firestore 向量搜尋
    return await findNearestChunks(values, 5);
  } catch (e) {
    console.warn('queryRAG failed', e);
    return [];
  }
}

// Firestore Web SDK（含 11.x / 12.x）沒有公開 findNearest()，向量搜尋只能透過 REST 的
// runQuery + structuredQuery.findNearest；用匿名登入的 ID token 通過 Firestore rules。
// 需要 rag_chunks.embedding 建有 vector index，否則 API 會回 FAILED_PRECONDITION（此時靜默停用 RAG）。
async function findNearestChunks(values, k = 5) {
  const user = await authReady;
  if (!user) return [];
  const token = await user.getIdToken();
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'rag_chunks' }],
      findNearest: {
        vectorField: { fieldPath: 'embedding' },
        queryVector: { mapValue: { fields: {
          __type__: { stringValue: '__vector__' },
          value: { arrayValue: { values: values.map(v => ({ doubleValue: v })) } },
        } } },
        distanceMeasure: 'COSINE',
        limit: k,
      },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.warn('RAG findNearest failed', res.status, err?.[0]?.error?.message || err?.error?.message || '');
    return [];
  }
  const rows = await res.json();
  return rows.map(r => r.document?.fields?.text?.stringValue).filter(Boolean);
}

// ============================================================
// API（串流 + prompt caching + 歷史裁剪）
// ============================================================

// 顯示用：隱藏 METRICS 註解（含串流中尚未收完的半截註解）
function stripMetrics(s) {
  return s.split('<!--')[0].trim();
}

// 對話太長時只送最近的訊息，控制 token 成本；
// API 要求 messages 以 user 開頭，裁切點往後對齊到 user 訊息
const MAX_HISTORY_MESSAGES = 24;
function trimHistory(messages) {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  let start = messages.length - MAX_HISTORY_MESSAGES;
  while (start < messages.length && messages[start].role !== 'user') start++;
  return messages.slice(start);
}

async function sendMessage(conversationHistory, systemPrompt, { maxTokens = 1000, stream = false, onDelta } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No API key');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: apiHeaders(apiKey),
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: trimHistory(conversationHistory),
        stream,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error?.message || `HTTP ${res.status}`);
    }

    let raw = '';
    if (stream) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          let evt;
          try { evt = JSON.parse(line.slice(5)); } catch { continue; }
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            raw += evt.delta.text;
            if (onDelta) onDelta(stripMetrics(raw));
          } else if (evt.type === 'error') {
            throw new Error(evt.error?.message || 'stream error');
          }
        }
      }
    } else {
      const data = await res.json();
      if (!data.content) throw new Error(data.error?.message || 'API Error');
      raw = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    }

    const m = raw.match(/<!--METRICS:(.*?)-->/s);
    let metrics = null;
    if (m) { try { metrics = JSON.parse(m[1]); } catch {} }
    return { text: stripMetrics(raw), metrics };
  } catch (e) {
    return { text: `（錯誤：${e.message}）`, metrics: null };
  }
}

// ============================================================
// SIMPLE SVG LINE CHART (no external dependencies)
// ============================================================
function SimpleLineChart({ data }) {
  if (!data || data.length < 2) return null;
  const W = 360, H = 120, pad = { t: 8, r: 8, b: 24, l: 28 };
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
  const xS = i => pad.l + (data.length > 1 ? (i / (data.length - 1)) * iW : iW / 2);
  const yS = v => pad.t + iH - Math.max(0, Math.min(100, v)) / 100 * iH;
  const pts = key => data.map((d, i) => `${xS(i).toFixed(1)},${yS(d[key]).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:160,display:'block'}}>
      {[0,50,100].map(v=>(
        <g key={v}>
          <line x1={pad.l} x2={W-pad.r} y1={yS(v)} y2={yS(v)} stroke="rgba(255,255,255,0.07)" strokeWidth={1}/>
          <text x={pad.l-3} y={yS(v)+3.5} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize={8}>{v}</text>
        </g>
      ))}
      {data.map((_,i)=>(
        <text key={i} x={xS(i)} y={H-4} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={8}>{i}</text>
      ))}
      {[['信任度','#6366f1'],['興趣度','#a855f7'],['購買意願','#06b6d4']].map(([key,stroke])=>(
        <polyline key={key} points={pts(key)} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>
      ))}
    </svg>
  );
}

// ============================================================
// CIRCULAR GAUGE
// ============================================================
function CircularGauge({ label, value, color }) {
  const r=54, sw=8, nr=r-sw/2, c=nr*2*Math.PI, off=c-(value/100)*c;
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:5}}>
      <div style={{position:'relative',width:r*2,height:r*2}}>
        <svg width={r*2} height={r*2} style={{transform:'rotate(-90deg)'}}>
          <circle stroke="rgba(255,255,255,0.1)" fill="transparent" strokeWidth={sw} r={nr} cx={r} cy={r}/>
          <circle stroke={color} fill="transparent" strokeWidth={sw}
            strokeDasharray={`${c} ${c}`} strokeDashoffset={off} strokeLinecap="round" r={nr} cx={r} cy={r}
            style={{transition:'stroke-dashoffset 0.5s ease'}}/>
        </svg>
        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <span style={{fontSize:20,fontWeight:700,color:'white'}}>{value}</span>
        </div>
      </div>
      <span style={{fontSize:12,fontWeight:500,color:'rgba(255,255,255,0.55)'}}>{label}</span>
    </div>
  );
}

// ============================================================
// SLOT COLUMN
// ============================================================
function SlotColumn({ category, data, onSpinComplete, spinTrigger, wide }) {
  const [sel, setSel] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const tmr = useRef(null);
  const isRed = data.color === 'red';
  const gc = isRed ? '#ef4444' : '#6366f1';
  const n = data.items.length;

  const step = useCallback((dir) => {
    if (spinning) return;
    setSel(i => {
      const next = ((i + dir) % n + n) % n;
      onSpinComplete(category, data.items[next]);
      return next;
    });
  }, [spinning, n, data, category, onSpinComplete]);

  const doSpin = useCallback(() => {
    if (spinning) return;
    setSpinning(true);
    let speed=50, elapsed=0;
    const target=Math.floor(Math.random()*n);
    const total=1800+Math.random()*800;
    const tick=()=>{
      setSel(i=>(i+1)%n);
      elapsed+=speed;
      if(elapsed>total*0.6) speed=Math.min(320,speed*1.09);
      if(elapsed>=total){ setSel(target); setSpinning(false); onSpinComplete(category,data.items[target]); }
      else { tmr.current=setTimeout(tick,speed); }
    };
    tmr.current=setTimeout(tick,speed);
  },[spinning,data,n,category,onSpinComplete]);

  useEffect(()=>{ if(spinTrigger>0) doSpin(); },[spinTrigger]);
  useEffect(()=>()=>clearTimeout(tmr.current),[]);

  // Show a window of 5 items centered on selected (works for any list length)
  const WIN = 5, HALF = 2;
  const window5 = Array.from({length:WIN}, (_,i) => {
    const offset = i - HALF;
    const idx = ((sel + offset) % n + n) % n;
    return { idx, item: data.items[idx], isSel: offset === 0 };
  });

  const navBtn = (dir, label) => (
    <button onClick={()=>step(dir)} disabled={spinning} style={{
      width:'100%',padding:'6px 0',background:'rgba(255,255,255,0.04)',
      border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,color:'rgba(255,255,255,0.45)',
      fontSize:15,cursor:spinning?'not-allowed':'pointer',lineHeight:1,
      transition:'all 0.15s',opacity:spinning?0.3:1}}>
      {label}
    </button>
  );

  return (
    <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,padding:'18px 12px',display:'flex',flexDirection:'column',alignItems:'center',gap:7,flex:wide?1.8:1,minWidth:wide?200:145}}>
      <div style={{fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.6)',letterSpacing:'0.04em'}}>{data.icon} {category}</div>
      {navBtn(-1, '▲')}
      <div style={{width:'100%',borderRadius:10,background:'rgba(0,0,0,0.3)',padding:'8px 6px',display:'flex',flexDirection:'column',gap:4,overflow:'hidden'}}>
        {window5.map(({idx,item,isSel})=>(
          <div key={idx} style={{padding:'9px 8px',borderRadius:8,textAlign:'center',fontSize:13,
            fontWeight:isSel?700:400,color:isSel?'white':'rgba(255,255,255,0.3)',
            background:isSel?`rgba(${isRed?'239,68,68':'99,102,241'},0.2)`:'transparent',
            border:isSel?`1px solid ${gc}55`:'1px solid transparent',
            boxShadow:isSel?`0 0 10px ${gc}30`:'none',transition:'all 0.08s ease'}}>
            {item}
          </div>
        ))}
      </div>
      {navBtn(1, '▼')}
      <button onClick={doSpin} disabled={spinning} style={{
        width:'100%',padding:'10px 0',
        background:spinning?'rgba(255,255,255,0.05)':`linear-gradient(135deg,${gc},${isRed?'#dc2626':'#a855f7'})`,
        border:'none',borderRadius:8,color:'white',fontWeight:600,fontSize:13,
        cursor:spinning?'not-allowed':'pointer',opacity:spinning?0.5:1,transition:'all 0.2s'}}>
        {spinning?'轉中...':'🎲 轉'}
      </button>
    </div>
  );
}

// ============================================================
// SETUP PHASE
// ============================================================
function SetupPhase({ onStart }) {
  const [selections, setSelections] = useState(() =>
    Object.fromEntries(BASE_CATEGORIES.map(c => [c, SLOT_DATA[c].items[0]]))
  );
  const [triggers, setTriggers] = useState(()=>Object.fromEntries(ALL_CATEGORIES.map(c=>[c,0])));

  const isCloudProduct = selections.產品服務 === '雲端服務';
  const isSecurityProduct = selections.產品服務 === '資安產品';
  const requiredCats = [
    ...BASE_CATEGORIES,
    ...(isCloudProduct ? ['雲端環境'] : []),
    ...(isSecurityProduct ? ['資安項目'] : []),
  ];
  const allSpun = requiredCats.every(c => selections[c] !== undefined);

  const handleDone = useCallback((cat, val) => {
    setSelections(p => {
      const next = { ...p, [cat]: val };
      if (cat === '產品服務') {
        if (val !== '雲端服務') delete next['雲端環境'];
        if (val !== '資安產品') delete next['資安項目'];
      }
      return next;
    });
  }, []);
  const spinAll = ()=>{ setSelections({}); setTriggers(p=>Object.fromEntries(ALL_CATEGORIES.map(c=>[c,p[c]+1]))); };
  const reset = ()=>{ setSelections(Object.fromEntries(BASE_CATEGORIES.map(c=>[c,SLOT_DATA[c].items[0]]))); setTriggers(Object.fromEntries(ALL_CATEGORIES.map(c=>[c,0]))); };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:28}}>
      <div style={{textAlign:'center'}}>
        <h1 style={{fontSize:30,fontWeight:900,background:'linear-gradient(135deg,#6366f1,#a855f7,#06b6d4)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',margin:0}}>
          🎰 業務角色扮演 AI 練習器
        </h1>
        <p style={{color:'rgba(255,255,255,0.45)',marginTop:10,fontSize:15}}>轉動轉盤，組合情境，與 AI 客戶對話練習</p>
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:12,justifyContent:'center'}}>
        {BASE_CATEGORIES.map(cat=>(
          <SlotColumn key={cat} category={cat} data={SLOT_DATA[cat]} onSpinComplete={handleDone} spinTrigger={triggers[cat]} wide={cat==='難度'}/>
        ))}
      </div>
      {isSecurityProduct&&(
        <div style={{animation:'fadeInUp 0.35s ease'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
            <div style={{flex:1,height:'1px',background:'linear-gradient(90deg,transparent,rgba(239,68,68,0.4))'}}/>
            <span style={{color:'#fca5a5',fontSize:12,fontWeight:600,letterSpacing:'0.06em',whiteSpace:'nowrap'}}>🔒 資安項目（選擇具體產品）</span>
            <div style={{flex:1,height:'1px',background:'linear-gradient(90deg,rgba(239,68,68,0.4),transparent)'}}/>
          </div>
          <div style={{display:'flex',justifyContent:'center'}}>
            <div style={{width:200}}>
              <SlotColumn key="資安項目" category="資安項目" data={SLOT_DATA['資安項目']} onSpinComplete={handleDone} spinTrigger={triggers['資安項目']}/>
            </div>
          </div>
        </div>
      )}
      {isCloudProduct&&(
        <div style={{animation:'fadeInUp 0.35s ease'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
            <div style={{flex:1,height:'1px',background:'linear-gradient(90deg,transparent,rgba(6,182,212,0.4))'}}/>
            <span style={{color:'#67e8f9',fontSize:12,fontWeight:600,letterSpacing:'0.06em',whiteSpace:'nowrap'}}>☁️ 雲端環境（選擇雲端平台）</span>
            <div style={{flex:1,height:'1px',background:'linear-gradient(90deg,rgba(6,182,212,0.4),transparent)'}}/>
          </div>
          <div style={{display:'flex',justifyContent:'center'}}>
            <div style={{width:160}}>
              <SlotColumn key="雲端環境" category="雲端環境" data={SLOT_DATA['雲端環境']} onSpinComplete={handleDone} spinTrigger={triggers['雲端環境']}/>
            </div>
          </div>
        </div>
      )}
      <div style={{display:'flex',gap:10,justifyContent:'center'}}>
        <button onClick={spinAll} style={{padding:'13px 32px',background:'linear-gradient(135deg,#6366f1,#a855f7)',border:'none',borderRadius:12,color:'white',fontWeight:700,fontSize:15,cursor:'pointer',boxShadow:'0 0 28px rgba(99,102,241,0.4)'}}>🎰 全部轉！</button>
        <button onClick={reset} style={{padding:'13px 22px',background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:12,color:'rgba(255,255,255,0.7)',fontWeight:600,fontSize:14,cursor:'pointer'}}>🔄 重置</button>
      </div>
      {allSpun&&(
        <div style={{background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.25)',borderRadius:16,padding:18,animation:'fadeInUp 0.4s ease'}}>
          <h3 style={{color:'rgba(255,255,255,0.75)',margin:'0 0 12px 0',fontSize:14}}>📋 你的練習情境</h3>
          <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:18}}>
            <div style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,padding:'7px 13px',fontSize:12}}>
              <span style={{color:'rgba(255,255,255,0.4)',marginRight:4}}>👤 業務</span>
              <span style={{color:'#a5b4fc',fontWeight:700}}>{getUserName()||'我'}</span>
            </div>
            {requiredCats.map(cat=>(
              <div key={cat} style={{background:'rgba(255,255,255,0.06)',border:`1px solid ${cat==='雲端環境'?'rgba(6,182,212,0.3)':'rgba(255,255,255,0.1)'}`,borderRadius:10,padding:'7px 13px',fontSize:12}}>
                <span style={{color:'rgba(255,255,255,0.4)',marginRight:4}}>{SLOT_DATA[cat].icon} {cat}</span>
                <span style={{color:cat==='難度'?'#fca5a5':cat==='雲端環境'?'#67e8f9':'#a5b4fc',fontWeight:700}}>{selections[cat]}</span>
              </div>
            ))}
          </div>
          <button onClick={()=>onStart({...selections, 業務: getUserName()||'我'})} style={{width:'100%',padding:'15px 0',background:'linear-gradient(135deg,#6366f1,#a855f7)',border:'none',borderRadius:12,color:'white',fontWeight:700,fontSize:16,cursor:'pointer',boxShadow:'0 0 28px rgba(99,102,241,0.5)'}}>
            🎯 開始角色扮演練習
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CHAT PHASE
// ============================================================
function ChatPhase({ scenario, onEnd }) {
  const [messages,setMessages]=useState([]);
  const [metrics,setMetrics]=useState({trust:65,interest:65,buyIntent:55});
  const [mHistory,setMHistory]=useState([{trust:65,interest:65,buyIntent:55}]);
  const [input,setInput]=useState('');
  const [loading,setLoading]=useState(false);
  const [streamText,setStreamText]=useState('');
  const [turns,setTurns]=useState(0);
  const [toast,setToast]=useState(null);
  const [timeLeft,setTimeLeft]=useState(null);
  const [overtime,setOvertime]=useState(0); // seconds past 0
  const [speaking,setSpeaking]=useState(false);
  const [ragActive,setRagActive]=useState(false);
  const timerRef=useRef(null);
  const overtimeRef=useRef(0);
  const sendRef=useRef(null);
  const endRef=useRef(null);
  const recognitionRef=useRef(null);
  const apiMsgs=useRef([{role:'user',content:'（場景開始：業務人員剛走進你的辦公室，請你先開口說話）'}]);
  const sys=useRef(buildSystemPrompt(scenario));

  // 計時器：AI 回覆完畢後啟動，使用者送出後停止
  useEffect(()=>{
    if(!loading && messages.length>0){
      setTimeLeft(120);
      setOvertime(0);
      overtimeRef.current=0;
      clearInterval(timerRef.current);
      timerRef.current=setInterval(()=>{
        setTimeLeft(t=>{
          if(t>0) return t-1;
          // 進入超時階段：持續計秒，每 10 秒扣 1 信任度
          setOvertime(ot=>{
            const next=ot+1;
            overtimeRef.current=next;
            if(next%10===0){
              setMetrics(m=>({...m, trust:Math.max(0,m.trust-1)}));
              setToast(`⏰ 超時 ${next} 秒，客戶信任度 -1`);
            }
            return next;
          });
          return 0;
        });
      },1000);
    }
    if(loading){
      clearInterval(timerRef.current);
      setTimeLeft(null);
      setOvertime(0);
      overtimeRef.current=0;
    }
    return ()=>clearInterval(timerRef.current);
  },[loading,messages.length]);

  // 向 AI 客戶要一輪回覆：串流顯示逐字內容，收完後才寫入正式訊息列
  const askAI=async(isFirst=false)=>{
    setStreamText('');
    const r=await sendMessage(apiMsgs.current,sys.current,{stream:true,onDelta:setStreamText});
    apiMsgs.current.push({role:'assistant',content:r.text});
    setMessages(p=>[...p,{role:'assistant',content:r.text}]);
    if(r.metrics){setMetrics(r.metrics);setMHistory(p=>(isFirst?[r.metrics]:[...p,r.metrics]));}
    setStreamText('');
    setLoading(false);
  };

  useEffect(()=>{
    (async()=>{
      setLoading(true);
      const chunks=await queryRAG(scenario);
      if(chunks.length){
        sys.current=buildSystemPrompt(scenario,chunks);
        setRagActive(true);
      }
      await askAI(true);
    })();
  },[]);

  // 用大括號包住：effect 不能回傳 scrollIntoView 的回傳值（部分環境會回傳 Promise，React 會把它當 cleanup 函式呼叫而崩潰）
  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:'smooth'}); },[messages,loading,streamText]);

  const toggleVoice=()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){ alert('你的瀏覽器不支援語音輸入，請使用 Chrome'); return; }
    if(speaking){
      recognitionRef.current?.stop();
      setSpeaking(false);
      return;
    }
    const rec=new SR();
    rec.lang='zh-TW';
    rec.continuous=true;
    rec.interimResults=true;
    recognitionRef.current=rec;
    rec.onstart=()=>setSpeaking(true);
    rec.onend=()=>setSpeaking(false);
    rec.onerror=()=>setSpeaking(false);
    rec.onresult=(e)=>{
      let interim='';
      let final='';
      for(let i=e.resultIndex;i<e.results.length;i++){
        if(e.results[i].isFinal) final+=e.results[i][0].transcript;
        else interim+=e.results[i][0].transcript;
      }
      if(final) setInput(prev=>(prev+final).trimStart());
    };
    rec.start();
  };

  const send=async()=>{
    if(!input.trim()||loading) return;
    recognitionRef.current?.stop();
    setSpeaking(false);
    clearInterval(timerRef.current);
    setTimeLeft(null);
    setOvertime(0); overtimeRef.current=0;
    const txt=input.trim(); setInput('');
    setMessages(p=>[...p,{role:'user',content:txt}]);
    apiMsgs.current.push({role:'user',content:txt});
    setLoading(true); setTurns(t=>t+1);
    await askAI();
  };
  useEffect(()=>{ sendRef.current=input.trim()?send:null; },[input,loading]);

  const hint=()=>{setToast(HINTS[Math.floor(Math.random()*HINTS.length)]);setTimeout(()=>setToast(null),3500);};
  const end=()=>onEnd(scenario,messages.map(m=>`${m.role==='user'?'業務':'客戶'}: ${m.content}`).join('\n\n'),mHistory);

  const bubble=(msg,i,isStreaming)=>(
    <div key={isStreaming?'streaming':i} style={{display:'flex',justifyContent:msg.role==='user'?'flex-end':'flex-start',animation:'fadeInUp 0.25s ease'}}>
      <div style={{maxWidth:'75%',padding:'12px 16px',
        borderRadius:msg.role==='user'?'18px 18px 4px 18px':'18px 18px 18px 4px',
        background:msg.role==='user'?'linear-gradient(135deg,#6366f1,#a855f7)':'rgba(255,255,255,0.06)',
        border:msg.role==='user'?'none':'1px solid rgba(255,255,255,0.08)',
        fontSize:15,lineHeight:1.7,color:'white'}}>
        <div style={{fontSize:12,color:'rgba(255,255,255,0.45)',marginBottom:5}}>{msg.role==='user'?`👤 ${scenario.業務}`:'🤖 客戶'}</div>
        {msg.content}
      </div>
    </div>
  );

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100dvh'}}>
      {toast&&<div style={{position:'fixed',top:14,left:'50%',transform:'translateX(-50%)',background:'rgba(99,102,241,0.96)',color:'white',padding:'12px 20px',borderRadius:12,fontSize:15,maxWidth:400,textAlign:'center',zIndex:1000,boxShadow:'0 8px 32px rgba(0,0,0,0.3)',animation:'fadeInDown 0.3s ease'}}>💡 {toast}</div>}

      <div style={{background:'rgba(0,0,0,0.45)',borderBottom:'1px solid rgba(255,255,255,0.07)',padding:'10px 16px',display:'flex',flexDirection:'column',gap:7,flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
          <span style={{color:'rgba(255,255,255,0.4)',fontSize:13,marginRight:3}}>情境</span>
          {ALL_CATEGORIES.filter(cat=>scenario[cat]!==undefined).map(cat=>(
            <span key={cat} style={{background:'rgba(255,255,255,0.06)',border:`1px solid ${cat==='難度'?'rgba(239,68,68,0.25)':cat==='雲端環境'?'rgba(6,182,212,0.25)':'rgba(255,255,255,0.08)'}`,borderRadius:6,padding:'3px 10px',fontSize:13,color:cat==='難度'?'#fca5a5':cat==='雲端環境'?'#67e8f9':'rgba(255,255,255,0.75)'}}>
              {SLOT_DATA[cat].icon} {scenario[cat]}
            </span>
          ))}
          {ragActive&&(
            <span style={{background:'rgba(34,197,94,0.15)',border:'1px solid rgba(34,197,94,0.35)',borderRadius:6,padding:'3px 10px',fontSize:13,color:'#86efac'}}>
              📚 知識庫已載入
            </span>
          )}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{background:'rgba(99,102,241,0.15)',border:'1px solid rgba(99,102,241,0.3)',borderRadius:6,padding:'3px 12px',fontSize:14,fontWeight:600,color:'#a5b4fc'}}>
            第 {turns} 輪
          </span>
          {loading&&<span style={{fontSize:13,color:'rgba(255,255,255,0.4)'}}>AI 回覆中...</span>}
          {!loading&&timeLeft!==null&&overtime===0&&(
            <span style={{
              display:'flex',alignItems:'center',gap:5,
              background:timeLeft<=10?'rgba(239,68,68,0.15)':timeLeft<=30?'rgba(245,158,11,0.15)':'rgba(34,197,94,0.12)',
              border:`1px solid ${timeLeft<=10?'rgba(239,68,68,0.4)':timeLeft<=30?'rgba(245,158,11,0.35)':'rgba(34,197,94,0.3)'}`,
              borderRadius:6,padding:'3px 12px',fontSize:14,fontWeight:700,
              color:timeLeft<=10?'#fca5a5':timeLeft<=30?'#fcd34d':'#86efac',
              animation:timeLeft<=10?'pulse 0.8s ease-in-out infinite':'none',
            }}>
              ⏱ {timeLeft}s
            </span>
          )}
          {!loading&&overtime>0&&(
            <span style={{
              display:'flex',alignItems:'center',gap:5,
              background:'rgba(239,68,68,0.2)',
              border:'1px solid rgba(239,68,68,0.6)',
              borderRadius:6,padding:'3px 12px',fontSize:14,fontWeight:700,
              color:'#f87171',
              animation:'pulse 0.8s ease-in-out infinite',
            }}>
              ⏰ 超時 +{overtime}s {overtime>=10?`(信任 -${Math.floor(overtime/10)})`:'' }
            </span>
          )}
        </div>
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{flex:1,overflowY:'auto',padding:16,display:'flex',flexDirection:'column',gap:14}}>
            {messages.map((msg,i)=>bubble(msg,i,false))}
            {loading&&streamText&&bubble({role:'assistant',content:streamText},-1,true)}
            {loading&&!streamText&&(
              <div style={{display:'flex',justifyContent:'flex-start'}}>
                <div style={{padding:'12px 18px',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'18px 18px 18px 4px',display:'flex',gap:5,alignItems:'center'}}>
                  {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:'50%',background:'#6366f1',animation:`bounce 1.1s ${i*0.18}s infinite`}}/>)}
                </div>
              </div>
            )}
            <div ref={endRef}/>
          </div>

          <div style={{borderTop:'1px solid rgba(255,255,255,0.07)',padding:'12px 14px',display:'flex',gap:10,flexShrink:0,alignItems:'flex-end'}}>
            <textarea value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{}}
              placeholder={`輸入 ${scenario.業務} 的回應... (點擊右下角「發送」送出)`} disabled={loading}
              rows={3}
              style={{flex:1,background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:10,padding:'12px 16px',color:'white',fontSize:15,outline:'none',resize:'none',lineHeight:1.5,fontFamily:'inherit'}}/>
            <button onClick={toggleVoice} disabled={loading} title={speaking?'停止錄音':'語音輸入'}
              style={{padding:'12px 14px',background:speaking?'rgba(239,68,68,0.25)':'rgba(255,255,255,0.07)',border:`1px solid ${speaking?'rgba(239,68,68,0.5)':'rgba(255,255,255,0.12)'}`,borderRadius:10,color:speaking?'#f87171':'rgba(255,255,255,0.7)',fontSize:20,cursor:loading?'not-allowed':'pointer',flexShrink:0,lineHeight:1,animation:speaking?'micPulse 1s ease-in-out infinite':undefined}}>
              {speaking?'⏹':'🎙'}
            </button>
            <button onClick={send} disabled={loading||!input.trim()} style={{padding:'12px 20px',background:'linear-gradient(135deg,#6366f1,#a855f7)',border:'none',borderRadius:10,color:'white',fontWeight:600,fontSize:15,cursor:loading||!input.trim()?'not-allowed':'pointer',opacity:loading||!input.trim()?0.45:1,flexShrink:0}}>發送</button>
          </div>
          <div style={{borderTop:'1px solid rgba(255,255,255,0.05)',padding:'8px 14px',display:'flex',gap:10,flexShrink:0}}>
            <button onClick={hint} style={{padding:'8px 16px',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,color:'rgba(255,255,255,0.7)',fontSize:14,cursor:'pointer'}}>💡 提示</button>
            <button onClick={end} disabled={messages.length<2} style={{padding:'8px 16px',background:messages.length>=2?'rgba(239,68,68,0.12)':'rgba(255,255,255,0.04)',border:`1px solid ${messages.length>=2?'rgba(239,68,68,0.28)':'rgba(255,255,255,0.07)'}`,borderRadius:8,color:messages.length>=2?'#fca5a5':'rgba(255,255,255,0.28)',fontSize:14,cursor:messages.length>=2?'pointer':'not-allowed'}}>🏁 結束並覆盤</button>
          </div>
        </div>

        <div style={{width:210,borderLeft:'1px solid rgba(255,255,255,0.06)',padding:'16px 12px',display:'flex',flexDirection:'column',gap:20,alignItems:'center',flexShrink:0,overflowY:'auto'}}>
          <div style={{fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.5)',textAlign:'center',letterSpacing:'0.06em'}}>🎓 教練視角</div>
          <CircularGauge label="信任度" value={metrics.trust} color="#6366f1"/>
          <CircularGauge label="興趣度" value={metrics.interest} color="#a855f7"/>
          <CircularGauge label="購買意願" value={metrics.buyIntent} color="#06b6d4"/>
          {metrics.notes&&<div style={{fontSize:12,color:'rgba(255,255,255,0.5)',textAlign:'center',lineHeight:1.6,padding:'0 4px'}}>{metrics.notes}</div>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// REVIEW PHASE
// ============================================================
function ReviewPhase({ scenario, log, mHistory, onRetry, onNew }) {
  const [review,setReview]=useState(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    (async()=>{
      const r=await sendMessage([{role:'user',content:buildReviewPrompt(scenario,log,mHistory)}],'你是資深銷售培訓教練，用JSON格式提供覆盤。',{maxTokens:2000});
      try{
        // 用深度追蹤正確擷取最外層 JSON 物件
        const extractJSON=(s)=>{const i=s.indexOf('{');if(i<0)return null;let d=0;for(let j=i;j<s.length;j++){if(s[j]==='{')d++;else if(s[j]==='}'){d--;if(d===0)return s.slice(i,j+1);}}return null;};
        const jsonStr=extractJSON(r.text);
        if(jsonStr){
          const parsed=JSON.parse(jsonStr);
          setReview(parsed);
          await saveHistory({
            id: Date.now().toString(),
            date: new Date().toISOString(),
            practitioner: getUserName() || '匿名',
            scenario,
            turns: mHistory.length-1,
            score: parsed.overallScore||0,
            grade: parsed.grade||'B',
            summary: parsed.summary||'',
            strengths: parsed.strengths||[],
            improvements: parsed.improvements||[],
            coachAdvice: parsed.coachAdvice||'',
            finalMetrics: mHistory[mHistory.length-1]||{trust:65,interest:65,buyIntent:55},
          });
        } else setReview({error:true});
      }
      catch{ setReview({error:true}); }
      setLoading(false);
    })();
  },[]);

  const chartData=mHistory.map((m,i)=>({turn:i,信任度:m.trust,興趣度:m.interest,購買意願:m.buyIntent}));
  const gc={S:'#ffd700',A:'#6366f1',B:'#22c55e',C:'#f59e0b',D:'#ef4444'};

  if(loading) return(
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'60vh',gap:18}}>
      <div style={{width:52,height:52,border:'4px solid rgba(99,102,241,0.2)',borderTop:'4px solid #6366f1',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>
      <p style={{color:'rgba(255,255,255,0.5)',fontSize:14}}>AI 教練分析中...</p>
    </div>
  );
  if(!review||review.error) return(
    <div style={{padding:20,textAlign:'center'}}>
      <p style={{color:'rgba(255,255,255,0.5)',marginBottom:12}}>覆盤失敗，請重試</p>
      <button onClick={onRetry} style={{padding:'10px 24px',background:'linear-gradient(135deg,#6366f1,#a855f7)',border:'none',borderRadius:8,color:'white',cursor:'pointer',fontWeight:600}}>🔄 再試</button>
    </div>
  );

  const grade=review.grade||'B', score=review.overallScore||0, color=gc[grade]||'#6366f1';
  const circ=2*Math.PI*38;
  return(
    <div style={{display:'flex',flexDirection:'column',gap:16,paddingBottom:32}}>
      <h2 style={{textAlign:'center',fontSize:20,fontWeight:800,margin:0}}>🏆 練習覆盤報告</h2>

      <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,padding:20,display:'flex',alignItems:'center',gap:20}}>
        <div style={{position:'relative',width:84,height:84,flexShrink:0}}>
          <svg width={84} height={84} style={{transform:'rotate(-90deg)'}}>
            <circle cx={42} cy={42} r={38} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={7}/>
            <circle cx={42} cy={42} r={38} fill="none" stroke={color} strokeWidth={7}
              strokeDasharray={`${circ}`} strokeDashoffset={`${circ*(1-score/100)}`} strokeLinecap="round"
              style={{transition:'stroke-dashoffset 1s ease'}}/>
          </svg>
          <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
            <span style={{fontSize:20,fontWeight:800,color}}>{score}</span>
            <span style={{fontSize:10,color:'rgba(255,255,255,0.4)'}}>/ 100</span>
          </div>
        </div>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
            <span style={{fontSize:32,fontWeight:900,color}}>{grade}</span>
            <span style={{fontSize:12,color:'rgba(255,255,255,0.4)'}}>等級</span>
          </div>
          <p style={{color:'rgba(255,255,255,0.7)',fontSize:13,lineHeight:1.6,margin:0}}>{review.summary}</p>
        </div>
      </div>

      {chartData.length>1&&(
        <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,padding:16}}>
          <h4 style={{color:'rgba(255,255,255,0.7)',margin:'0 0 12px 0',fontSize:13}}>📈 指標趨勢</h4>
          <SimpleLineChart data={chartData}/>
          <div style={{display:'flex',gap:12,justifyContent:'center',marginTop:4}}>
            {[['信任度','#6366f1'],['興趣度','#a855f7'],['購買意願','#06b6d4']].map(([l,c])=>(
              <div key={l} style={{display:'flex',alignItems:'center',gap:3}}>
                <div style={{width:10,height:3,background:c,borderRadius:2}}/><span style={{fontSize:10,color:'rgba(255,255,255,0.45)'}}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {[{icon:'✅',title:'做得好的地方',items:review.strengths,c:'#22c55e'},{icon:'⚠️',title:'可以改進的地方',items:review.improvements,c:'#f59e0b'},{icon:'💎',title:'錯過的機會點',items:review.missedOpportunities,c:'#a855f7'}]
        .filter(s=>s.items?.length).map(({icon,title,items,c})=>(
        <div key={title} style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:14,padding:16}}>
          <h4 style={{color:'rgba(255,255,255,0.78)',margin:'0 0 10px 0',fontSize:13}}>{icon} {title}</h4>
          {items.map((item,i)=><div key={i} style={{display:'flex',gap:7,color:'rgba(255,255,255,0.62)',fontSize:13,lineHeight:1.6,marginBottom:i<items.length-1?7:0}}><span style={{color:c,flexShrink:0}}>•</span>{item}</div>)}
        </div>
      ))}

      {review.keyMoment&&<div style={{background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:14,padding:16}}><h4 style={{color:'rgba(255,255,255,0.78)',margin:'0 0 8px 0',fontSize:13}}>🔑 關鍵轉折</h4><p style={{color:'rgba(255,255,255,0.58)',fontSize:13,lineHeight:1.6,margin:0}}>「{review.keyMoment}」</p></div>}
      {review.coachAdvice&&<div style={{background:'rgba(6,182,212,0.07)',border:'1px solid rgba(6,182,212,0.18)',borderRadius:14,padding:16}}><h4 style={{color:'rgba(255,255,255,0.78)',margin:'0 0 8px 0',fontSize:13}}>💡 教練建議</h4><p style={{color:'rgba(255,255,255,0.58)',fontSize:13,lineHeight:1.6,margin:0}}>{review.coachAdvice}</p></div>}

      <div style={{display:'flex',gap:10}}>
        <button onClick={onRetry} style={{flex:1,padding:'13px 0',background:'linear-gradient(135deg,#6366f1,#a855f7)',border:'none',borderRadius:12,color:'white',fontWeight:700,fontSize:14,cursor:'pointer'}}>🔄 再練一次</button>
        <button onClick={onNew} style={{flex:1,padding:'13px 0',background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:12,color:'rgba(255,255,255,0.7)',fontWeight:600,fontSize:14,cursor:'pointer'}}>🎲 換情境</button>
      </div>
    </div>
  );
}

// ============================================================
// LEADERBOARD MODAL
// ============================================================
function LeaderboardModal({ onClose }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('total'); // 'total' | 'count' | 'avg'

  useEffect(() => {
    getHistory().then(records => {
      // 聚合每個練習者的統計
      const map = {};
      records.forEach(r => {
        const name = r.practitioner || '匿名';
        if (!map[name]) map[name] = { name, count: 0, totalScore: 0, bestScore: 0, scores: [] };
        map[name].count += 1;
        map[name].totalScore += (r.score || 0);
        map[name].bestScore = Math.max(map[name].bestScore, r.score || 0);
        map[name].scores.push(r.score || 0);
      });
      const list = Object.values(map).map(p => ({
        ...p,
        avgScore: Math.round(p.totalScore / p.count),
      }));
      setData(list);
      setLoading(false);
    });
  }, []);

  const sorted = [...data].sort((a, b) => {
    if (sortBy === 'total') return b.totalScore - a.totalScore;
    if (sortBy === 'count') return b.count - a.count;
    return b.avgScore - a.avgScore;
  });

  const medals = ['🥇', '🥈', '🥉'];
  const podiumColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
  const podiumBg = ['rgba(255,215,0,0.12)', 'rgba(192,192,192,0.1)', 'rgba(205,127,50,0.1)'];
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  const sortLabel = { total: '累計總分', count: '練習次數', avg: '平均分' };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:200,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'20px 12px',overflowY:'auto'}}>
      <div style={{background:'#111827',border:'1px solid rgba(255,215,0,0.2)',borderRadius:20,width:'100%',maxWidth:560,padding:24,boxShadow:'0 0 60px rgba(255,215,0,0.08)'}}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
          <h2 style={{margin:0,fontSize:18,fontWeight:800}}>🏆 練習排行榜</h2>
          <button onClick={onClose} style={{background:'none',border:'none',color:'rgba(255,255,255,0.45)',fontSize:20,cursor:'pointer',lineHeight:1}}>✕</button>
        </div>

        {/* Sort toggle */}
        <div style={{display:'flex',gap:6,marginBottom:20}}>
          {['total','count','avg'].map(k=>(
            <button key={k} onClick={()=>setSortBy(k)}
              style={{flex:1,padding:'7px 0',borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:sortBy===k?'rgba(255,215,0,0.15)':'transparent',color:sortBy===k?'#ffd700':'rgba(255,255,255,0.4)',fontSize:12,fontWeight:sortBy===k?700:400,cursor:'pointer',transition:'all 0.2s'}}>
              {sortLabel[k]}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{textAlign:'center',padding:'40px 0',color:'rgba(255,255,255,0.35)',fontSize:14}}>載入中...</div>
        ) : sorted.length === 0 ? (
          <div style={{textAlign:'center',padding:'40px 0',color:'rgba(255,255,255,0.35)',fontSize:14}}>還沒有練習記錄，完成第一次覆盤後會出現在這裡。</div>
        ) : (
          <>
            {/* Podium — top 3 */}
            {top3.length > 0 && (
              <div style={{display:'flex',alignItems:'flex-end',justifyContent:'center',gap:10,marginBottom:24}}>
                {/* Reorder: 2nd, 1st, 3rd */}
                {[top3[1], top3[0], top3[2]].map((p, visualIdx) => {
                  if (!p) return <div key={visualIdx} style={{flex:1}}/>;
                  const realRank = visualIdx === 0 ? 1 : visualIdx === 1 ? 0 : 2;
                  const height = [100, 130, 80][visualIdx];
                  const color = podiumColors[realRank];
                  const bg = podiumBg[realRank];
                  const val = sortBy==='total' ? p.totalScore : sortBy==='count' ? p.count : p.avgScore;
                  const unit = sortBy==='count' ? '次' : '分';
                  return (
                    <div key={p.name} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
                      <div style={{fontSize:22}}>{medals[realRank]}</div>
                      <div style={{fontSize:13,fontWeight:700,color:'rgba(255,255,255,0.9)',textAlign:'center',maxWidth:90,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</div>
                      <div style={{fontSize:11,color,fontWeight:600}}>{val}{unit}</div>
                      <div style={{width:'100%',height,background:bg,border:`1px solid ${color}44`,borderRadius:'8px 8px 0 0',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <span style={{fontSize:28,fontWeight:900,color}}>{realRank+1}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Full ranking list */}
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {sorted.map((p, i) => {
                const isMe = p.name === getUserName();
                const val = sortBy==='total' ? p.totalScore : sortBy==='count' ? p.count : p.avgScore;
                const unit = sortBy==='count' ? '次' : '分';
                const rankColor = i===0?'#ffd700':i===1?'#c0c0c0':i===2?'#cd7f32':'rgba(255,255,255,0.3)';
                return (
                  <div key={p.name} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:isMe?'rgba(99,102,241,0.12)':'rgba(255,255,255,0.03)',border:`1px solid ${isMe?'rgba(99,102,241,0.3)':'rgba(255,255,255,0.06)'}`,borderRadius:10}}>
                    <div style={{width:28,textAlign:'center',fontSize:i<3?18:14,fontWeight:800,color:rankColor,flexShrink:0}}>
                      {i<3 ? medals[i] : i+1}
                    </div>
                    <div style={{flex:1,fontWeight:600,fontSize:14,color:isMe?'#a5b4fc':'rgba(255,255,255,0.85)'}}>
                      {p.name}{isMe&&<span style={{fontSize:10,marginLeft:6,color:'rgba(99,102,241,0.8)'}}>（你）</span>}
                    </div>
                    <div style={{display:'flex',gap:14,fontSize:12,color:'rgba(255,255,255,0.4)'}}>
                      <span>{p.count} 次</span>
                      <span>均 {p.avgScore}</span>
                      <span>最高 {p.bestScore}</span>
                    </div>
                    <div style={{fontSize:15,fontWeight:800,color:rankColor,minWidth:52,textAlign:'right'}}>
                      {val}<span style={{fontSize:10,fontWeight:400,marginLeft:2}}>{unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// EXPORT TO EXCEL
// ============================================================
function exportHistoryToExcel(records) {
  if (!records || !records.length) { alert('目前沒有練習記錄可以匯出。'); return; }
  const fmtDateCell = (iso) => {
    const d = new Date(iso); if (isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const rows = records.map(r => {
    const s = r.scenario || {};
    const m = r.finalMetrics || {};
    return {
      '日期': fmtDateCell(r.date),
      '練習者': r.practitioner || '',
      '業務': s.業務 || '',
      '產品服務': s.產品服務 || s.產品 || '',
      '產業': s.產業 || '',
      '角色': s.角色 || '',
      '情境': s.情境 || '',
      '難度': s.難度 || '',
      '雲端環境': s.雲端環境 || '',
      '資安項目': s.資安項目 || '',
      '輪數': r.turns ?? '',
      '分數': r.score ?? '',
      '等級': r.grade || '',
      '信任度': m.trust ?? '',
      '興趣度': m.interest ?? '',
      '購買意願': m.buyIntent ?? '',
      '總結': r.summary || '',
      '做得好': (r.strengths || []).join('\n'),
      '可改進': (r.improvements || []).join('\n'),
      '教練建議': r.coachAdvice || '',
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 6 }, { wch: 6 }, { wch: 6 },
    { wch: 8 }, { wch: 8 }, { wch: 9 }, { wch: 44 }, { wch: 30 }, { wch: 30 }, { wch: 40 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '練習記錄');
  const p = n => String(n).padStart(2, '0');
  const now = new Date();
  const stamp = `${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}`;
  XLSX.writeFile(wb, `練習記錄_${stamp}.xlsx`);
}

// ============================================================
// HISTORY MODAL
// ============================================================
function HistoryModal({ onClose }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [filterName, setFilterName] = useState('');
  const gc = {S:'#ffd700',A:'#6366f1',B:'#22c55e',C:'#f59e0b',D:'#ef4444'};

  useEffect(() => {
    getHistory().then(data => { setList(data); setLoading(false); });
  }, []);

  const remove = async (fsId, localId) => {
    await deleteHistory(fsId, localId);
    const data = await getHistory();
    setList(data);
    if(expanded===(fsId||localId)) setExpanded(null);
  };

  const names = [...new Set(list.map(r=>r.practitioner).filter(Boolean))];
  const filtered = filterName ? list.filter(r=>r.practitioner===filterName) : list;

  const fmt = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:200,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'20px 12px',overflowY:'auto'}}>
      <div style={{background:'#111827',border:'1px solid rgba(99,102,241,0.25)',borderRadius:20,width:'100%',maxWidth:640,padding:24,boxShadow:'0 0 60px rgba(99,102,241,0.15)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
          <h2 style={{margin:0,fontSize:18,fontWeight:800}}>📋 練習記錄</h2>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <button onClick={()=>exportHistoryToExcel(filtered)} disabled={loading||filtered.length===0} title="匯出成 Excel"
              style={{display:'flex',alignItems:'center',gap:5,padding:'6px 13px',background:(loading||filtered.length===0)?'rgba(255,255,255,0.06)':'linear-gradient(135deg,#16a34a,#22c55e)',border:'none',borderRadius:9,color:'white',fontWeight:700,fontSize:12,cursor:(loading||filtered.length===0)?'not-allowed':'pointer',opacity:(loading||filtered.length===0)?0.5:1}}>📊 匯出 Excel</button>
            <button onClick={onClose} style={{background:'none',border:'none',color:'rgba(255,255,255,0.45)',fontSize:20,cursor:'pointer',lineHeight:1}}>✕</button>
          </div>
        </div>

        {/* Name filter */}
        {names.length>1 && (
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
            <button onClick={()=>setFilterName('')} style={{padding:'4px 12px',borderRadius:20,border:'1px solid rgba(255,255,255,0.12)',background:filterName?'transparent':'rgba(99,102,241,0.25)',color:filterName?'rgba(255,255,255,0.45)':'white',fontSize:12,cursor:'pointer'}}>全部</button>
            {names.map(n=>(
              <button key={n} onClick={()=>setFilterName(n===filterName?'':n)} style={{padding:'4px 12px',borderRadius:20,border:'1px solid rgba(255,255,255,0.12)',background:filterName===n?'rgba(99,102,241,0.25)':'transparent',color:filterName===n?'white':'rgba(255,255,255,0.45)',fontSize:12,cursor:'pointer'}}>{n}</button>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{textAlign:'center',padding:'40px 0',color:'rgba(255,255,255,0.35)',fontSize:14}}>載入中...</div>
        ) : filtered.length===0 ? (
          <div style={{textAlign:'center',padding:'40px 0',color:'rgba(255,255,255,0.35)',fontSize:14}}>
            還沒有練習記錄，完成第一次覆盤後會自動儲存。
          </div>
        ) : filtered.map(r => {
          const color = gc[r.grade]||'#6366f1';
          const uid = r.fsId || r.id;
          const isOpen = expanded===uid;
          return (
            <div key={uid} style={{background:'rgba(255,255,255,0.04)',border:`1px solid ${isOpen?'rgba(99,102,241,0.3)':'rgba(255,255,255,0.07)'}`,borderRadius:14,marginBottom:10,overflow:'hidden',transition:'border-color 0.2s'}}>
              <div onClick={()=>setExpanded(isOpen?null:uid)} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',cursor:'pointer'}}>
                <div style={{flexShrink:0,width:44,height:44,position:'relative'}}>
                  <svg width={44} height={44} style={{transform:'rotate(-90deg)'}}>
                    <circle cx={22} cy={22} r={18} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={4}/>
                    <circle cx={22} cy={22} r={18} fill="none" stroke={color} strokeWidth={4}
                      strokeDasharray={`${2*Math.PI*18}`} strokeDashoffset={`${2*Math.PI*18*(1-r.score/100)}`} strokeLinecap="round"/>
                  </svg>
                  <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color}}>{r.score}</div>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4,flexWrap:'wrap'}}>
                    {r.practitioner && <span style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,0.9)',background:'rgba(99,102,241,0.2)',padding:'1px 8px',borderRadius:10}}>{r.practitioner}</span>}
                    <span style={{fontSize:13,fontWeight:700,color}}>{r.grade} 等級</span>
                    <span style={{fontSize:11,color:'rgba(255,255,255,0.35)'}}>{fmt(r.date)}</span>
                    <span style={{fontSize:11,color:'rgba(255,255,255,0.35)'}}>· {r.turns} 輪</span>
                  </div>
                  <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                    {[r.scenario?.業務, r.scenario?.產品服務 || r.scenario?.產品, r.scenario?.資安項目, r.scenario?.產業, r.scenario?.角色].filter(Boolean).map(t=>(
                      <span key={t} style={{fontSize:10,padding:'2px 7px',background:'rgba(255,255,255,0.07)',borderRadius:20,color:'rgba(255,255,255,0.55)'}}>{t}</span>
                    ))}
                  </div>
                </div>
                <span style={{color:'rgba(255,255,255,0.3)',fontSize:13,flexShrink:0}}>{isOpen?'▲':'▼'}</span>
              </div>

              {isOpen && (
                <div style={{borderTop:'1px solid rgba(255,255,255,0.06)',padding:'14px 16px',display:'flex',flexDirection:'column',gap:12}}>
                  {r.summary && <p style={{margin:0,fontSize:13,color:'rgba(255,255,255,0.65)',lineHeight:1.6}}>{r.summary}</p>}
                  <div style={{display:'flex',gap:10}}>
                    {[['信任度',r.finalMetrics?.trust,'#6366f1'],['興趣度',r.finalMetrics?.interest,'#a855f7'],['購買意願',r.finalMetrics?.buyIntent,'#06b6d4']].map(([l,v,c])=>(
                      <div key={l} style={{flex:1,background:'rgba(255,255,255,0.04)',borderRadius:10,padding:'8px 10px',textAlign:'center'}}>
                        <div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div>
                        <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',marginTop:2}}>{l}</div>
                      </div>
                    ))}
                  </div>
                  {r.strengths?.length>0 && <div><div style={{fontSize:12,color:'#22c55e',fontWeight:600,marginBottom:5}}>✅ 做得好</div>{r.strengths.map((s,i)=><div key={i} style={{fontSize:12,color:'rgba(255,255,255,0.55)',lineHeight:1.6}}>• {s}</div>)}</div>}
                  {r.improvements?.length>0 && <div><div style={{fontSize:12,color:'#f59e0b',fontWeight:600,marginBottom:5}}>⚠️ 可改進</div>{r.improvements.map((s,i)=><div key={i} style={{fontSize:12,color:'rgba(255,255,255,0.55)',lineHeight:1.6}}>• {s}</div>)}</div>}
                  {r.coachAdvice && <div style={{background:'rgba(6,182,212,0.07)',border:'1px solid rgba(6,182,212,0.15)',borderRadius:10,padding:'10px 12px'}}><div style={{fontSize:12,color:'#22d3ee',fontWeight:600,marginBottom:4}}>💡 教練建議</div><div style={{fontSize:12,color:'rgba(255,255,255,0.55)',lineHeight:1.6}}>{r.coachAdvice}</div></div>}
                  <button onClick={()=>remove(r.fsId, r.id)} style={{alignSelf:'flex-end',padding:'5px 12px',background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:8,color:'#fca5a5',fontSize:11,cursor:'pointer'}}>🗑 刪除此筆</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
function App() {
  const [hasKey,setHasKey]=useState(()=>!!getApiKey());
  const [phase,setPhase]=useState('setup');
  const [scenario,setScenario]=useState(null);
  const [reviewData,setReviewData]=useState(null);
  const [showHistory,setShowHistory]=useState(false);
  const [showLeaderboard,setShowLeaderboard]=useState(false);
  const [userName,setUserName]=useState(getUserName);
  const [editingName,setEditingName]=useState(false);
  const [nameInput,setNameInput]=useState('');

  if(!hasKey) return <ApiKeyModal onSaved={()=>setHasKey(true)}/>;
  if(!userName) return (
    <div style={{position:'fixed',inset:0,background:'#0a0e1a',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'#111827',border:'1px solid rgba(99,102,241,0.3)',borderRadius:20,padding:32,maxWidth:380,width:'100%',boxShadow:'0 0 60px rgba(99,102,241,0.2)'}}>
        <div style={{fontSize:28,textAlign:'center',marginBottom:8}}>👤</div>
        <h2 style={{textAlign:'center',fontSize:18,fontWeight:800,marginBottom:6}}>你的名字是？</h2>
        <p style={{color:'rgba(255,255,255,0.5)',fontSize:13,textAlign:'center',marginBottom:20,lineHeight:1.6}}>用於記錄每次練習，讓團隊可以看到各自的進度。</p>
        <input value={nameInput} onChange={e=>setNameInput(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&nameInput.trim()&&(saveUserName(nameInput),setUserName(nameInput.trim()))}
          placeholder="輸入你的名字..." autoFocus
          style={{width:'100%',padding:'12px 14px',background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:10,color:'white',fontSize:14,outline:'none',marginBottom:8}}/>
        <button onClick={()=>{if(nameInput.trim()){saveUserName(nameInput);setUserName(nameInput.trim());}}}
          disabled={!nameInput.trim()}
          style={{width:'100%',padding:'13px 0',background:'linear-gradient(135deg,#6366f1,#a855f7)',border:'none',borderRadius:10,color:'white',fontWeight:700,fontSize:15,cursor:nameInput.trim()?'pointer':'not-allowed',opacity:nameInput.trim()?1:0.5}}>開始練習</button>
      </div>
    </div>
  );

  return(
    <div style={{minHeight:'100vh',background:'#0a0e1a',color:'white'}}>
      {showHistory && <HistoryModal onClose={()=>setShowHistory(false)}/>}
      {showLeaderboard && <LeaderboardModal onClose={()=>setShowLeaderboard(false)}/>}
      {/* Header bar */}
      <div style={{position:'fixed',top:0,right:0,zIndex:50,padding:'8px 12px',display:'flex',gap:8,alignItems:'center'}}>
        {editingName ? (
          <input value={nameInput} onChange={e=>setNameInput(e.target.value)}
            onBlur={()=>{if(nameInput.trim()){saveUserName(nameInput);setUserName(nameInput.trim());}setEditingName(false);}}
            onKeyDown={e=>{if(e.key==='Enter'&&nameInput.trim()){saveUserName(nameInput);setUserName(nameInput.trim());setEditingName(false);}}}
            autoFocus style={{padding:'4px 8px',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(99,102,241,0.4)',borderRadius:6,color:'white',fontSize:11,width:90,outline:'none'}}/>
        ) : (
          <button onClick={()=>{setNameInput(userName);setEditingName(true);}} style={{padding:'5px 10px',background:'rgba(99,102,241,0.15)',border:'1px solid rgba(99,102,241,0.25)',borderRadius:8,color:'rgba(255,255,255,0.6)',fontSize:11,cursor:'pointer'}}>👤 {userName}</button>
        )}
        <button onClick={()=>setShowLeaderboard(true)} style={{padding:'5px 10px',background:'rgba(255,215,0,0.08)',border:'1px solid rgba(255,215,0,0.2)',borderRadius:8,color:'rgba(255,215,0,0.7)',fontSize:11,cursor:'pointer'}}>🏆 排行榜</button>
        <button onClick={()=>setShowHistory(true)} style={{padding:'5px 10px',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,color:'rgba(255,255,255,0.4)',fontSize:11,cursor:'pointer'}}>📋 練習記錄</button>
        <button onClick={()=>{clearApiKey();setHasKey(false);}} title="更換 API Key" style={{padding:'5px 10px',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,color:'rgba(255,255,255,0.4)',fontSize:11,cursor:'pointer'}}>🔑 更換 Key</button>
      </div>

      {phase==='setup'&&(
        <div style={{maxWidth:1300,margin:'0 auto',padding:'24px 20px 40px'}}>
          <SetupPhase onStart={sel=>{setScenario(sel);setPhase('chat');}}/>
        </div>
      )}
      {phase==='chat'&&scenario&&(
        <ChatPhase scenario={scenario} onEnd={(scen,log,mh)=>{setReviewData({scen,log,mh});setPhase('review');}}/>
      )}
      {phase==='review'&&reviewData&&(
        <div style={{maxWidth:680,margin:'0 auto',padding:'24px 12px'}}>
          <ReviewPhase scenario={reviewData.scen} log={reviewData.log} mHistory={reviewData.mh}
            onRetry={()=>{setPhase('chat');setReviewData(null);}}
            onNew={()=>{setPhase('setup');setScenario(null);setReviewData(null);}}/>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App/>);
