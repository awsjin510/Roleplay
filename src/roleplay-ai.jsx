import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { salespersons, products, industries, personas, situations, difficulties, cloudEnvironments } from '../js/data.js';
import { roleProfiles, industryProfiles, cloudEnvProfiles, difficultyBehaviors, HINTS } from '../js/profiles.js';

// ============================================================
// DATA（清單與轉盤頁共用 js/data.js，設定檔共用 js/profiles.js）
// ============================================================
const SLOT_DATA = {
  業務: { icon: "👤", items: salespersons },
  產品: { icon: "🎁", items: products },
  產業: { icon: "🏢", items: industries },
  角色: { icon: "🧑‍💼", items: personas },
  情境: { icon: "📋", items: situations },
  難度: { icon: "🔥", color: "red", items: difficulties },
  雲端環境: { icon: "☁️", items: cloudEnvironments },
};
const BASE_CATEGORIES = Object.keys(SLOT_DATA).filter(c => c !== '雲端環境');
const ALL_CATEGORIES = Object.keys(SLOT_DATA);

// ============================================================
// API KEY MANAGEMENT
// ============================================================
function getApiKey() { return localStorage.getItem('anthropic_api_key') || ''; }
function saveApiKey(k) { localStorage.setItem('anthropic_api_key', k.trim()); }
function clearApiKey() { localStorage.removeItem('anthropic_api_key'); }

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

function ApiKeyModal({ onSaved }) {
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  const [testing, setTesting] = useState(false);
  const save = async () => {
    if (!val.trim().startsWith('sk-ant-')) { setErr('格式不對，應以 sk-ant- 開頭'); return; }
    setTesting(true); setErr('');
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: apiHeaders(val.trim()),
        body: JSON.stringify({ model: TEST_MODEL, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }),
      });
      if (res.status === 401) { setErr('API Key 無效，請重新確認'); setTesting(false); return; }
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr('驗證失敗：' + (d.error?.message || res.status)); setTesting(false); return; }
      saveApiKey(val.trim());
      onSaved();
    } catch (e) {
      setErr('連線失敗：' + e.message);
    }
    setTesting(false);
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20 }}>
      <div style={{ background: '#111827', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 20, padding: 32, maxWidth: 440, width: '100%', boxShadow: '0 0 60px rgba(99,102,241,0.2)' }}>
        <div style={{ fontSize: 28, textAlign: 'center', marginBottom: 8 }}>🔑</div>
        <h2 style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, marginBottom: 6 }}>設定 Anthropic API Key</h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginBottom: 20, lineHeight: 1.6 }}>
          到 <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{ color: '#a5b4fc' }}>console.anthropic.com</a> 取得 Key。<br />
          Key 僅存在你的瀏覽器，不會上傳至伺服器。
        </p>
        <input value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && save()}
          placeholder="sk-ant-api03-..." type="password"
          style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, color: 'white', fontSize: 14, outline: 'none', marginBottom: 8 }} />
        {err && <p style={{ color: '#fca5a5', fontSize: 13, marginBottom: 8 }}>{err}</p>}
        <button onClick={save} disabled={testing || !val.trim()} style={{
          width: '100%', padding: '13px 0', background: testing ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg,#6366f1,#a855f7)',
          border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, fontSize: 15, cursor: testing ? 'not-allowed' : 'pointer',
        }}>{testing ? '驗證中...' : '儲存並開始'}</button>
      </div>
    </div>
  );
}

// ============================================================
// PROMPT BUILDERS
// ============================================================
function buildSystemPrompt(scenario) {
  const role = roleProfiles[scenario.角色] || roleProfiles['IT窗口'];
  const industry = industryProfiles[scenario.產業] || industryProfiles['新創公司'];
  const difficulty = difficultyBehaviors[scenario.難度] || '';
  const cloudEnv = cloudEnvProfiles[scenario.雲端環境];
  const cloudSection = cloudEnv ? `
## 你的雲端環境背景（${scenario.雲端環境}）
- 目前熟悉度：${cloudEnv.familiarity}
- 你的顧慮：${cloudEnv.concerns}
- 你的態度：${cloudEnv.attitude}
- 你常提到的關鍵詞：${cloudEnv.keywords}
` : '';
  return `你是一位${scenario.產業}的${scenario.角色}。

## 你的基本資訊
- 你在一家${scenario.產業}工作，職位是${scenario.角色}
- 你的技術水平：${role.techLevel}
- 你的決策權限：${role.decisionPower}
- 你目前的狀況：${scenario.情境}

## 你的性格與溝通風格
- ${role.personality}
- 你主要擔心的事：${role.concerns}

## 你的產業背景
- 預算狀況：${industry.budget}
- 產業痛點：${industry.painPoints}
- 組織文化：${industry.culture}
${cloudSection}
## 關於來訪的業務
- 業務人員叫 ${scenario.業務}，來自一家資安/雲端服務公司
- 他們要推銷的產品是：${scenario.產品}
- 你對這個產品有基本的認知但不深入

## 行為模式（難度）
${difficulty}

## 對話規則
1. 全程使用繁體中文，保持角色一致性
2. 不要太快被說服 — 至少需要 3-4 輪有效論述才開始鬆口
3. 適時提出反對意見和疑慮；業務答非所問時表現不耐煩
4. 每次回覆控制在 2-4 句話，像真實對話一樣簡潔
5. 對話開始時先簡短自我介紹並說明你的需求
6. 若有雲端環境背景，對話中自然融入該平台的術語與顧慮

## 隱藏指標
每次回覆末尾加：<!--METRICS:{"trust":數字,"interest":數字,"buyIntent":數字,"notes":"記錄"}-->
初始值 trust=20, interest=30, buyIntent=10，每輪變化 -10 到 +15。`;
}

function buildReviewPrompt(scenario, conversationLog, metricsHistory) {
  return `你是資深銷售培訓教練，請覆盤以下角色扮演練習。

情境：業務${scenario.業務}向${scenario.產業}的${scenario.角色}推銷${scenario.產品}，客戶情境「${scenario.情境}」，難度「${scenario.難度}」。

指標變化：${JSON.stringify(metricsHistory)}

對話記錄：
${conversationLog}

請用 JSON 格式回覆（不含其他文字）：
{"overallScore":75,"grade":"B","summary":"總結50字","strengths":["優點1","優點2"],"improvements":["改進1","改進2"],"missedOpportunities":["錯過機會1"],"keyMoment":"關鍵轉折描述","coachAdvice":"具體建議100字","metricsAnalysis":{"trustTrend":"上升","interestTrend":"持平","buyIntentTrend":"下降","analysis":"分析50字"}}`;
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
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 160, display: 'block' }}>
      {[0, 50, 100].map(v => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={yS(v)} y2={yS(v)} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
          <text x={pad.l - 3} y={yS(v) + 3.5} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize={8}>{v}</text>
        </g>
      ))}
      {data.map((_, i) => (
        <text key={i} x={xS(i)} y={H - 4} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={8}>{i}</text>
      ))}
      {[['信任度', '#6366f1'], ['興趣度', '#a855f7'], ['購買意願', '#06b6d4']].map(([key, stroke]) => (
        <polyline key={key} points={pts(key)} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </svg>
  );
}

// ============================================================
// CIRCULAR GAUGE
// ============================================================
function CircularGauge({ label, value, color }) {
  const r = 46, sw = 7, nr = r - sw / 2, c = nr * 2 * Math.PI, off = c - (value / 100) * c;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
      <div style={{ position: 'relative', width: r * 2, height: r * 2 }}>
        <svg width={r * 2} height={r * 2} style={{ transform: 'rotate(-90deg)' }}>
          <circle stroke="rgba(255,255,255,0.1)" fill="transparent" strokeWidth={sw} r={nr} cx={r} cy={r} />
          <circle stroke={color} fill="transparent" strokeWidth={sw}
            strokeDasharray={`${c} ${c}`} strokeDashoffset={off} strokeLinecap="round" r={nr} cx={r} cy={r}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: 'white' }}>{value}</span>
        </div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.55)' }}>{label}</span>
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
    let speed = 50, elapsed = 0;
    const target = Math.floor(Math.random() * n);
    const total = 1800 + Math.random() * 800;
    const tick = () => {
      setSel(i => (i + 1) % n);
      elapsed += speed;
      if (elapsed > total * 0.6) speed = Math.min(320, speed * 1.09);
      if (elapsed >= total) { setSel(target); setSpinning(false); onSpinComplete(category, data.items[target]); }
      else { tmr.current = setTimeout(tick, speed); }
    };
    tmr.current = setTimeout(tick, speed);
  }, [spinning, data, n, category, onSpinComplete]);

  useEffect(() => { if (spinTrigger > 0) doSpin(); }, [spinTrigger]);
  useEffect(() => () => clearTimeout(tmr.current), []);

  // Show a window of 5 items centered on selected (works for any list length)
  const WIN = 5, HALF = 2;
  const window5 = Array.from({ length: WIN }, (_, i) => {
    const offset = i - HALF;
    const idx = ((sel + offset) % n + n) % n;
    return { idx, item: data.items[idx], isSel: offset === 0 };
  });

  const navBtn = (dir, label) => (
    <button onClick={() => step(dir)} disabled={spinning} style={{
      width: '100%', padding: '4px 0', background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'rgba(255,255,255,0.45)',
      fontSize: 13, cursor: spinning ? 'not-allowed' : 'pointer', lineHeight: 1,
      transition: 'all 0.15s', opacity: spinning ? 0.3 : 1
    }}>
      {label}
    </button>
  );

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '16px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: wide ? 1.6 : 1, minWidth: wide ? 160 : 110 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em' }}>{data.icon} {category}</div>
      {navBtn(-1, '▲')}
      <div style={{ width: '100%', borderRadius: 10, background: 'rgba(0,0,0,0.3)', padding: '8px 5px', display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' }}>
        {window5.map(({ idx, item, isSel }) => (
          <div key={idx} style={{
            padding: '6px 7px', borderRadius: 8, textAlign: 'center', fontSize: 11,
            fontWeight: isSel ? 700 : 400, color: isSel ? 'white' : 'rgba(255,255,255,0.28)',
            background: isSel ? `rgba(${isRed ? '239,68,68' : '99,102,241'},0.2)` : 'transparent',
            border: isSel ? `1px solid ${gc}55` : '1px solid transparent',
            boxShadow: isSel ? `0 0 10px ${gc}30` : 'none', transition: 'all 0.08s ease'
          }}>
            {item}
          </div>
        ))}
      </div>
      {navBtn(1, '▼')}
      <button onClick={doSpin} disabled={spinning} style={{
        width: '100%', padding: '8px 0',
        background: spinning ? 'rgba(255,255,255,0.05)' : `linear-gradient(135deg,${gc},${isRed ? '#dc2626' : '#a855f7'})`,
        border: 'none', borderRadius: 8, color: 'white', fontWeight: 600, fontSize: 12,
        cursor: spinning ? 'not-allowed' : 'pointer', opacity: spinning ? 0.5 : 1, transition: 'all 0.2s'
      }}>
        {spinning ? '轉中...' : '🎲 轉'}
      </button>
    </div>
  );
}

// ============================================================
// SETUP PHASE
// ============================================================
function SetupPhase({ onStart }) {
  const [selections, setSelections] = useState({});
  const [triggers, setTriggers] = useState(() => Object.fromEntries(ALL_CATEGORIES.map(c => [c, 0])));

  const isCloudProduct = selections.產品 === '雲端服務';
  const requiredCats = isCloudProduct ? [...BASE_CATEGORIES, '雲端環境'] : BASE_CATEGORIES;
  const allSpun = requiredCats.every(c => selections[c] !== undefined);

  const handleDone = useCallback((cat, val) => {
    setSelections(p => {
      const next = { ...p, [cat]: val };
      if (cat === '產品' && val !== '雲端服務') delete next['雲端環境'];
      return next;
    });
  }, []);
  const spinAll = () => { setSelections({}); setTriggers(p => Object.fromEntries(ALL_CATEGORIES.map(c => [c, p[c] + 1]))); };
  const reset = () => { setSelections({}); setTriggers(Object.fromEntries(ALL_CATEGORIES.map(c => [c, 0]))); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, background: 'linear-gradient(135deg,#6366f1,#a855f7,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
          🎰 業務角色扮演 AI 練習器
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.45)', marginTop: 8, fontSize: 13 }}>轉動轉盤，組合情境，與 AI 客戶對話練習</p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {BASE_CATEGORIES.map(cat => (
          <SlotColumn key={cat} category={cat} data={SLOT_DATA[cat]} onSpinComplete={handleDone} spinTrigger={triggers[cat]} wide={cat === '難度'} />
        ))}
      </div>
      {isCloudProduct && (
        <div style={{ animation: 'fadeInUp 0.35s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg,transparent,rgba(6,182,212,0.4))' }} />
            <span style={{ color: '#67e8f9', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>☁️ 雲端環境（產品為雲端服務時啟用）</span>
            <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg,rgba(6,182,212,0.4),transparent)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 160 }}>
              <SlotColumn key="雲端環境" category="雲端環境" data={SLOT_DATA['雲端環境']} onSpinComplete={handleDone} spinTrigger={triggers['雲端環境']} />
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button onClick={spinAll} style={{ padding: '13px 32px', background: 'linear-gradient(135deg,#6366f1,#a855f7)', border: 'none', borderRadius: 12, color: 'white', fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: '0 0 28px rgba(99,102,241,0.4)' }}>🎰 全部轉！</button>
        <button onClick={reset} style={{ padding: '13px 22px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>🔄 重置</button>
      </div>
      {allSpun && (
        <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 16, padding: 18, animation: 'fadeInUp 0.4s ease' }}>
          <h3 style={{ color: 'rgba(255,255,255,0.75)', margin: '0 0 12px 0', fontSize: 14 }}>📋 你的練習情境</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
            {requiredCats.map(cat => (
              <div key={cat} style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${cat === '雲端環境' ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 10, padding: '7px 13px', fontSize: 12 }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', marginRight: 4 }}>{SLOT_DATA[cat].icon} {cat}</span>
                <span style={{ color: cat === '難度' ? '#fca5a5' : cat === '雲端環境' ? '#67e8f9' : '#a5b4fc', fontWeight: 700 }}>{selections[cat]}</span>
              </div>
            ))}
          </div>
          <button onClick={() => onStart(selections)} style={{ width: '100%', padding: '15px 0', background: 'linear-gradient(135deg,#6366f1,#a855f7)', border: 'none', borderRadius: 12, color: 'white', fontWeight: 700, fontSize: 16, cursor: 'pointer', boxShadow: '0 0 28px rgba(99,102,241,0.5)' }}>
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
  const [messages, setMessages] = useState([]);
  const [metrics, setMetrics] = useState({ trust: 20, interest: 30, buyIntent: 10 });
  const [mHistory, setMHistory] = useState([{ trust: 20, interest: 30, buyIntent: 10 }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [turns, setTurns] = useState(0);
  const [toast, setToast] = useState(null);
  const endRef = useRef(null);
  const apiMsgs = useRef([{ role: 'user', content: '（場景開始：業務人員剛走進你的辦公室，請你先開口說話）' }]);
  const sys = useRef(buildSystemPrompt(scenario));

  const askAI = async (isFirst = false) => {
    setLoading(true);
    setStreamText('');
    const r = await sendMessage(apiMsgs.current, sys.current, { stream: true, onDelta: setStreamText });
    apiMsgs.current.push({ role: 'assistant', content: r.text });
    setMessages(p => [...p, { role: 'assistant', content: r.text }]);
    if (r.metrics) { setMetrics(r.metrics); setMHistory(p => (isFirst ? [r.metrics] : [...p, r.metrics])); }
    setStreamText('');
    setLoading(false);
  };

  useEffect(() => { askAI(true); }, []);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages, loading, streamText]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const txt = input.trim(); setInput('');
    setMessages(p => [...p, { role: 'user', content: txt }]);
    apiMsgs.current.push({ role: 'user', content: txt });
    setTurns(t => t + 1);
    await askAI();
  };

  const hint = () => { setToast(HINTS[Math.floor(Math.random() * HINTS.length)]); setTimeout(() => setToast(null), 3500); };
  const end = () => onEnd(scenario, messages.map(m => `${m.role === 'user' ? '業務' : '客戶'}: ${m.content}`).join('\n\n'), mHistory);

  const bubble = (msg, i, isStreaming) => (
    <div key={isStreaming ? 'streaming' : i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', animation: 'fadeInUp 0.25s ease' }}>
      <div style={{
        maxWidth: '75%', padding: '10px 14px',
        borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: msg.role === 'user' ? 'linear-gradient(135deg,#6366f1,#a855f7)' : 'rgba(255,255,255,0.06)',
        border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)',
        fontSize: 14, lineHeight: 1.6, color: 'white'
      }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{msg.role === 'user' ? `👤 ${scenario.業務}` : '🤖 客戶'}</div>
        {msg.content}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      {toast && <div style={{ position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)', background: 'rgba(99,102,241,0.96)', color: 'white', padding: '11px 18px', borderRadius: 12, fontSize: 13, maxWidth: 360, textAlign: 'center', zIndex: 1000, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', animation: 'fadeInDown 0.3s ease' }}>💡 {toast}</div>}

      <div style={{ background: 'rgba(0,0,0,0.45)', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginRight: 3 }}>情境</span>
          {ALL_CATEGORIES.filter(cat => scenario[cat] !== undefined).map(cat => (
            <span key={cat} style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${cat === '難度' ? 'rgba(239,68,68,0.25)' : cat === '雲端環境' ? 'rgba(6,182,212,0.25)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 6, padding: '2px 8px', fontSize: 11, color: cat === '難度' ? '#fca5a5' : cat === '雲端環境' ? '#67e8f9' : 'rgba(255,255,255,0.65)' }}>
              {SLOT_DATA[cat].icon} {scenario[cat]}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600, color: '#a5b4fc' }}>
            第 {turns} 輪
          </span>
          {loading && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>AI 回覆中...</span>}
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((msg, i) => bubble(msg, i, false))}
            {loading && streamText && bubble({ role: 'assistant', content: streamText }, -1, true)}
            {loading && !streamText && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '18px 18px 18px 4px', display: 'flex', gap: 5, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#6366f1', animation: `bounce 1.1s ${i * 0.18}s infinite` }} />)}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: 10, display: 'flex', gap: 8, flexShrink: 0 }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder={`輸入 ${scenario.業務} 的回應...`} disabled={loading}
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 13px', color: 'white', fontSize: 14, outline: 'none' }} />
            <button onClick={send} disabled={loading || !input.trim()} style={{ padding: '10px 16px', background: 'linear-gradient(135deg,#6366f1,#a855f7)', border: 'none', borderRadius: 10, color: 'white', fontWeight: 600, cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', opacity: loading || !input.trim() ? 0.45 : 1 }}>發送</button>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '7px 10px', display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={hint} style={{ padding: '6px 13px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(255,255,255,0.65)', fontSize: 12, cursor: 'pointer' }}>💡 提示</button>
            <button onClick={end} disabled={messages.length < 2} style={{ padding: '6px 13px', background: messages.length >= 2 ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${messages.length >= 2 ? 'rgba(239,68,68,0.28)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 8, color: messages.length >= 2 ? '#fca5a5' : 'rgba(255,255,255,0.28)', fontSize: 12, cursor: messages.length >= 2 ? 'pointer' : 'not-allowed' }}>🏁 結束並覆盤</button>
          </div>
        </div>

        <div style={{ width: 160, borderLeft: '1px solid rgba(255,255,255,0.06)', padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center', flexShrink: 0, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textAlign: 'center', letterSpacing: '0.06em' }}>🎓 教練視角</div>
          <CircularGauge label="信任度" value={metrics.trust} color="#6366f1" />
          <CircularGauge label="興趣度" value={metrics.interest} color="#a855f7" />
          <CircularGauge label="購買意願" value={metrics.buyIntent} color="#06b6d4" />
          {metrics.notes && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 1.5, padding: '0 4px' }}>{metrics.notes}</div>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// REVIEW PHASE
// ============================================================
function ReviewPhase({ scenario, log, mHistory, onRetry, onNew }) {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const r = await sendMessage([{ role: 'user', content: buildReviewPrompt(scenario, log, mHistory) }], '你是資深銷售培訓教練，用JSON格式提供覆盤。', { maxTokens: 2000 });
      try {
        // 用深度追蹤正確擷取最外層 JSON 物件
        const extractJSON = (s) => { const i = s.indexOf('{'); if (i < 0) return null; let d = 0; for (let j = i; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}') { d--; if (d === 0) return s.slice(i, j + 1); } } return null; };
        const jsonStr = extractJSON(r.text);
        if (jsonStr) setReview(JSON.parse(jsonStr)); else setReview({ error: true });
      }
      catch { setReview({ error: true }); }
      setLoading(false);
    })();
  }, []);

  const chartData = mHistory.map((m, i) => ({ turn: i, 信任度: m.trust, 興趣度: m.interest, 購買意願: m.buyIntent }));
  const gc = { S: '#ffd700', A: '#6366f1', B: '#22c55e', C: '#f59e0b', D: '#ef4444' };

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 18 }}>
      <div style={{ width: 52, height: 52, border: '4px solid rgba(99,102,241,0.2)', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>AI 教練分析中...</p>
    </div>
  );
  if (!review || review.error) return (
    <div style={{ padding: 20, textAlign: 'center' }}>
      <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>覆盤失敗，請重試</p>
      <button onClick={onRetry} style={{ padding: '10px 24px', background: 'linear-gradient(135deg,#6366f1,#a855f7)', border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer', fontWeight: 600 }}>🔄 再試</button>
    </div>
  );

  const grade = review.grade || 'B', score = review.overallScore || 0, color = gc[grade] || '#6366f1';
  const circ = 2 * Math.PI * 38;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 32 }}>
      <h2 style={{ textAlign: 'center', fontSize: 20, fontWeight: 800, margin: 0 }}>🏆 練習覆盤報告</h2>

      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ position: 'relative', width: 84, height: 84, flexShrink: 0 }}>
          <svg width={84} height={84} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={42} cy={42} r={38} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={7} />
            <circle cx={42} cy={42} r={38} fill="none" stroke={color} strokeWidth={7}
              strokeDasharray={`${circ}`} strokeDashoffset={`${circ * (1 - score / 100)}`} strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s ease' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 20, fontWeight: 800, color }}>{score}</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>/ 100</span>
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 32, fontWeight: 900, color }}>{grade}</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>等級</span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{review.summary}</p>
        </div>
      </div>

      {chartData.length > 1 && (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 16 }}>
          <h4 style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 12px 0', fontSize: 13 }}>📈 指標趨勢</h4>
          <SimpleLineChart data={chartData} />
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 4 }}>
            {[['信任度', '#6366f1'], ['興趣度', '#a855f7'], ['購買意願', '#06b6d4']].map(([l, c]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 10, height: 3, background: c, borderRadius: 2 }} /><span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {[{ icon: '✅', title: '做得好的地方', items: review.strengths, c: '#22c55e' }, { icon: '⚠️', title: '可以改進的地方', items: review.improvements, c: '#f59e0b' }, { icon: '💎', title: '錯過的機會點', items: review.missedOpportunities, c: '#a855f7' }]
        .filter(s => s.items?.length).map(({ icon, title, items, c }) => (
          <div key={title} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}>
            <h4 style={{ color: 'rgba(255,255,255,0.78)', margin: '0 0 10px 0', fontSize: 13 }}>{icon} {title}</h4>
            {items.map((item, i) => <div key={i} style={{ display: 'flex', gap: 7, color: 'rgba(255,255,255,0.62)', fontSize: 13, lineHeight: 1.6, marginBottom: i < items.length - 1 ? 7 : 0 }}><span style={{ color: c, flexShrink: 0 }}>•</span>{item}</div>)}
          </div>
        ))}

      {review.keyMoment && <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 14, padding: 16 }}><h4 style={{ color: 'rgba(255,255,255,0.78)', margin: '0 0 8px 0', fontSize: 13 }}>🔑 關鍵轉折</h4><p style={{ color: 'rgba(255,255,255,0.58)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>「{review.keyMoment}」</p></div>}
      {review.coachAdvice && <div style={{ background: 'rgba(6,182,212,0.07)', border: '1px solid rgba(6,182,212,0.18)', borderRadius: 14, padding: 16 }}><h4 style={{ color: 'rgba(255,255,255,0.78)', margin: '0 0 8px 0', fontSize: 13 }}>💡 教練建議</h4><p style={{ color: 'rgba(255,255,255,0.58)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{review.coachAdvice}</p></div>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onRetry} style={{ flex: 1, padding: '13px 0', background: 'linear-gradient(135deg,#6366f1,#a855f7)', border: 'none', borderRadius: 12, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>🔄 再練一次</button>
        <button onClick={onNew} style={{ flex: 1, padding: '13px 0', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>🎲 換情境</button>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
function App() {
  const [hasKey, setHasKey] = useState(() => !!getApiKey());
  const [phase, setPhase] = useState('setup');
  const [scenario, setScenario] = useState(null);
  const [reviewData, setReviewData] = useState(null);

  if (!hasKey) return <ApiKeyModal onSaved={() => setHasKey(true)} />;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0e1a', color: 'white' }}>
      {/* Header bar */}
      <div style={{ position: 'fixed', top: 0, right: 0, zIndex: 50, padding: '8px 12px' }}>
        <button onClick={() => { clearApiKey(); setHasKey(false); }} title="更換 API Key" style={{ padding: '5px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}>🔑 更換 Key</button>
      </div>

      {phase === 'setup' && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 12px 24px' }}>
          <SetupPhase onStart={sel => { setScenario(sel); setPhase('chat'); }} />
        </div>
      )}
      {phase === 'chat' && scenario && (
        <ChatPhase scenario={scenario} onEnd={(scen, log, mh) => { setReviewData({ scen, log, mh }); setPhase('review'); }} />
      )}
      {phase === 'review' && reviewData && (
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 12px' }}>
          <ReviewPhase scenario={reviewData.scen} log={reviewData.log} mHistory={reviewData.mh}
            onRetry={() => { setPhase('chat'); setReviewData(null); }}
            onNew={() => { setPhase('setup'); setScenario(null); setReviewData(null); }} />
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
