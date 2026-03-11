// 琺瑯壁板報價系統 - Google Apps Script
// 作者：OpenClaw
// 版本：1.0

// ==================== 配置區 ====================
const CONFIG = {
  // 銀行匯款資訊
  bank: {
    name: '台新銀行',
    code: '812',
    account: '20301000329255',
    accountName: '' // 戶名，你可以在部署後填入
  },
  
  // 報價參數
  pricing: {
    // 短邊 <= 89cm: 長邊 × 100元/公分
    priceTier1: { maxShortEdge: 89, pricePerCm: 100 },
    // 短邊 89-119cm: 長邊 × 130元/公分  
    priceTier2: { maxShortEdge: 119, pricePerCm: 130 },
    // 超過 119cm: 長邊 × 160元/公分（預設）
    priceTier3: { pricePerCm: 160 },
    
    // 開孔費用
    holePrice: 300,
    
    // 收邊條費用
    edgePricePerCm: 1.5,
    
    // 稅率 (5%)
    taxRate: 0.05
  }
};

// ==================== 主頁面 ====================
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('琺瑯壁板報價系統')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ==================== 報價計算 ====================
function calculateQuote(formData) {
  try {
    let subtotal = 0;
    let areas = [];
    
    // 計算每個區域
    for (let i = 1; i <= 7; i++) {
      const lengthKey = `length${i}`;
      const widthKey = `width${i}`;
      const holesKey = `holes${i}`;
      
      if (formData[lengthKey] && formData[widthKey]) {
        const length = parseFloat(formData[lengthKey]);
        const width = parseFloat(formData[widthKey]);
        const holes = parseInt(formData[holesKey]) || 0;
        
        // 決定單價
        let pricePerCm;
        if (width <= CONFIG.pricing.priceTier1.maxShortEdge) {
          pricePerCm = CONFIG.pricing.priceTier1.pricePerCm;
        } else if (width <= CONFIG.pricing.priceTier2.maxShortEdge) {
          pricePerCm = CONFIG.pricing.priceTier2.pricePerCm;
        } else {
          pricePerCm = CONFIG.pricing.priceTier3.pricePerCm;
        }
        
        // 計算壁板價格
        const panelPrice = length * pricePerCm;
        
        // 計算開孔費用
        const holePrice = holes * CONFIG.pricing.holePrice;
        
        // 計算收邊條（周長）
        const perimeter = (length + width) * 2;
        const edgePrice = perimeter * CONFIG.pricing.edgePricePerCm;
        
        // 區域小計
        const areaTotal = panelPrice + holePrice + edgePrice;
        
        areas.push({
          index: i,
          length: length,
          width: width,
          pricePerCm: pricePerCm,
          panelPrice: panelPrice,
          holes: holes,
          holePrice: holePrice,
          perimeter: perimeter,
          edgePrice: edgePrice,
          total: areaTotal
        });
        
        subtotal += areaTotal;
      }
    }
    
    // 計算稅金（含稅）
    const tax = subtotal * CONFIG.pricing.taxRate;
    const total = subtotal + tax;
    
    return {
      success: true,
      customer: {
        name: formData.name,
        phone: formData.phone,
        address: formData.address
      },
      areas: areas,
      subtotal: Math.round(subtotal),
      tax: Math.round(tax),
      total: Math.round(total),
      bank: CONFIG.bank
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ==================== 儲存客戶資料 ====================
function saveCustomer(quoteData) {
  try {
    // 這裡可以整合 Notion API
    // 先記錄到 Google Sheets 作為備份
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('客戶資料');
    if (!sheet) {
      return { success: false, error: '找不到客戶資料表' };
    }
    
    sheet.appendRow([
      new Date(),
      quoteData.customer.name,
      quoteData.customer.phone,
      quoteData.customer.address,
      quoteData.total
    ]);
    
    return { success: true };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 測試函數 ====================
function testQuote() {
  const testData = {
    name: '測試客戶',
    phone: '0912345678',
    address: '測試地址',
    length1: 100,
    width1: 80,
    holes1: 2,
    length2: 150,
    width2: 100,
    holes2: 1
  };
  
  return calculateQuote(testData);
}
