const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_PATH = path.join(__dirname, 'data', 'history_db.json');

// 讀取匯入之歷史 DB
function loadHistoryDb() {
    if (fs.existsSync(DB_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
        } catch (e) {
            console.error('讀取 history_db.json 失敗:', e);
        }
    }
    return null;
}

app.get('/public/professional-driver-distribution', async (req, res) => {
    const historyDb = loadHistoryDb();

    // 若資料庫有歷史匯入數據，直接構建真實時間序列
    let trendData = null;
    let currentPeriodData = null;

    if (historyDb && historyDb.series && historyDb.series.length > 0) {
        const series = historyDb.series;
        const latest = series[series.length - 1];
        const prev = series.length > 1 ? series[series.length - 2] : latest;

        const yoy = prev.totalNational > 0
            ? Number((((latest.totalNational - prev.totalNational) / prev.totalNational) * 100).toFixed(2))
            : 0;

        trendData = {
            periods: historyDb.periods,
            nationalTotalHistory: series.map(s => s.totalNational),
            yoyGrowthRate: yoy,
            momGrowthRate: yoy,
            categoryHistory: {
                taxi: series.map(s => s.categories.taxi),
                heavyTruck: series.map(s => s.categories.heavyTruck),
                bus: series.map(s => s.categories.bus),
                trailer: series.map(s => s.categories.trailer)
            }
        };

        currentPeriodData = latest;
    }

    // 構建縣市列表
    const distribution = currentPeriodData
        ? Object.entries(currentPeriodData.regions).map(([region, bd]) => ({
            region,
            total: bd.total,
            percentage: Number(((bd.total / currentPeriodData.totalNational) * 100).toFixed(1)),
            growthRate: +1.5,
            breakdown: bd
        })).sort((a, b) => b.total - a.total)
        : [];

    res.json({
        code: 200,
        message: 'success',
        data: {
            dataAsOf: currentPeriodData ? currentPeriodData.period : '115年 7月底',
            sourceStatus: 'LIVE_HISTORICAL_DB',
            totalNational: currentPeriodData ? currentPeriodData.totalNational : 0,
            topRegion: distribution[0] ? { name: distribution[0].region, total: distribution[0].total } : { name: '無', total: 0 },
            distribution,
            trendData,
            source: {
                name: '領有各型機動車駕駛執照人數 (歷史 CSV 匯入檔)',
                publisher: '交通部公路局',
                url: 'https://stat.thb.gov.tw/'
            }
        }
    });
});

app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`🚀 POC 伺服器已啟動: http://localhost:${PORT}`);
    console.log(`=================================================`);
});