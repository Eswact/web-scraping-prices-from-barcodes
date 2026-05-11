const API_URL = 'http://localhost:3000/api/search-stream-fast';

const SCRAPED_PLATFORMS = [
    'trendyol',
    'hepsiburada',
    'pazarama',
    'carrefoursa',
    'mopas',
    'aftaMarket',
    'sokMarket'
];

const marketConfig = {
    trendyol: {
        logo: 'images/trendyol.png',
        url: 'https://www.trendyol.com/sr?q=',
        name: 'Trendyol'
    },
    hepsiburada: {
        logo: 'images/hepsiburada.png',
        url: 'https://www.hepsiburada.com/ara?q=',
        name: 'Hepsiburada'
    },
    pazarama: {
        logo: 'images/pazarama.png',
        url: 'https://www.pazarama.com/arama?q=',
        name: 'Pazarama'
    },
    carrefoursa: {
        logo: 'images/carrefour.png',
        url: 'https://www.carrefoursa.com/search/?text=',
        name: 'CarrefourSA'
    },
    mopas: {
        logo: 'images/mopas.png',
        url: 'https://mopas.com.tr/search/?text=',
        name: 'Mopaş'
    },
    aftaMarket: {
        logo: 'images/afta.png',
        url: 'https://www.aftamarket.com.tr/arama?q=',
        name: 'Afta Market'
    },
    sokMarket: {
        logo: 'images/sok.png',
        url: 'https://www.sokmarket.com.tr/arama?q=',
        name: 'Şok Market'
    }
};

const SCRAPED_TOTAL = SCRAPED_PLATFORMS.length;

function parseBarcodes(text) {
    return text
        .split(/[\n,]/)
        .map(b => b.trim())
        .filter(b => b.length > 0);
}

function cellId(barcode, platform) {
    return `price-cell-${barcode}-${platform}`;
}

function loadingCell(barcode, market) {
    const cfg = marketConfig[market];
    return `
        <div class="price-cell price-cell--loading" id="${cellId(barcode, market)}">
            <div class="price-cell-market">
                <img src="${cfg.logo}" alt="${cfg.name}" class="price-cell-logo">
                <span class="price-cell-market-name">${cfg.name}</span>
            </div>
            <div class="price-cell-loader skeleton-line skeleton-line--short"></div>
        </div>
    `;
}

function ensureSearchingCard(barcode, container) {
    if (document.getElementById(`result-card-${barcode}`)) return;

    const cells = SCRAPED_PLATFORMS.map(m => loadingCell(barcode, m)).join('');
    container.insertAdjacentHTML('beforeend', `
        <div class="result-card result-card--searching" id="result-card-${barcode}" data-barcode="${barcode}">
            <div class="result-card-header">
                <div class="result-card-left">
                    <div class="result-status-icon result-status-icon--searching">
                        <span class="material-symbols-outlined">bolt</span>
                    </div>
                    <span class="result-barcode-number">${barcode}</span>
                    <span class="result-badge badge-searching">0 bulundu · ${SCRAPED_TOTAL} aranıyor...</span>
                </div>
            </div>
            <div class="result-prices-grid">${cells}</div>
        </div>
    `);
}

function badgeDuringSearch(barcode, state) {
    let found = 0;
    SCRAPED_PLATFORMS.forEach(p => {
        if (state.prices[p]) found++;
    });
    const pending = SCRAPED_TOTAL - state.responded;
    const badge = document.querySelector(`#result-card-${barcode} .result-badge`);
    if (badge) badge.textContent = `${found} bulundu · ${pending} bekleniyor...`;
}

function refreshBestPrices(barcode, prices) {
    const entries = SCRAPED_PLATFORMS.filter(p => prices[p]).map(p => ({
        platform: p,
        value: parseFloat(prices[p])
    }));
    if (entries.length === 0) return;
    const best = Math.min(...entries.map(e => e.value));
    SCRAPED_PLATFORMS.forEach(p => {
        const el = document.getElementById(cellId(barcode, p));
        if (!el || !prices[p]) return;
        const isBest = parseFloat(prices[p]) === best;
        el.classList.toggle('price-cell--best', isBest);
        const lbl = el.querySelector('.price-cell-best-label');
        if (lbl) lbl.remove();
        if (isBest && !el.querySelector('.price-cell-best-label')) {
            const div = document.createElement('div');
            div.className = 'price-cell-best-label';
            div.textContent = 'En Ucuz';
            el.appendChild(div);
        }
    });
}

function patchPlatformCell(barcode, platform, price) {
    const cfg = marketConfig[platform];
    if (!cfg) return;

    let el = document.getElementById(cellId(barcode, platform));
    if (!el) return;

    const productUrl = cfg.url + encodeURIComponent(barcode);

    if (price != null) {
        el.outerHTML = `
            <a href="${productUrl}" target="_blank" rel="noopener" class="price-cell" id="${cellId(barcode, platform)}">
                <svg class="price-cell-open-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor"><path d="M384 64C366.3 64 352 78.3 352 96C352 113.7 366.3 128 384 128L466.7 128L265.3 329.4C252.8 341.9 252.8 362.2 265.3 374.7C277.8 387.2 298.1 387.2 310.6 374.7L512 173.3L512 256C512 273.7 526.3 288 544 288C561.7 288 576 273.7 576 256L576 96C576 78.3 561.7 64 544 64L384 64zM144 160C99.8 160 64 195.8 64 240L64 496C64 540.2 99.8 576 144 576L400 576C444.2 576 480 540.2 480 496L480 416C480 398.3 465.7 384 448 384C430.3 384 416 398.3 416 416L416 496C416 504.8 408.8 512 400 512L144 512C135.2 512 128 504.8 128 496L128 240C128 231.2 135.2 224 144 224L224 224C241.7 224 256 209.7 256 192C256 174.3 241.7 160 224 160L144 160z"/></svg>
                <div class="price-cell-market">
                    <img src="${cfg.logo}" alt="${cfg.name}" class="price-cell-logo">
                    <span class="price-cell-market-name">${cfg.name}</span>
                </div>
                <div class="price-cell-value">${price} ₺</div>
            </a>
        `;
    } else {
        el.outerHTML = `
            <div class="price-cell price-cell--not-found" id="${cellId(barcode, platform)}">
                <div class="price-cell-market">
                    <img src="${cfg.logo}" alt="${cfg.name}" class="price-cell-logo">
                    <span class="price-cell-market-name">${cfg.name}</span>
                </div>
                <div class="price-cell-not-found">Bulunamadı</div>
            </div>
        `;
    }
}

function countScrapedFound(prices) {
    let n = 0;
    SCRAPED_PLATFORMS.forEach(p => {
        if (prices[p] != null && prices[p] !== '') n++;
    });
    return n;
}

function finalizeBarcodeCard(barcode, state) {
    const card = document.getElementById(`result-card-${barcode}`);
    if (!card) return;

    const found = countScrapedFound(state.prices);

    card.classList.remove('result-card--searching');
    let variant, iconVar, badgeClass, statusText, iconName;

    if (found === SCRAPED_TOTAL) {
        variant = 'result-card--success';
        iconVar = 'result-status-icon--success';
        badgeClass = 'badge-success';
        statusText = 'Tümünde Bulundu';
        iconName = 'check_circle';
    } else if (found > 0) {
        variant = 'result-card--partial';
        iconVar = 'result-status-icon--partial';
        badgeClass = 'badge-partial';
        statusText = `${found}/${SCRAPED_TOTAL} Markette Bulundu`;
        iconName = 'adjust';
    } else {
        variant = 'result-card--not-found';
        iconVar = 'result-status-icon--not-found';
        badgeClass = 'badge-not-found';
        statusText = 'Hiçbir Yerde Bulunamadı';
        iconName = 'cancel';
    }

    card.classList.add(variant);
    const iconWrap = card.querySelector('.result-status-icon');
    if (iconWrap) {
        iconWrap.className = 'result-status-icon ' + iconVar;
        iconWrap.innerHTML = `<span class="material-symbols-outlined">${iconName}</span>`;
    }
    const badge = card.querySelector('.result-badge');
    if (badge) {
        badge.className = 'result-badge ' + badgeClass;
        badge.textContent = statusText;
    }

    refreshBestPrices(barcode, state.prices);
}

function exportRowFromPrices(barcode, prices) {
    return SCRAPED_PLATFORMS.map(p => prices[p] || '');
}

async function searchBarcodes() {
    const input = document.getElementById('barcodeInput').value;
    const barcodes = parseBarcodes(input);

    if (barcodes.length === 0) {
        alert('Lütfen en az bir barkod numarası girin!');
        return;
    }

    const loadingDiv = document.getElementById('loading');
    const resultsDiv = document.getElementById('liveResults');
    const searchBtn = document.querySelector('.btn-search');
    const clearBtn = document.querySelector('.btn-clear');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    loadingDiv.classList.add('active');
    progressFill.style.width = '0%';
    progressText.textContent = `${barcodes.length} barkod, ${SCRAPED_TOTAL} platformda aranıyor...`;

    resultsDiv.innerHTML = '';
    searchBtn.disabled = true;
    clearBtn.disabled = true;

    document.getElementById('resultsSection').style.display = 'block';
    document.getElementById('emptyState').style.display = 'none';

    const statusChip = document.getElementById('statusChip');
    const statusLabel = document.getElementById('statusLabel');
    statusChip.className = 'status-chip searching';
    statusLabel.textContent = 'Aranıyor...';

    /** @type {Record<string, { responded:number, prices: Record<string, string|null> }>} */
    const barcodeState = {};
    window.exportData = [];
    barcodes.forEach(b => {
        barcodeState[b] = { responded: 0, prices: {} };
    });

    barcodes.forEach(b => ensureSearchingCard(b, resultsDiv));
    resultsDiv.classList.add('active');

    let completedBarcodes = 0;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcodes })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                let data;
                try {
                    data = JSON.parse(line.slice(6));
                } catch {
                    continue;
                }

                if (data.type === 'result') {
                    const barcode = data.barcode;
                    const platform = data.platform;
                    const priceVal = data.price;

                    const st = barcodeState[barcode];
                    if (!st) continue;

                    st.responded++;
                    if (priceVal != null) {
                        const s = typeof priceVal === 'number' ? String(priceVal.toFixed(2)) : String(priceVal);
                        st.prices[platform] = s;
                    } else {
                        st.prices[platform] = null;
                    }

                    patchPlatformCell(barcode, platform, priceVal);
                    refreshBestPrices(barcode, st.prices);

                    const headerBadge = document.querySelector(`#result-card-${barcode} .result-badge`);
                    if (headerBadge && st.responded < SCRAPED_TOTAL) {
                        badgeDuringSearch(barcode, st);
                    }

                    if (st.responded === SCRAPED_TOTAL) {
                        completedBarcodes++;
                        progressFill.style.width = Math.round((completedBarcodes / barcodes.length) * 100) + '%';
                        progressText.textContent = `${completedBarcodes}/${barcodes.length} barkod tamamlandı`;

                        finalizeBarcodeCard(barcode, st);
                        window.exportData.push({
                            barcode,
                            prices: { ...st.prices }
                        });
                    }

                    document.getElementById('resultsCount').textContent =
                        `${completedBarcodes} / ${barcodes.length} barkod tamamlandı`;
                }

                if (data.type === 'complete') {
                    loadingDiv.classList.remove('active');
                    displaySummary(window.exportData, resultsDiv);
                    statusChip.className = 'status-chip done';
                    statusLabel.textContent = 'Tamamlandı';
                }

                if (data.type === 'error') {
                    throw new Error(data.message || 'Bilinmeyen hata');
                }
            }
        }
    } catch (error) {
        resultsDiv.innerHTML = `
            <div class="error">
                <strong>Hata:</strong> ${error.message}
                <br><br>
                Sunucunun çalıştığından emin olun: <code>node server.js</code>
            </div>
        `;
        resultsDiv.classList.add('active');
        loadingDiv.classList.remove('active');
        statusChip.className = 'status-chip';
        statusLabel.textContent = 'Hata';
    } finally {
        searchBtn.disabled = false;
        clearBtn.disabled = false;
    }
}

function displaySummary(results, container) {
    if (document.querySelector('.summary-section')) return;

    const rows = results.map(result => {
        const pricesObj = result.prices || {};
        const prices = SCRAPED_PLATFORMS
            .filter(p => pricesObj[p])
            .map(p => ({ market: p, value: parseFloat(pricesObj[p]) }));

        const lowest = prices.length > 0 ? Math.min(...prices.map(p => p.value)) : null;
        const highest = prices.length > 0 ? Math.max(...prices.map(p => p.value)) : null;
        const bestEntry = prices.find(p => p.value === lowest);
        const bestMarketName = bestEntry ? marketConfig[bestEntry.market].name : null;
        const bestMarketLogo = bestEntry ? marketConfig[bestEntry.market].logo : null;
        const foundCount = prices.length;

        let statusClass;
        let statusText;
        if (foundCount === SCRAPED_TOTAL) {
            statusClass = 'status-success';
            statusText = 'Tümünde Bulundu';
        } else if (foundCount > 0) {
            statusClass = 'status-partial';
            statusText = `${foundCount}/${SCRAPED_TOTAL} Markette`;
        } else {
            statusClass = 'status-not-found';
            statusText = 'Bulunamadı';
        }

        return { barcode: result.barcode, lowest, highest, bestMarketName, bestMarketLogo, statusClass, statusText };
    });

    const tableRows = rows.map(row => `
        <tr>
            <td class="summary-barcode">${row.barcode}</td>
            <td class="summary-lowest">${row.lowest !== null ? '₺' + row.lowest.toFixed(2) : '—'}</td>
            <td class="summary-highest">${row.highest !== null ? '₺' + row.highest.toFixed(2) : '—'}</td>
            <td class="summary-best-market">
                ${row.bestMarketName
                    ? `<div class="summary-market-cell">
                            <img src="${row.bestMarketLogo}" alt="${row.bestMarketName}" class="summary-market-logo">
                            <span class="summary-market-name">${row.bestMarketName}</span>
                       </div>`
                    : '—'}
            </td>
            <td><span class="status-badge ${row.statusClass}">${row.statusText}</span></td>
        </tr>
    `).join('');

    const headerCols = SCRAPED_PLATFORMS.map(k => marketConfig[k].name).join(',');

    const summaryHtml = `
        <div class="summary-section">
            <div class="summary-section-header">
                <h3 class="summary-section-title">Özet Tablo</h3>
                <button class="btn-export" onclick="exportToExcel()">
                    <span class="material-symbols-outlined">download</span>
                    CSV İndir
                </button>
            </div>
            <div class="summary-table-wrapper">
                <table class="summary-table">
                    <thead>
                        <tr>
                            <th>Barkod</th>
                            <th>En Düşük Fiyat</th>
                            <th>En Yüksek Fiyat</th>
                            <th>En İyi Market</th>
                            <th>Durum</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', summaryHtml);

    /** CSV başlığı (tek kaynak: SCRAPED_PLATFORMS) */
    window._csvHeader = `Barkod,${headerCols}`;
}

function exportToExcel() {
    const data = window.exportData || [];
    if (data.length === 0) {
        alert('Henüz dışa aktarılacak veri yok!');
        return;
    }

    const header = window._csvHeader || `Barkod,${SCRAPED_PLATFORMS.map(k => marketConfig[k].name).join(',')}`;
    let csv = header + '\n';

    data.forEach(row => {
        const cells = exportRowFromPrices(row.barcode, row.prices);
        csv += [row.barcode, ...cells.map(c => (c === '' ? 'Bulunamadı' : c))].join(',') + '\n';
    });

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const date = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `fiyat_karsilastirma_${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function clearAll() {
    document.getElementById('barcodeInput').value = '';
    document.getElementById('liveResults').innerHTML = '';
    document.getElementById('liveResults').classList.remove('active');
    document.getElementById('loading').classList.remove('active');
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('emptyState').style.display = 'flex';
    const chip = document.getElementById('statusChip');
    const label = document.getElementById('statusLabel');
    chip.className = 'status-chip';
    label.textContent = 'Bekleniyor';
    window.exportData = [];
    window._csvHeader = '';
}

document.getElementById('barcodeInput').addEventListener('keypress', function (e) {
    if (e.ctrlKey && e.key === 'Enter') {
        searchBarcodes();
    }
});
