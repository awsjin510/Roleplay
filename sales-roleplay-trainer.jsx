import { useState, useRef, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// ============================================================
// DATA
// ============================================================
const SLOT_DATA = {
  業務: { icon: "👤", items: ["Herna", "Jennifer", "Hailey", "Howard", "Wednesday"] },
  產品: { icon: "🎁", items: ["MDR", "SOC", "MSSP", "雲端服務", "CMSP"] },
  產業: { icon: "🏢", items: ["廣告代理商", "SI系統整合商", "政府機關", "新創公司", "遊戲產業"] },
  角色: { icon: "🧑‍💼", items: ["行政助理", "IT窗口", "MIS工程師", "IT主管", "資訊長(CIO)"] },
  情境: { icon: "📋", items: ["主管要求降低成本", "IT設備即將到期", "想做系統備援", "資料備份不足", "正在做數位轉型"] },
  難度: { icon: "🔥", color: "red", items: ["客戶只談價格", "客戶不信任新供應商", "客戶認為現在系統很好", "客戶一直提競品", "客戶要求立刻報價"] },
};
const CATEGORIES = Object.keys(SLOT_DATA);

// ============================================================
// PROFILE DATA
// ============================================================
const roleProfiles = {
  行政助理: { techLevel: "低", decisionPower: "無，需要轉達上級", personality: "友善但不懂技術，會問很基本的問題", concerns: "怕麻煩、怕選錯被罵" },
  IT窗口: { techLevel: "中", decisionPower: "建議權，需主管核准", personality: "務實，關注實際操作面", concerns: "維護工作量、與現有系統相容性" },
  MIS工程師: { techLevel: "高", decisionPower: "技術評估權，預算需上報", personality: "會問深入技術問題，對誇大宣傳反感", concerns: "技術規格、SLA、整合難度" },
  IT主管: { techLevel: "中高", decisionPower: "有預算裁量權", personality: "注重 ROI 和管理效率", concerns: "人力配置、總擁有成本、廠商穩定度" },
  "資訊長(CIO)": { techLevel: "策略層", decisionPower: "最終決策者", personality: "時間寶貴，只看重點和策略價值", concerns: "企業策略對齊、風險管控、數位轉型藍圖" },
};
const industryProfiles = {
  廣告代理商: { budget: "中等，但彈性大", painPoints: "客戶資料安全、快速部署、多專案管理", culture: "步調快、重視創意與效率" },
  SI系統整合商: { budget: "看專案而定", painPoints: "需要轉售或搭配方案、技術支援品質", culture: "懂技術、會比較多家方案" },
  政府機關: { budget: "有預算但流程冗長", painPoints: "合規要求、資安等級、採購法規", culture: "保守、重視公文與正式流程" },
  新創公司: { budget: "有限但願意投資關鍵領域", painPoints: "快速擴展、成本效益、未來擴充性", culture: "敏捷、願意嘗試新方案" },
  遊戲產業: { budget: "兩極化（大廠充裕，獨立工作室有限）", painPoints: "DDoS防護、玩家數據安全、高可用性", culture: "技術導向、重視用戶體驗" },
};
const difficultyBehaviors = {
  客戶只談價格: "每次回應都要提到價格或預算限制，不斷要求降價或比價",
  客戶不信任新供應商: "反覆質疑你們公司的規模、經驗、客戶案例，問很多信任驗證的問題",
  客戶認為現在系統很好: "不斷強調現有方案運作正常，質疑為何要改變，需要很強的理由才會動搖",
  客戶一直提競品: "持續拿競品來比較，問你們跟競品廠商比有什麼優勢",
  客戶要求立刻報價: "急著要報價單，不想花時間聽產品介紹，催促快點給數字",
};

// ============================================================
// PROMPT BUILDERS
// ============================================================
function buildSystemPrompt(scenario) {
  const role = roleProfiles[scenario.角色] || roleProfiles["IT窗口"];
  const industry = industryProfiles[scenario.產業] || industryProfiles["新創公司"];
  const difficulty = difficultyBehaviors[scenario.難度] || "";
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

## 關於來訪的業務
- 業務人員叫 ${scenario.業務}，來自一家資安/雲端服務公司
- 他們要推銷的產品是：${scenario.產品}
- 你對這個產品有基本的認知但不深入

## 你的行為模式（難度設定）
${difficulty}

## 對話規則
1. 全程使用繁體中文
2. 保持角色一致性，不要跳出角色
3. 不要太快被說服 — 至少需要 3-4 輪有效論述才開始鬆口
4. 適時提出真實世界會遇到的反對意見和疑慮
5. 如果業務答非所問或過度誇大，表現出不耐煩或懷疑
6. 如果業務表現很好，可以逐漸展現更多興趣
7. 每次回覆控制在 2-4 句話，像真實對話一樣簡潔
8. 對話開始時，你先簡短自我介紹並說明你的需求或疑問

## 隱藏評估指標（不要告訴業務）
在每次回覆的最後，用隱藏 JSON 記錄：<!--METRICS:{"trust":數字,"interest":數字,"buyIntent":數字,"notes":"簡短記錄"}-->
初始值：trust=20, interest=30, buyIntent=10。根據業務表現動態調整，每輪變化幅度 -10 到 +15。`;
}

function buildReviewPrompt(scenario, conversationLog, metricsHistory) {
  return `你現在是一位資深銷售培訓教練，正在覆盤一位業務人員的角色扮演練習。

## 練習情境
- 業務人員：${scenario.業務}
- 推銷產品：${scenario.產品}
- 客戶產業：${scenario.產業}
- 客戶角色：${scenario.角色}
- 客戶情境：${scenario.情境}
- 難度設定：${scenario.難度}

## 指標變化趨勢
${JSON.stringify(metricsHistory)}

## 完整對話記錄
${conversationLog}

請用以下 JSON 格式回覆（不要包含其他文字）：
{
  "overallScore": 75,
  "grade": "B",
  "summary": "一段話總結整體表現（約 50 字）",
  "strengths": ["做得好的地方1", "做得好的地方2"],
  "improvements": ["可以改進的地方1", "可以改進的地方2"],
  "missedOpportunities": ["錯過的機會點1"],
  "keyMoment": "整場對話中最關鍵的一個轉折點描述",
  "coachAdvice": "教練給的一段具體建議（約 100 字）",
  "metricsAnalysis": {
    "trustTrend": "上升",
    "interestTrend": "持平",
    "buyIntentTrend": "下降",
    "analysis": "指標變化分析（約 50 字）"
  }
}`;
}

async function sendMessage(conversationHistory, systemPrompt) {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: systemPrompt,
        messages: conversationHistory,
      }),
    });
    const data = await response.json();
    if (!data.content) throw new Error(data.error?.message || "API Error");
    const rawText = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const metricsMatch = rawText.match(/<!--METRICS:(.*?)-->/s);
    let metrics = null;
    if (metricsMatch) {
      try { metrics = JSON.parse(metricsMatch[1]); } catch {}
    }
    const displayText = rawText.replace(/<!--METRICS:.*?-->/s, "").trim();
    return { text: displayText, metrics };
  } catch (error) {
    console.error("API Error:", error);
    return { text: "（系統錯誤，請稍後再試）", metrics: null };
  }
}

const HINTS = [
  "試著詢問客戶目前的痛點，而非直接推產品",
  "客戶在意價格，試著強調 ROI 而非功能清單",
  "先建立信任關係，再介紹產品優勢",
  "使用具體的成功案例來增加說服力",
  "政府機關重視合規，可以提一下資安認證",
  "技術人員喜歡具體數據，避免模糊的行銷語言",
  "了解客戶的決策流程，找對關鍵人",
  "提問多於陳述，讓客戶說出他們的需求",
  "針對客戶的產業痛點，量身訂製你的提案",
  "強調廠商穩定性與服務品質，降低換供應商的風險感",
];

// ============================================================
// CIRCULAR GAUGE
// ============================================================
function CircularGauge({ label, value, color }) {
  const radius = 36, stroke = 6;
  const norm = radius - stroke / 2;
  const circ = norm * 2 * Math.PI;
  const offset = circ - (value / 100) * circ;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
      <div style={{ position:"relative", width:radius*2, height:radius*2 }}>
        <svg height={radius*2} width={radius*2} style={{ transform:"rotate(-90deg)" }}>
          <circle stroke="rgba(255,255,255,0.1)" fill="transparent" strokeWidth={stroke} r={norm} cx={radius} cy={radius}/>
          <circle stroke={color} fill="transparent" strokeWidth={stroke}
            strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset}
            strokeLinecap="round" r={norm} cx={radius} cy={radius}
            style={{ transition:"stroke-dashoffset 0.5s ease" }}/>
        </svg>
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
          <span style={{ fontSize:14, fontWeight:700, color:"white" }}>{value}</span>
        </div>
      </div>
      <span style={{ fontSize:11, color:"rgba(255,255,255,0.5)" }}>{label}</span>
    </div>
  );
}

// ============================================================
// SLOT COLUMN
// ============================================================
function SlotColumn({ category, data, onSpinComplete, spinTrigger }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const timerRef = useRef(null);
  const isRed = data.color === "red";
  const glowColor = isRed ? "#ef4444" : "#6366f1";

  const doSpin = useCallback(() => {
    if (spinning) return;
    setSpinning(true);
    let speed = 50;
    const target = Math.floor(Math.random() * data.items.length);
    let elapsed = 0;
    const total = 1800 + Math.random() * 800;
    const tick = () => {
      setSelectedIndex((i) => (i + 1) % data.items.length);
      elapsed += speed;
      if (elapsed > total * 0.6) speed = Math.min(320, speed * 1.09);
      if (elapsed >= total) {
        setSelectedIndex(target);
        setSpinning(false);
        onSpinComplete(category, data.items[target]);
      } else {
        timerRef.current = setTimeout(tick, speed);
      }
    };
    timerRef.current = setTimeout(tick, speed);
  }, [spinning, data, category, onSpinComplete]);

  useEffect(() => { if (spinTrigger > 0) doSpin(); }, [spinTrigger]);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, padding:"16px 12px", display:"flex", flexDirection:"column", alignItems:"center", gap:10, flex:1, minWidth:120 }}>
      <div style={{ fontSize:13, fontWeight:600, color:"rgba(255,255,255,0.5)", letterSpacing:"0.05em" }}>
        {data.icon} {category}
      </div>
      <div style={{ width:"100%", borderRadius:10, background:"rgba(0,0,0,0.3)", padding:"8px 6px", display:"flex", flexDirection:"column", gap:6 }}>
        {data.items.map((item, i) => (
          <div key={i} style={{
            padding:"6px 8px", borderRadius:8, textAlign:"center", fontSize:12,
            fontWeight: i === selectedIndex ? 700 : 400,
            color: i === selectedIndex ? "white" : "rgba(255,255,255,0.28)",
            background: i === selectedIndex ? `rgba(${isRed?"239,68,68":"99,102,241"},0.2)` : "transparent",
            border: i === selectedIndex ? `1px solid ${glowColor}55` : "1px solid transparent",
            boxShadow: i === selectedIndex ? `0 0 10px ${glowColor}35` : "none",
            transition:"all 0.08s ease",
          }}>
            {item}
          </div>
        ))}
      </div>
      <button onClick={doSpin} disabled={spinning} style={{
        width:"100%", padding:"8px 0",
        background: spinning ? "rgba(255,255,255,0.05)" : `linear-gradient(135deg,${glowColor},${isRed?"#dc2626":"#a855f7"})`,
        border:"none", borderRadius:8, color:"white", fontWeight:600, fontSize:13,
        cursor: spinning ? "not-allowed" : "pointer", opacity: spinning ? 0.5 : 1, transition:"all 0.2s",
      }}>
        {spinning ? "轉中..." : "🎲 轉"}
      </button>
    </div>
  );
}

// ============================================================
// SETUP PHASE
// ============================================================
function SetupPhase({ onStart }) {
  const [selections, setSelections] = useState({});
  const [spinTriggers, setSpinTriggers] = useState(() => Object.fromEntries(CATEGORIES.map(c => [c, 0])));

  const allSpun = Object.keys(selections).length === CATEGORIES.length;

  const handleSpinComplete = useCallback((category, value) => {
    setSelections(prev => ({ ...prev, [category]: value }));
  }, []);

  const spinAll = () => {
    setSpinTriggers(prev => Object.fromEntries(CATEGORIES.map(c => [c, prev[c] + 1])));
    setSelections({});
  };

  const reset = () => {
    setSelections({});
    setSpinTriggers(Object.fromEntries(CATEGORIES.map(c => [c, 0])));
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
      <div style={{ textAlign:"center" }}>
        <h1 style={{ fontSize:26, fontWeight:900, background:"linear-gradient(135deg,#6366f1,#a855f7,#06b6d4)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", margin:0 }}>
          🎰 業務角色扮演 AI 練習器
        </h1>
        <p style={{ color:"rgba(255,255,255,0.45)", marginTop:8, fontSize:14 }}>轉動轉盤，組合練習情境，與 AI 客戶對話練習</p>
      </div>

      <div style={{ display:"flex", flexWrap:"wrap", gap:10, justifyContent:"center" }}>
        {CATEGORIES.map(cat => (
          <SlotColumn key={cat} category={cat} data={SLOT_DATA[cat]}
            onSpinComplete={handleSpinComplete} spinTrigger={spinTriggers[cat]} />
        ))}
      </div>

      <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
        <button onClick={spinAll} style={{
          padding:"14px 36px", background:"linear-gradient(135deg,#6366f1,#a855f7)",
          border:"none", borderRadius:12, color:"white", fontWeight:700, fontSize:16,
          cursor:"pointer", boxShadow:"0 0 30px rgba(99,102,241,0.4)",
        }}>🎰 全部轉！</button>
        <button onClick={reset} style={{
          padding:"14px 24px", background:"rgba(255,255,255,0.07)",
          border:"1px solid rgba(255,255,255,0.12)", borderRadius:12,
          color:"rgba(255,255,255,0.7)", fontWeight:600, fontSize:15, cursor:"pointer",
        }}>🔄 重新抽籤</button>
      </div>

      {allSpun && (
        <div style={{ background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.25)", borderRadius:16, padding:20, animation:"fadeInUp 0.4s ease" }}>
          <h3 style={{ color:"rgba(255,255,255,0.75)", margin:"0 0 14px 0", fontSize:15 }}>📋 你的練習情境</h3>
          <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginBottom:20 }}>
            {CATEGORIES.map(cat => (
              <div key={cat} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"8px 14px", fontSize:13 }}>
                <span style={{ color:"rgba(255,255,255,0.4)", marginRight:5 }}>{SLOT_DATA[cat].icon} {cat}</span>
                <span style={{ color: cat === "難度" ? "#fca5a5" : "#a5b4fc", fontWeight:700 }}>{selections[cat]}</span>
              </div>
            ))}
          </div>
          <button onClick={() => onStart(selections)} style={{
            width:"100%", padding:"16px 0",
            background:"linear-gradient(135deg,#6366f1,#a855f7)",
            border:"none", borderRadius:12, color:"white", fontWeight:700, fontSize:17,
            cursor:"pointer", boxShadow:"0 0 30px rgba(99,102,241,0.5)",
          }}>🎯 開始角色扮演練習</button>
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
  const [metricsHistory, setMetricsHistory] = useState([{ trust:20, interest:30, buyIntent:10 }]);
  const [currentMetrics, setCurrentMetrics] = useState({ trust:20, interest:30, buyIntent:10 });
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  const [toast, setToast] = useState(null);
  const chatEndRef = useRef(null);
  const apiMsgs = useRef([{ role:"user", content:"（場景開始：業務人員剛走進你的辦公室，請你先開口說話）" }]);
  const sysPrompt = useRef(buildSystemPrompt(scenario));

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const res = await sendMessage(apiMsgs.current, sysPrompt.current);
      apiMsgs.current.push({ role:"assistant", content: res.text });
      setMessages([{ role:"assistant", content: res.text, metrics: res.metrics }]);
      if (res.metrics) { setCurrentMetrics(res.metrics); setMetricsHistory([res.metrics]); }
      setIsLoading(false);
    })();
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const txt = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role:"user", content: txt }]);
    apiMsgs.current.push({ role:"user", content: txt });
    setIsLoading(true);
    setTurnCount(t => t + 1);
    const res = await sendMessage(apiMsgs.current, sysPrompt.current);
    apiMsgs.current.push({ role:"assistant", content: res.text });
    setMessages(prev => [...prev, { role:"assistant", content: res.text, metrics: res.metrics }]);
    if (res.metrics) { setCurrentMetrics(res.metrics); setMetricsHistory(prev => [...prev, res.metrics]); }
    setIsLoading(false);
  };

  const showHint = () => {
    setToast(HINTS[Math.floor(Math.random() * HINTS.length)]);
    setTimeout(() => setToast(null), 3500);
  };

  const handleEnd = () => {
    const log = messages.map(m => `${m.role === "user" ? "業務" : "客戶"}: ${m.content}`).join("\n\n");
    onEnd(scenario, log, metricsHistory);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100dvh" }}>
      {toast && (
        <div style={{ position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", background:"rgba(99,102,241,0.95)", color:"white", padding:"12px 20px", borderRadius:12, fontSize:14, maxWidth:380, textAlign:"center", zIndex:1000, boxShadow:"0 8px 32px rgba(0,0,0,0.3)", animation:"fadeInDown 0.3s ease" }}>
          💡 {toast}
        </div>
      )}

      {/* Scenario bar */}
      <div style={{ background:"rgba(0,0,0,0.45)", borderBottom:"1px solid rgba(255,255,255,0.07)", padding:"8px 14px", display:"flex", flexWrap:"wrap", gap:6, alignItems:"center", flexShrink:0 }}>
        <span style={{ color:"rgba(255,255,255,0.35)", fontSize:11, marginRight:4 }}>情境</span>
        {CATEGORIES.map(cat => (
          <span key={cat} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:6, padding:"3px 9px", fontSize:11, color: cat === "難度" ? "#fca5a5" : "rgba(255,255,255,0.65)" }}>
            {SLOT_DATA[cat].icon} {scenario[cat]}
          </span>
        ))}
        <span style={{ marginLeft:"auto", color:"rgba(255,255,255,0.35)", fontSize:11 }}>第 {turnCount} 輪</span>
      </div>

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        {/* Chat messages */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ flex:1, overflowY:"auto", padding:14, display:"flex", flexDirection:"column", gap:10 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display:"flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", animation:"fadeInUp 0.25s ease" }}>
                <div style={{
                  maxWidth:"75%", padding:"10px 14px",
                  borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  background: msg.role === "user" ? "linear-gradient(135deg,#6366f1,#a855f7)" : "rgba(255,255,255,0.06)",
                  border: msg.role === "user" ? "none" : "1px solid rgba(255,255,255,0.08)",
                  fontSize:14, lineHeight:1.6, color:"white",
                }}>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginBottom:4 }}>
                    {msg.role === "user" ? `👤 ${scenario.業務}` : "🤖 客戶"}
                  </div>
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div style={{ display:"flex", justifyContent:"flex-start" }}>
                <div style={{ padding:"12px 18px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"18px 18px 18px 4px", display:"flex", gap:5, alignItems:"center" }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width:7, height:7, borderRadius:"50%", background:"#6366f1", animation:`bounce 1.1s ${i*0.18}s infinite` }}/>
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef}/>
          </div>

          {/* Input area */}
          <div style={{ borderTop:"1px solid rgba(255,255,255,0.07)", padding:10, display:"flex", gap:8, flexShrink:0 }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder={`輸入 ${scenario.業務} 的回應...`} disabled={isLoading}
              style={{ flex:1, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, padding:"10px 14px", color:"white", fontSize:14, outline:"none" }}/>
            <button onClick={handleSend} disabled={isLoading || !input.trim()} style={{
              padding:"10px 18px", background:"linear-gradient(135deg,#6366f1,#a855f7)",
              border:"none", borderRadius:10, color:"white", fontWeight:600,
              cursor: isLoading || !input.trim() ? "not-allowed" : "pointer",
              opacity: isLoading || !input.trim() ? 0.45 : 1,
            }}>發送</button>
          </div>
          <div style={{ borderTop:"1px solid rgba(255,255,255,0.05)", padding:"7px 10px", display:"flex", gap:8, flexShrink:0 }}>
            <button onClick={showHint} style={{ padding:"6px 14px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"rgba(255,255,255,0.65)", fontSize:13, cursor:"pointer" }}>💡 提示</button>
            <button onClick={handleEnd} disabled={messages.length < 2} style={{
              padding:"6px 14px",
              background: messages.length >= 2 ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${messages.length >= 2 ? "rgba(239,68,68,0.28)" : "rgba(255,255,255,0.07)"}`,
              borderRadius:8, color: messages.length >= 2 ? "#fca5a5" : "rgba(255,255,255,0.28)",
              fontSize:13, cursor: messages.length >= 2 ? "pointer" : "not-allowed",
            }}>🏁 結束並覆盤</button>
          </div>
        </div>

        {/* Metrics panel */}
        <div style={{ width:118, borderLeft:"1px solid rgba(255,255,255,0.06)", padding:"14px 6px", display:"flex", flexDirection:"column", gap:18, alignItems:"center", flexShrink:0, overflowY:"auto" }}>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.28)", textAlign:"center", letterSpacing:"0.06em" }}>教練視角</div>
          <CircularGauge label="信任度" value={currentMetrics.trust} color="#6366f1"/>
          <CircularGauge label="興趣度" value={currentMetrics.interest} color="#a855f7"/>
          <CircularGauge label="購買意願" value={currentMetrics.buyIntent} color="#06b6d4"/>
          {currentMetrics.notes && (
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.38)", textAlign:"center", lineHeight:1.5, padding:"0 4px" }}>
              {currentMetrics.notes}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// REVIEW PHASE
// ============================================================
function ReviewPhase({ scenario, conversationLog, metricsHistory, onRetry, onNewScenario }) {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const prompt = buildReviewPrompt(scenario, conversationLog, metricsHistory);
      const res = await sendMessage(
        [{ role:"user", content: prompt }],
        "你是一位資深銷售培訓教練。請根據對話記錄，用JSON格式提供詳細的覆盤分析。"
      );
      try {
        const m = res.text.match(/\{[\s\S]*\}/);
        if (m) setReview(JSON.parse(m[0]));
        else setReview({ error: true });
      } catch { setReview({ error: true }); }
      setLoading(false);
    })();
  }, []);

  const chartData = metricsHistory.map((m, i) => ({ turn: i, 信任度: m.trust, 興趣度: m.interest, 購買意願: m.buyIntent }));
  const gradeColors = { S:"#ffd700", A:"#6366f1", B:"#22c55e", C:"#f59e0b", D:"#ef4444" };

  if (loading) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", gap:20 }}>
      <div style={{ width:56, height:56, border:"4px solid rgba(99,102,241,0.2)", borderTop:"4px solid #6366f1", borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
      <p style={{ color:"rgba(255,255,255,0.5)", fontSize:15 }}>AI 教練正在分析你的表現...</p>
    </div>
  );

  if (!review || review.error) return (
    <div style={{ padding:20, textAlign:"center" }}>
      <p style={{ color:"rgba(255,255,255,0.5)" }}>覆盤分析失敗，請重試。</p>
      <button onClick={onRetry} style={{ marginTop:12, padding:"10px 24px", background:"linear-gradient(135deg,#6366f1,#a855f7)", border:"none", borderRadius:8, color:"white", cursor:"pointer", fontWeight:600 }}>🔄 再練一次</button>
    </div>
  );

  const grade = review.grade || "B";
  const score = review.overallScore || 0;
  const gradeColor = gradeColors[grade] || "#6366f1";
  const circ = 2 * Math.PI * 38;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18, paddingBottom:32 }}>
      <div style={{ textAlign:"center" }}>
        <h2 style={{ fontSize:22, fontWeight:800, color:"white", margin:0 }}>🏆 練習覆盤報告</h2>
      </div>

      {/* Score card */}
      <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, padding:22, display:"flex", alignItems:"center", gap:22 }}>
        <div style={{ position:"relative", width:90, height:90, flexShrink:0 }}>
          <svg width={90} height={90} style={{ transform:"rotate(-90deg)" }}>
            <circle cx={45} cy={45} r={38} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={8}/>
            <circle cx={45} cy={45} r={38} fill="none" stroke={gradeColor} strokeWidth={8}
              strokeDasharray={`${circ}`} strokeDashoffset={`${circ*(1-score/100)}`}
              strokeLinecap="round" style={{ transition:"stroke-dashoffset 1s ease" }}/>
          </svg>
          <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontSize:22, fontWeight:800, color:gradeColor }}>{score}</span>
            <span style={{ fontSize:10, color:"rgba(255,255,255,0.4)" }}>/ 100</span>
          </div>
        </div>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
            <span style={{ fontSize:36, fontWeight:900, color:gradeColor }}>{grade}</span>
            <span style={{ fontSize:13, color:"rgba(255,255,255,0.45)" }}>等級</span>
          </div>
          <p style={{ color:"rgba(255,255,255,0.7)", fontSize:14, lineHeight:1.6, margin:0 }}>{review.summary}</p>
        </div>
      </div>

      {/* Metrics chart */}
      {chartData.length > 1 && (
        <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, padding:18 }}>
          <h4 style={{ color:"rgba(255,255,255,0.7)", margin:"0 0 14px 0", fontSize:14 }}>📈 指標趨勢</h4>
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={chartData} margin={{ top:5, right:10, bottom:20, left:0 }}>
              <XAxis dataKey="turn" stroke="rgba(255,255,255,0.15)" tick={{ fontSize:11, fill:"rgba(255,255,255,0.35)" }} label={{ value:"輪次", position:"insideBottom", offset:-10, fill:"rgba(255,255,255,0.3)", fontSize:11 }}/>
              <YAxis domain={[0,100]} stroke="rgba(255,255,255,0.15)" tick={{ fontSize:11, fill:"rgba(255,255,255,0.35)" }}/>
              <Tooltip contentStyle={{ background:"rgba(10,14,26,0.95)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, fontSize:12 }} labelStyle={{ color:"rgba(255,255,255,0.55)" }}/>
              <Line type="monotone" dataKey="信任度" stroke="#6366f1" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="興趣度" stroke="#a855f7" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="購買意願" stroke="#06b6d4" strokeWidth={2} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display:"flex", gap:14, justifyContent:"center", marginTop:6 }}>
            {[["信任度","#6366f1"],["興趣度","#a855f7"],["購買意願","#06b6d4"]].map(([l,c]) => (
              <div key={l} style={{ display:"flex", alignItems:"center", gap:4 }}>
                <div style={{ width:12, height:3, background:c, borderRadius:2 }}/>
                <span style={{ fontSize:11, color:"rgba(255,255,255,0.45)" }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feedback sections */}
      {[
        { icon:"✅", title:"做得好的地方", items: review.strengths, color:"#22c55e" },
        { icon:"⚠️", title:"可以改進的地方", items: review.improvements, color:"#f59e0b" },
        { icon:"💎", title:"錯過的機會點", items: review.missedOpportunities, color:"#a855f7" },
      ].filter(s => s.items?.length).map(({ icon, title, items, color }) => (
        <div key={title} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, padding:18 }}>
          <h4 style={{ color:"rgba(255,255,255,0.78)", margin:"0 0 12px 0", fontSize:14 }}>{icon} {title}</h4>
          {items.map((item, i) => (
            <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", color:"rgba(255,255,255,0.62)", fontSize:14, lineHeight:1.6, marginBottom: i < items.length-1 ? 8 : 0 }}>
              <span style={{ color, flexShrink:0, marginTop:2 }}>•</span>{item}
            </div>
          ))}
        </div>
      ))}

      {review.keyMoment && (
        <div style={{ background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:16, padding:18 }}>
          <h4 style={{ color:"rgba(255,255,255,0.78)", margin:"0 0 8px 0", fontSize:14 }}>🔑 關鍵轉折點</h4>
          <p style={{ color:"rgba(255,255,255,0.58)", fontSize:14, lineHeight:1.6, margin:0 }}>「{review.keyMoment}」</p>
        </div>
      )}

      {review.coachAdvice && (
        <div style={{ background:"rgba(6,182,212,0.07)", border:"1px solid rgba(6,182,212,0.18)", borderRadius:16, padding:18 }}>
          <h4 style={{ color:"rgba(255,255,255,0.78)", margin:"0 0 8px 0", fontSize:14 }}>💡 教練建議</h4>
          <p style={{ color:"rgba(255,255,255,0.58)", fontSize:14, lineHeight:1.6, margin:0 }}>{review.coachAdvice}</p>
        </div>
      )}

      {review.metricsAnalysis && (
        <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, padding:18 }}>
          <h4 style={{ color:"rgba(255,255,255,0.78)", margin:"0 0 12px 0", fontSize:14 }}>📊 指標分析</h4>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:10 }}>
            {[["信任度", review.metricsAnalysis.trustTrend,"#6366f1"],["興趣度",review.metricsAnalysis.interestTrend,"#a855f7"],["購買意願",review.metricsAnalysis.buyIntentTrend,"#06b6d4"]].map(([l,t,c]) => (
              <div key={l} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, padding:"5px 12px", fontSize:12 }}>
                <span style={{ color:"rgba(255,255,255,0.4)", marginRight:4 }}>{l}</span>
                <span style={{ color:c, fontWeight:700 }}>{t === "上升" ? "↑" : t === "下降" ? "↓" : "→"} {t}</span>
              </div>
            ))}
          </div>
          <p style={{ color:"rgba(255,255,255,0.48)", fontSize:13, lineHeight:1.5, margin:0 }}>{review.metricsAnalysis.analysis}</p>
        </div>
      )}

      <div style={{ display:"flex", gap:12 }}>
        <button onClick={onRetry} style={{ flex:1, padding:"14px 0", background:"linear-gradient(135deg,#6366f1,#a855f7)", border:"none", borderRadius:12, color:"white", fontWeight:700, fontSize:15, cursor:"pointer" }}>🔄 再練一次</button>
        <button onClick={onNewScenario} style={{ flex:1, padding:"14px 0", background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:12, color:"rgba(255,255,255,0.7)", fontWeight:600, fontSize:15, cursor:"pointer" }}>🎲 換個情境</button>
      </div>
    </div>
  );
}

// ============================================================
// GLOBAL STYLES
// ============================================================
const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;800;900&display=swap');
  *, *::before, *::after { box-sizing: border-box; font-family: 'Noto Sans TC', sans-serif; }
  body { margin: 0; padding: 0; background: #0a0e1a; }
  input::placeholder { color: rgba(255,255,255,0.3); }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 4px; }
  @keyframes fadeInUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeInDown { from { opacity:0; transform:translate(-50%,-10px); } to { opacity:1; transform:translate(-50%,0); } }
  @keyframes bounce { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); } }
  @keyframes spin { to { transform:rotate(360deg); } }
`;

// ============================================================
// MAIN APP
// ============================================================
export default function SalesRoleplayTrainer() {
  const [phase, setPhase] = useState("setup");
  const [scenario, setScenario] = useState(null);
  const [reviewData, setReviewData] = useState(null);

  const handleStart = (sel) => { setScenario(sel); setPhase("chat"); };
  const handleChatEnd = (scen, log, metrics) => {
    setReviewData({ scenario: scen, conversationLog: log, metricsHistory: metrics });
    setPhase("review");
  };
  const handleRetry = () => { setPhase("chat"); setReviewData(null); };
  const handleNewScenario = () => { setPhase("setup"); setScenario(null); setReviewData(null); };

  return (
    <>
      <style>{globalStyles}</style>
      <div style={{ minHeight:"100vh", background:"#0a0e1a", color:"white" }}>
        {phase === "setup" && (
          <div style={{ maxWidth:920, margin:"0 auto", padding:"24px 14px" }}>
            <SetupPhase onStart={handleStart}/>
          </div>
        )}
        {phase === "chat" && scenario && (
          <ChatPhase scenario={scenario} onEnd={handleChatEnd}/>
        )}
        {phase === "review" && reviewData && (
          <div style={{ maxWidth:700, margin:"0 auto", padding:"24px 14px" }}>
            <ReviewPhase
              scenario={reviewData.scenario}
              conversationLog={reviewData.conversationLog}
              metricsHistory={reviewData.metricsHistory}
              onRetry={handleRetry}
              onNewScenario={handleNewScenario}
            />
          </div>
        )}
      </div>
    </>
  );
}
