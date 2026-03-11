# 琺瑯壁板報價系統 - 部署說明

## 📦 檔案結構

```
enamel-quote-system/
├── Code.gs          # 後端邏輯（報價計算、儲存）
├── index.html       # 主頁面表單
├── css.html         # 樣式
├── javascript.html  # 前端腳本
└── README.md        # 本說明檔
```

## 🚀 部署步驟

### 1. 建立 Google Apps Script 專案

1. 前往 [Google Apps Script](https://script.google.com/)
2. 點擊「新增專案」
3. 會自動建立 `Code.gs` 和 `appsscript.json`

### 2. 複製代碼

依序建立以下檔案並貼上對應內容：

| 檔案名稱 | 對應內容 |
|---------|---------|
| `Code.gs` | 本資料夾中的 Code.gs |
| `index.html` | index.html |
| `css.html` | css.html |
| `javascript.html` | javascript.html |

**建立方式：**
- 在 Apps Script 編輯器中，點擊「檔案」→ 「新增」→ 「HTML 檔案」
- 輸入檔名（不要包含副檔名）
- 貼上對應內容

### 3. 部署

1. 點擊右上角的「部署」→ 「新增部署」
2. 選擇類型：「網頁應用程式」
3. 設定：
   - **說明**：琺瑯壁板報價系統 v1.0
   - **執行身份**：本人
   - **Anyone**（開放所有人存取）
4. 點擊「部署」
5. 複製網址即可分享給客戶

### 4. (可選) 建立 Google Sheets 備份

1. 建立一個 Google 試算表
2. 在第一列輸入標題：日期、姓名、電話、地址、金額
3. 在 Code.gs 中找到 `saveCustomer` 函數
4. 將 `SpreadsheetApp.getActiveSpreadsheet()` 改為你的試算表 ID

## 📝 設定銀行資訊

在 `Code.gs` 中找到 `CONFIG` 區塊：

```javascript
const CONFIG = {
  bank: {
    name: '台新銀行',
    code: '812',
    account: '20301000329255',
    accountName: '你的戶名'  // 填入戶名
  },
  // ...
};
```

## 🔧 自訂選項

### 價格調整

在 `Code.gs` 的 `pricing` 物件中修改：

```javascript
pricing: {
  priceTier1: { maxShortEdge: 89, pricePerCm: 100 },  // 短邊≤89cm
  priceTier2: { maxShortEdge: 119, pricePerCm: 130 }, // 短邊89-119cm
  priceTier3: { pricePerCm: 160 },                    // 短邊>119cm
  holePrice: 300,       // 每個開孔
  edgePricePerCm: 1.5,  // 收邊條每公分
  taxRate: 0.05         // 稅率 5%
}
```

## 📱 使用流程

1. 客戶打開網址
2. 填寫姓名、電話、地址
3. 新增安裝區域（最多7區）
4. 點擊「預覽報價」
5. 確認報價單無誤後點擊「確認報價」
6. 系統自動儲存客戶資料
7. 顯示匯款資訊

## 🔗 Notion 整合（如需要）

目前系統會儲存到 Google Sheets。如需整合 Notion：

1. 在 Notion 建立 Integration：https://www.notion.so/my-integrations
2. 取得 API Token
3. 在 Code.gs 中新增 Notion API 呼叫
4. 將客戶資料寫入 Notion 客戶資料表

需要我幫你加 Notion 整合嗎？
