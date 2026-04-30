require("dotenv").config();

const express = require("express");
const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const cheerio = require("cheerio");
const cors = require("cors");
const Redis = require("ioredis");

puppeteerExtra.use(StealthPlugin());

// ── Redis cache ────────────────────────────────────────────────
const CACHE_TTL = 60 * 60 * (parseInt(process.env.REDIS_CACHE_TTL_HOURS, 10) || 24); // saat cinsinden, varsayılan 24
// Null fiyat için özel sentinel — Redis'te null string saklanamaz
const CACHE_NULL = "__null__";

const redis = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT  || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: true,      // başlangıçta bağlantı denemez; ilk işlemde bağlanır
    enableOfflineQueue: false,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
});

redis.on("error", (err) => console.warn("[Redis] Hata:", err.message));

async function cacheGet(key) {
    try { return await redis.get(key); }
    catch (_) { return null; }
}

async function cacheSet(key, value) {
    try { await redis.setex(key, CACHE_TTL, value ?? CACHE_NULL); }
    catch (_) { /* Redis yoksa sessizce devam et */ }
}
// ──────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

const MAX_CONCURRENT_MARKETS = 8;
const PAGE_TIMEOUT = 8000;
const WAIT_BETWEEN_MS = 0;

const TIMEOUT_CONFIG = {
    default: 8000,
    carrefoursa: 12000,
};

// search-stream-fast'ta istekler arasında bekleme (ms). Bot tespitini önler.
const WAIT_BETWEEN_REQUESTS_MS = {
    carrefoursa: 1500,
};

const webList = {
    trendyol: "https://www.trendyol.com/sr?q=",
    hepsiburada: "https://www.hepsiburada.com/ara?q=",
    pazarama: "https://www.pazarama.com/arama?q=",
    carrefoursa: "https://www.carrefoursa.com/search/?text=",
    mopas: "https://mopas.com.tr/search/?text=",
    aftaMarket: "https://www.aftamarket.com.tr/arama?q=",
    sokMarket: "https://www.sokmarket.com.tr/arama?q=",
};

const parsers = {
    trendyol: ($) => {
        if ($(".did-you-mean .information-banner .information-text").text().includes("bulunamadı")) {
            return false;
        }
        else {
            return $(".product-card").get().map((el) => {
                const productPrice = $(el).find(".single-price .price-section").text().trim() || "";
                return productPrice;
            });
        }
    },

    hepsiburada: ($) => {
        if ($(".SearchResultSummary")) {
            return $(".ProductList ul li").get().map((el, i) => {
                const productPrice = $(el).find(`div[data-test-id="final-price-${i+1}"]`).text().trim() || "";
                return productPrice;
            });
        }
        else {
            return false;
        }
    },

    pazarama: ($) => {
        if ($(".product-card").get().length > 1) {
            return false;
        }
        return $(".product-card").get().map((el) => {
            const productPrice = $(el).find(".product-card__price .leading-tight").text().trim() || "";
            return productPrice;
        });
    },

    carrefoursa: ($) => {
        if ($(".product-listing .product-listing-item .hover-box").get().length > 1) {
            return false;
        }
        return $(".product-listing .product-listing-item .hover-box").get().map((el) => {
            const priceText = $(el)
                .find(".item-price")
                .clone()
                .children()
                .remove()
                .end()
                .text()
                .trim();

            const formatted = priceText + $(el).find(".item-price .formatted-price").text().replace(/\D/g, "");
            return formatted;
        });
    },

    mopas: ($) => {
        if ($(".product-list-grid .card").get().length > 1) {
            return false;
        }
        return $(".product-list-grid .card").get().map((el) => {
            const productPrice = $(el).find(".sale-price").text().trim() || "";
            return productPrice;
        });
    },

    aftaMarket: ($) => {
        if ($(".catalogWrapper .productItem").get().length > 1) {
            return false;
        }
        return $(".catalogWrapper .productItem").get().map((el) => {
            const productPrice = $(el).find(".productPrice .currentPrice").text().trim() || "";
            return productPrice;
        });
    },

    sokMarket: ($) => {
        const emptyResultText = $('p:contains("İlgili Sonuç Bulunamadı")').length > 0;
        const noProductsText = $('p:contains("0 adet ürün listelendi")').length > 0;
        if (emptyResultText || noProductsText) {
            return false;
        }

        const productCards = $(".CProductCard-module_productCardWrapper__okAmT, [class*='productCardWrapper']");
        if (productCards.length === 0) {
            return false;
        }

        return productCards.get().map((el) => {
            const productPrice = $(el).find("[class*='CPriceBox-module_price'], .CPriceBox-module_price__bYk-c").first().text().trim() || "";
            return productPrice;
        });
    },
};

function normalizePrice(price) {
    if (!price) return null;

    const parsed = parseFloat(
        price
            .replace(/[^0-9.,]/g, "")
            .replace(/\./g, "")
            .replace(",", ".")
    );

    return isNaN(parsed) ? null : parsed.toFixed(2);
}

function extractFirstPrice(parsed) {
    if (!parsed || parsed === false) return null;
    if (!parsed.length) return null;
    return normalizePrice(parsed[0]);
}

async function scrapeSinglePage(page, market, baseUrl, barcode) {
    const isDebug = market === 'carrefoursa';
    try {
        await page.setUserAgent(USER_AGENT);
        const timeout = TIMEOUT_CONFIG[market] || TIMEOUT_CONFIG.default;
        const targetUrl = baseUrl + barcode;

        const response = await page.goto(targetUrl, {
            waitUntil: "domcontentloaded",
            timeout: timeout
        });

        const html = await page.content();
        const $ = cheerio.load(html);

        const parsed = parsers[market]($);

        return extractFirstPrice(parsed);

    } catch (err) {
        if (isDebug) console.error(`[CF] ✖ ${barcode} — HATA: ${err.message}`);
        else console.warn(`${market} hata: ${err.message}`);
        return null;
    }
}

async function fetchBarcodePricesParallel(barcode, browser) {
    const prices = {};
    const notFoundMarkets = [];
    const entries = Object.entries(webList);

    await Promise.all(
        entries.map(async ([market, url]) => {
            try {
                const page = await browser.newPage();
                
                await page.setRequestInterception(true);
                page.on('request', (req) => {
                    const resourceType = req.resourceType();
                    if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                        req.abort();
                    } else {
                        req.continue();
                    }
                });

                const price = await scrapeSinglePage(page, market, url, barcode);
                await page.close();

                if (price) {
                    prices[market] = price;
                } else {
                    notFoundMarkets.push(market);
                }
            } catch (err) {
                console.error(`${market} hatası:`, err.message);
                notFoundMarkets.push(market);
            }
        })
    );

    return { barcode, prices, notFoundMarkets };
}

app.post("/api/search-stream", async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const { barcodes } = req.body;

        if (!barcodes || !Array.isArray(barcodes) || barcodes.length === 0) {
            res.write(`data: ${JSON.stringify({ 
                type: 'error',
                status: 'error',
                message: "Geçerli barkod listesi gönderilmedi" 
            })}\n\n`);
            res.end();
            return;
        }

        const browser = await puppeteerExtra.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        for (let i = 0; i < barcodes.length; i++) {
            const barcode = barcodes[i];
            
            res.write(`data: ${JSON.stringify({ 
                type: 'progress', 
                current: i + 1, 
                total: barcodes.length,
                barcode: barcode 
            })}\n\n`);

            const result = await fetchBarcodePricesParallel(barcode, browser);
            
            res.write(`data: ${JSON.stringify({ 
                type: 'result', 
                data: result,
                webList: webList    // ← her result'ta gönder (ön taraf ilkinde alır, sonrakiler zaten aynı)
            })}\n\n`);
        }

        await browser.close();

        const foundCount = /* yerel sayım */ (() => {
            // browser kapandıktan sonra elimizde result yok, complete'e sadece meta gönderiyoruz
            return null;
        })();

        res.write(`data: ${JSON.stringify({ 
            type: 'complete',
            status: 'success',
            message: `${barcodes.length} barkodun taraması tamamlandı.`,
            totalBarcodes: barcodes.length,
            webList: webList    // ← complete'te de gönder (modal henüz açılmamışsa buradan alır)
        })}\n\n`);
        res.end();

    } catch (error) {
        console.error("Hata:", error);
        res.write(`data: ${JSON.stringify({ 
            type: 'error',
            status: 'error',
            message: "Sunucu hatası oluştu, lütfen tekrar deneyin."
        })}\n\n`);
        res.end();
    }
});

app.post("/api/search-stream-fast", async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const { barcodes } = req.body;

        if (!barcodes || !Array.isArray(barcodes) || barcodes.length === 0) {
            res.write(`data: ${JSON.stringify({
                type: 'error',
                message: "Geçerli barkod listesi gönderilmedi"
            })}\n\n`);
            res.end();
            return;
        }

        const browser = await puppeteerExtra.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const entries = Object.entries(webList);

        // Her platform için bir tab açılır, o tab tüm barkodları sırasıyla işler.
        // Tüm platformlar birbirinden bağımsız olarak paralel çalışır.
        await Promise.all(
            entries.map(async ([market, baseUrl]) => {
                const createPage = async () => {
                    const p = await browser.newPage();
                    await p.setRequestInterception(true);
                    p.on('request', (req) => {
                        if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                            req.abort();
                        } else {
                            req.continue();
                        }
                    });
                    return p;
                };

                let page = await createPage();
                let consecutiveFailures = 0;
                const waitMs = WAIT_BETWEEN_REQUESTS_MS[market] || 0;

                for (const barcode of barcodes) {
                    const cacheKey = `price:${barcode}:${market}`;

                    // 1. Cache kontrolü
                    const cached = await cacheGet(cacheKey);
                    if (cached !== null) {
                        // Cache hit — scrape atla, anında stream et
                        const price = cached === CACHE_NULL ? null : cached;
                        res.write(`data: ${JSON.stringify({
                            type: 'result',
                            barcode,
                            platform: market,
                            price,
                            fromCache: true
                        })}\n\n`);
                        continue;
                    }

                    // 2. Cache miss — art arda 2+ hata varsa tab'ı yenile
                    if (consecutiveFailures >= 2) {
                        await page.close().catch(() => {});
                        page = await createPage();
                        consecutiveFailures = 0;
                    }

                    if (waitMs > 0) {
                        await new Promise(resolve => setTimeout(resolve, waitMs));
                    }

                    const price = await scrapeSinglePage(page, market, baseUrl, barcode);
                    price ? consecutiveFailures = 0 : consecutiveFailures++;

                    // 3. Sonucu cache'e yaz (null da dahil — "bulunamadı" bilgisi de geçerli veri)
                    await cacheSet(cacheKey, price);

                    res.write(`data: ${JSON.stringify({
                        type: 'result',
                        barcode,
                        platform: market,
                        price: price || null
                    })}\n\n`);
                }

                await page.close().catch(() => {});
            })
        );

        await browser.close();

        res.write(`data: ${JSON.stringify({
            type: 'complete',
            message: `${barcodes.length} barkodun taraması tamamlandı.`,
            totalBarcodes: barcodes.length,
            totalPlatforms: entries.length
        })}\n\n`);
        res.end();

    } catch (error) {
        console.error("Hata:", error);
        res.write(`data: ${JSON.stringify({
            type: 'error',
            message: "Sunucu hatası oluştu, lütfen tekrar deneyin."
        })}\n\n`);
        res.end();
    }
});

app.post("/api/search", async (req, res) => {
    try {
        const { barcodes } = req.body;

        if (!barcodes || !Array.isArray(barcodes) || barcodes.length === 0) {
            return res.status(400).json({ 
                status: "error",
                message: "Geçerli barkod listesi gönderilmedi" 
            });
        }

        const browser = await puppeteerExtra.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const results = [];
        for (const barcode of barcodes) {
            console.log(`Aranıyor: ${barcode}`);
            const result = await fetchBarcodePricesParallel(barcode, browser);
            results.push(result);
        }

        await browser.close();

        const foundCount = results.filter(r => Object.keys(r.prices).length > 0).length;

        res.json({
            status: "success",
            message: `${barcodes.length} barkoddan ${foundCount} tanesi en az bir markette bulundu.`,
            totalBarcodes: barcodes.length,
            foundCount: foundCount,
            webList: webList,   // ön tarafa URL'leri gönder
            results: results,
        });

    } catch (error) {
        console.error("Hata:", error);
        res.status(500).json({ 
            status: "error",
            message: "Sunucu hatası oluştu, lütfen tekrar deneyin." 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server çalışıyor: http://localhost:${PORT}`);
});