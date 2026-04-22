const express = require("express");
const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const cors = require("cors");

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
    carrefoursa: 10000,
};

const webList = {
    trendyol: "https://www.trendyol.com/sr?q=",
    hepsiburada: "https://www.hepsiburada.com/ara?q=",
    pazarama: "https://www.pazarama.com/arama?q=",
    carrefoursa: "https://www.carrefoursa.com/search/?text=",
    mopas: "https://mopas.com.tr/search/?text=",
    onurMarket: "https://www.onurmarket.com/Arama?1&kelime=",
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

    onurMarket: ($) => {
        if ($("#ProductPageProductList .productItem").get().length > 1) {
            return false;
        }
        return $("#ProductPageProductList .productItem").get().map((el) => {
            const productPrice = $(el).find(".productPrice .discountPriceSpan").text().trim() || "";
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
    try {
        await page.setUserAgent(USER_AGENT);
        const timeout = TIMEOUT_CONFIG[market] || TIMEOUT_CONFIG.default;
        
        await page.goto(baseUrl + barcode, {
            waitUntil: "domcontentloaded",
            timeout: timeout
        });

        const html = await page.content();
        const $ = cheerio.load(html);

        const parsed = parsers[market]($);
        return extractFirstPrice(parsed);

    } catch (err) {
        console.warn(`${market} hata: ${err.message}`);
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

        const browser = await puppeteer.launch({ 
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

app.post("/api/search", async (req, res) => {
    try {
        const { barcodes } = req.body;

        if (!barcodes || !Array.isArray(barcodes) || barcodes.length === 0) {
            return res.status(400).json({ 
                status: "error",
                message: "Geçerli barkod listesi gönderilmedi" 
            });
        }

        const browser = await puppeteer.launch({ 
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