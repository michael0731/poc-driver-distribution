const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const BASE_DIR = __dirname.endsWith('tools') ? path.join(__dirname, '..') : __dirname;
const INPUT_DIR = path.join(BASE_DIR, 'excel_imports');
const OUTPUT_DIR = path.join(BASE_DIR, 'data');
const OUTPUT_JSON = path.join(BASE_DIR, 'data', 'history_db.json');

console.log('🚀 開始執行公路局 Excel ETL（含期別清洗與去重保護）...\n');

if (!fs.existsSync(INPUT_DIR)) {
    fs.mkdirSync(INPUT_DIR, { recursive: true });
    console.log(`📁 請將下載的 Excel 檔案放入: ${INPUT_DIR}`);
    process.exit(0);
}

const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
if (files.length === 0) process.exit(0);

const processedKeysSet = new Set();
const periodGroups = {};
let duplicateSkippedCount = 0;

files.forEach(file => {
    const filePath = path.join(INPUT_DIR, file);
    console.log(`📄 正在解析報表: ${file}...`);

    try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        if (!rawRows || rawRows.length < 5) return;

        const { columnMetaMap, dataStartRow, periodColIdx } = parseMergedHeaders(rawRows);
        if (Object.keys(columnMetaMap).length === 0) return;

        let validCount = 0;
        let fallbackFileNamePeriod = extractPeriodFromFileName(file);

        for (let r = dataStartRow; r < rawRows.length; r++) {
            const row = rawRows[r];
            if (!row || row.length === 0) continue;

            const rawPeriod = periodColIdx !== -1 ? String(row[periodColIdx] || '').trim() : fallbackFileNamePeriod;
            const periodKey = normalizePeriod(rawPeriod || fallbackFileNamePeriod);

            // 過濾條件：必須為有效的民國年份期別 (如: 104年底, 114年底, 115年07月)
            if (!isValidPeriod(periodKey)) continue;

            if (!periodGroups[periodKey]) {
                periodGroups[periodKey] = {
                    period: periodKey,
                    totalNational: 0,
                    categories: { taxi: 0, heavyTruck: 0, bus: 0, trailer: 0 },
                    regions: {}
                };
            }

            const pData = periodGroups[periodKey];

            Object.entries(columnMetaMap).forEach(([colIdxStr, meta]) => {
                const colIdx = Number(colIdxStr);
                const val = normalizeCount(row[colIdx]);
                if (val <= 0) return;

                const regionName = meta.region;
                const catKey = meta.category;

                const uniqueKey = `${periodKey}_${regionName}_${catKey}`;
                if (processedKeysSet.has(uniqueKey)) {
                    duplicateSkippedCount++;
                    return;
                }

                processedKeysSet.add(uniqueKey);

                if (!pData.regions[regionName]) {
                    pData.regions[regionName] = { taxi: 0, heavyTruck: 0, bus: 0, trailer: 0, total: 0 };
                }

                const reg = pData.regions[regionName];
                reg[catKey] = val;
                reg.total += val;
                pData.categories[catKey] += val;
                pData.totalNational += val;
                validCount++;
            });
        }

        console.log(`  └─ 成功提取 ${validCount} 筆數據點`);

    } catch (err) {
        console.error(`❌ 解析檔案 ${file} 時發生錯誤:`, err.message);
    }
});

const sortedPeriods = Object.keys(periodGroups).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, '')) || 0;
    const numB = parseInt(b.replace(/\D/g, '')) || 0;
    return numA - numB;
});

if (sortedPeriods.length === 0) {
    console.log('\n❌ 未能成功提取職業數據');
    process.exit(1);
}

const historyDb = {
    importedAt: new Date().toISOString(),
    totalPeriods: sortedPeriods.length,
    periods: sortedPeriods,
    series: sortedPeriods.map(p => periodGroups[p])
};

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_JSON, JSON.stringify(historyDb, null, 2), 'utf-8');

console.log(`\n🎉 ETL 數據清洗完成！共完成 ${sortedPeriods.length} 個有效歷史期別歸一。`);
console.log(`📦 正規化資料庫已寫入: ${OUTPUT_JSON}`);

// -------------------------------------------------------------
// 驗證期別是否有效
// -------------------------------------------------------------
function isValidPeriod(p) {
    if (!p || p === '未知期別') return false;
    // 過濾頁尾文字如 "2110004", "說明：", "註："
    if (p.includes('21100') || p.includes('說明') || p.includes('註')) return false;
    // 必須包含 100~120 的民國年份
    return /(0\d{2}|1\d{2})年/.test(p) || /(0\d{2}|1\d{2})底/.test(p);
}

function parseMergedHeaders(rows) {
    const columnMetaMap = {};
    let categoryRowIdx = -1;
    let regionRowIdx = -1;
    let periodColIdx = -1;

    for (let r = 0; r < Math.min(rows.length, 10); r++) {
        const rowStr = rows[r].map(c => String(c)).join(' ');
        if (rowStr.includes('職業') || rowStr.includes('汽車職業')) {
            categoryRowIdx = r;
            regionRowIdx = r + 1;
            break;
        }
    }

    if (categoryRowIdx === -1) return { columnMetaMap: {}, dataStartRow: 0, periodColIdx: -1 };

    const catRow = rows[categoryRowIdx] || [];
    const regRow = rows[regionRowIdx] || [];
    let currentCategory = '';

    for (let colIdx = 0; colIdx < Math.max(catRow.length, regRow.length); colIdx++) {
        const catCell = String(catRow[colIdx] || '').trim();
        const regCell = String(regRow[colIdx] || '').trim();

        if (catCell.includes('職業') || catCell.includes('汽車職業')) {
            if (catCell.includes('小型') || catCell.includes('小型車')) currentCategory = 'taxi';
            else if (catCell.includes('大貨') || catCell.includes('大貨車')) currentCategory = 'heavyTruck';
            else if (catCell.includes('大客') || catCell.includes('大客車')) currentCategory = 'bus';
            else if (catCell.includes('聯結') || catCell.includes('聯結車')) currentCategory = 'trailer';
        }

        if (periodColIdx === -1 && (regCell.includes('統計期') || regCell.includes('年月') || regCell.includes('期間') || catCell.includes('統計期'))) {
            periodColIdx = colIdx;
        }

        const regionName = normalizeRegion(regCell);

        if (currentCategory && regionName && !regionName.includes('計') && !regionName.includes('統計')) {
            columnMetaMap[colIdx] = { category: currentCategory, region: regionName };
        }
    }

    if (periodColIdx === -1) periodColIdx = 0;
    return { columnMetaMap, dataStartRow: regionRowIdx + 1, periodColIdx };
}

function normalizeRegion(str) {
    if (!str) return '';
    let name = str.replace(/[\s\r\n]+/g, '').replace('臺', '台').replace(/^(臺灣省|台灣省)/, '');
    const validRegions = ['新北市', '台北市', '台中市', '高雄市', '桃園市', '台南市', '彰化縣', '屏東縣', '雲林縣', '苗栗縣', '新竹縣', '嘉義縣', '南投縣', '宜蘭縣', '基隆市', '新竹市', '花蓮縣', '嘉義市', '台東縣', '澎湖縣', '金門縣', '連江縣'];
    const match = validRegions.find(r => name.includes(r) || r.includes(name));
    return match || '';
}

function normalizeCount(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const cleaned = String(val).replace(/,/g, '').replace(/\s+/g, '').trim();
    return Number(cleaned) || 0;
}

function normalizePeriod(str) {
    if (!str) return '';
    str = String(str).trim();
    if (str.includes('說明') || str.includes('註') || str.length > 20) return '';

    const match = str.match(/(\d{3})\D*(\d{1,2})/);
    if (match) {
        const y = match[1];
        const m = match[2].padStart(2, '0');
        return `${y}年${m}月`;
    }

    const yearMatch = str.match(/(\d{3})\D*(底|年)/);
    if (yearMatch) {
        return `${yearMatch[1]}年底`;
    }

    return str;
}

function extractPeriodFromFileName(fileName) {
    const match = fileName.match(/(\d{5})/);
    return match ? match[1] : '';
}