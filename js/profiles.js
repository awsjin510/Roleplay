// AI 角色扮演用的角色/產業/雲端/難度設定檔
// 與 data.js 的清單共用同一份鍵值（personas、industries、cloudEnvironments、difficulties）

export const roleProfiles = {
  總機: { techLevel: "無", decisionPower: "無，只負責轉接電話", personality: "禮貌但防衛性高，習慣婉拒陌生來電", concerns: "不想惹麻煩、不想被主管責怪接了推銷電話" },
  行政助理: { techLevel: "低", decisionPower: "無，需要轉達上級", personality: "友善但不懂技術，會問很基本的問題", concerns: "怕麻煩、怕選錯被罵" },
  IT窗口: { techLevel: "中", decisionPower: "建議權，需主管核准", personality: "務實，關注實際操作面", concerns: "維護工作量、與現有系統相容性" },
  MIS工程師: { techLevel: "高", decisionPower: "技術評估權，預算需上報", personality: "會問深入技術問題，對誇大宣傳反感", concerns: "技術規格、SLA、整合難度" },
  IT主管: { techLevel: "中高", decisionPower: "有預算裁量權", personality: "注重 ROI 和管理效率", concerns: "人力配置、總擁有成本、廠商穩定度" },
  "資訊長(CIO)": { techLevel: "策略層", decisionPower: "最終決策者", personality: "時間寶貴，只看重點和策略價值", concerns: "企業策略對齊、風險管控、數位轉型藍圖" },
  採購: { techLevel: "低", decisionPower: "採購流程執行者，需技術部門認可", personality: "關注合約條款、付款方式、價格談判", concerns: "價格、交期、售後保固、合規文件" },
  PM專案經理: { techLevel: "中", decisionPower: "專案預算決策，需IT配合", personality: "以交付時程為優先，重視專案風險", concerns: "導入時間、廠商配合度、不影響現有專案" },
  技術主管: { techLevel: "很高", decisionPower: "技術架構決策者，向CIO報告", personality: "非常注重技術細節，會測試你的技術深度", concerns: "架構設計、擴充性、團隊學習曲線" },
  部門主管: { techLevel: "低", decisionPower: "部門預算決策者", personality: "只關心業務影響，不懂技術細節", concerns: "能否解決業務痛點、不影響業務運作" },
  老闆: { techLevel: "低到中", decisionPower: "公司最高決策者", personality: "時間極度有限，只看大局和數字", concerns: "ROI、競爭優勢、公司形象、不踩雷" },
  營運主管: { techLevel: "中", decisionPower: "營運預算決策者", personality: "關注系統穩定性和效率，怕停機", concerns: "SLA保證、停機損失、維護成本、人員培訓" },
};

export const industryProfiles = {
  遊戲產業: { budget: "兩極化（大廠充裕，獨立工作室有限）", painPoints: "DDoS防護、玩家數據安全、高可用性", culture: "技術導向、重視用戶體驗" },
  電商平台: { budget: "充裕，但ROI要求高", painPoints: "高峰流量、99.99%可用性、支付安全、CDN加速", culture: "數據驅動、重視轉換率和速度" },
  零售品牌: { budget: "中等", painPoints: "POS系統穩定、庫存整合、會員資料保護", culture: "傳統零售思維，數位轉型中" },
  連鎖餐飲: { budget: "有限，成本敏感", painPoints: "POS穩定性、多據點管理、訂單系統", culture: "以穩定和低成本為主，不太懂IT" },
  製造業: { budget: "中高，看產線效益", painPoints: "ERP整合、工廠自動化、供應鏈安全", culture: "保守、重視不影響生產線" },
  傳統工廠: { budget: "有限，極度保守", painPoints: "老舊設備連網、基本資安、最小化停機", culture: "非常保守，對新科技高度懷疑" },
  醫療院所: { budget: "有但採購流程嚴格", painPoints: "病患資料安全、系統不能停機、法規合規", culture: "嚴格合規要求，決策流程漫長" },
  生技公司: { budget: "充裕，R&D投入大", painPoints: "研發資料保護、法規遵循、知識產權安全", culture: "重視資安和合規，謹慎評估廠商" },
  金融機構: { budget: "充裕，但採購嚴格", painPoints: "零停機要求、資安認證、法遵、資料主權", culture: "極度保守，需要完整資安合規文件" },
  保險公司: { budget: "中高", painPoints: "客戶資料保護、理賠系統穩定、資料分析", culture: "重視法遵和資料治理，審查嚴格" },
  行銷公司: { budget: "中等，彈性高", painPoints: "客戶資料安全、快速部署、創意工具整合", culture: "步調快、重視效率和靈活性" },
  廣告代理商: { budget: "中等，但彈性大", painPoints: "客戶資料安全、快速部署、多專案管理", culture: "步調快、重視創意與效率" },
  SI系統整合商: { budget: "看專案而定", painPoints: "需要轉售或搭配方案、技術支援品質", culture: "懂技術、會比較多家方案" },
  政府機關: { budget: "有預算但流程冗長", painPoints: "合規要求、資安等級、採購法規", culture: "保守、重視公文與正式流程" },
  新創公司: { budget: "有限但願意投資關鍵領域", painPoints: "快速擴展、成本效益、未來擴充性", culture: "敏捷、願意嘗試新方案" },
};

export const cloudEnvProfiles = {
  AWS: {
    familiarity: "熟悉 AWS 生態，用過 EC2、S3、RDS",
    concerns: "帳單難以預測、Reserved Instance 規劃複雜、跨區域延遲",
    attitude: "認為 AWS 是業界標準，會質疑你們方案能否完整整合 AWS 服務",
    keywords: "費用優化、Cost Explorer、Savings Plans、多可用區高可用",
  },
  GCP: {
    familiarity: "使用 GCP 做數據分析，BigQuery 是核心工具",
    concerns: "台灣在地支援少、非 Google 原生服務整合麻煩",
    attitude: "技術導向、重視 API 品質和自動化，對行銷話術不感興趣",
    keywords: "BigQuery、Kubernetes、GKE、資料管線、AI/ML 整合",
  },
  Azure: {
    familiarity: "公司已使用 Microsoft 365，Azure AD 是身份核心",
    concerns: "License 費用複雜、與現有 on-prem AD 整合需要評估",
    attitude: "重視合規與企業治理，對資安認證與稽核報告很在意",
    keywords: "Azure AD、混合身份、Compliance、Teams 整合、EA合約",
  },
  本地機房: {
    familiarity: "長期使用自建機房，IT團隊熟悉實體設備管理",
    concerns: "資料不能離開台灣、擔心上雲後失去控制、資安風險",
    attitude: "對雲端持懷疑態度，需要大量說服才考慮轉移，偏好漸進式",
    keywords: "資料主權、合規落地、混合雲橋接、PoC 驗證",
  },
  混合雲: {
    familiarity: "部分工作負載已在雲端，但地端與雲端整合有斷層",
    concerns: "多環境管理複雜、資安政策難以統一、運維成本雙倍",
    attitude: "想統一管理但不確定方向，對能簡化複雜度的方案有興趣",
    keywords: "統一管理介面、網路互通、安全策略一致性、成本可視化",
  },
};

export const difficultyBehaviors = {
  客戶非常忙: "頻繁看手機或時鐘，用一兩句話打發你，暗示沒時間聽長篇說明",
  客戶不耐煩: "語氣急促，對重複或模糊的回答明顯不耐，會嘆氣或打斷",
  客戶一直打斷: "業務還沒說完就插話提問，讓你很難完整說明一個論點",
  客戶只願意給5分鐘: "一開始就說只有5分鐘，之後不斷催促，說時間快到了",
  客戶非常懂技術: "問非常深入的技術問題（頻寬、延遲、加密標準），對誇大或模糊說法立即反駁",
  客戶只談價格: "每次回應都要提到價格或預算限制，不斷要求降價或比價",
  客戶不信任新供應商: "反覆質疑你們公司的規模、經驗、客戶案例，問很多信任驗證的問題",
  客戶認為現在系統很好: "不斷強調現有方案運作正常，質疑為何要改變，需要很強的理由才會動搖",
  客戶一直提競品: "持續拿競品來比較，問你們跟競品廠商比有什麼優勢",
  客戶要求立刻報價: "急著要報價單，不想花時間聽產品介紹，催促快點給數字",
  客戶一直說沒預算: "任何方案都說沒預算，把預算當做拒絕的擋箭牌",
  客戶一直拖延: "對方案感興趣但總是說再考慮、下次再說，給各種理由推遲決定",
  客戶要求先寄資料: "不想繼續對話，用「先寄資料給我看看」來結束會議",
  客戶只願意Email溝通: "說不方便電話，要求所有溝通用Email，避免即時回應",
  客戶認為你們太小: "質疑公司規模、服務能力，擔心合作後廠商倒閉或支援不足",
  客戶只關心穩定性: "對功能、價格都不太在意，只反覆問SLA、停機時間、備援機制",
  客戶很保守: "對任何改變都非常抗拒，需要極大的安全感才願意考慮",
  客戶要求成功案例: "要求提供同產業的成功客戶名單，沒有案例就不願深談",
  客戶認為雲端太貴: "每次提到雲端就說太貴，堅持現有設備還可以用，不想額外支出",
  客戶擔心資安: "對把資料放在外部或雲端非常擔心，問很多關於資安和資料主權的問題",
};

export const HINTS = [
  "試著詢問客戶目前的痛點，而非直接推產品",
  "客戶在意價格，試著強調 ROI 而非功能清單",
  "先建立信任關係，再介紹產品優勢",
  "使用具體的成功案例來增加說服力",
  "政府機關重視合規，可以提一下資安認證",
  "技術人員喜歡具體數據，避免模糊的行銷語言",
  "了解客戶的決策流程，找對關鍵人",
  "提問多於陳述，讓客戶說出他們的需求",
  "強調廠商穩定性與服務品質，降低換供應商的風險感",
];
