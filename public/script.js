const API_URL = 'http://localhost:3000/api/search-stream';

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
    onurMarket: {
        logo: 'images/onur.png',
        url: 'https://www.onurmarket.com/Arama?1&kelime=',
        name: 'Onur Market'
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

function parseBarcodes(text) {
    return text
        .split(/[\n,]/)
        .map(b => b.trim())
        .filter(b => b.length > 0);
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
    resultsDiv.innerHTML = '';
    searchBtn.disabled = true;
    clearBtn.disabled = true;

    document.getElementById('resultsSection').style.display = 'block';
    document.getElementById('emptyState').style.display = 'none';
    const statusChip  = document.getElementById('statusChip');
    const statusLabel = document.getElementById('statusLabel');
    statusChip.className  = 'status-chip searching';
    statusLabel.textContent = 'Aranıyor...';

    const results = [];
    window.exportData = [];

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ barcodes })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = JSON.parse(line.slice(6));

                    if (data.type === 'progress') {
                        const percentage = Math.round((data.current / data.total) * 100);
                        progressFill.style.width = percentage + '%';
                        progressText.textContent = `${data.barcode} aranıyor... (${data.current}/${data.total})`;

                        showSearchingCard(data.barcode, resultsDiv);
                        resultsDiv.classList.add('active');
                    }

                    if (data.type === 'result') {
                        results.push(data.data);
                        window.exportData.push(data.data);
                        displayResult(data.data, resultsDiv);
                        resultsDiv.classList.add('active');
                        document.getElementById('resultsCount').textContent =
                            `${results.length} / ${barcodes.length} tarama gösteriliyor`;
                    }

                    if (data.type === 'complete') {
                        loadingDiv.classList.remove('active');
                        displaySummary(results, resultsDiv);
                        statusChip.className  = 'status-chip done';
                        statusLabel.textContent = 'Tamamlandı';
                    }

                    if (data.type === 'error') {
                        throw new Error(data.message);
                    }
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
        statusChip.className  = 'status-chip';
        statusLabel.textContent = 'Hata';
    } finally {
        searchBtn.disabled = false;
    }
}

function showSearchingCard(barcode, container) {
    if (document.getElementById(`result-card-${barcode}`)) return;

    const skeletonCells = Array.from({ length: 8 }).map(() => `
        <div class="skeleton-cell">
            <div class="skeleton-line skeleton-line--short"></div>
            <div class="skeleton-line skeleton-line--tall"></div>
        </div>
    `).join('');

    const html = `
        <div class="result-card result-card--searching" id="result-card-${barcode}">
            <div class="result-card-header">
                <div class="result-card-left">
                    <div class="result-status-icon result-status-icon--searching">
                        <span class="material-symbols-outlined">bolt</span>
                    </div>
                    <span class="result-barcode-number">${barcode}</span>
                    <span class="result-badge badge-searching">Marketler Aranıyor...</span>
                </div>
            </div>
            <div class="result-skeleton">${skeletonCells}</div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', html);
}

function displayResult(result, container) {
    const totalMarkets = 8;
    const foundCount = Object.keys(result.prices).length;

    let cardVariant, iconVariant, badgeClass, statusText, iconName;

    if (foundCount === totalMarkets) {
        cardVariant  = 'result-card--success';
        iconVariant  = 'result-status-icon--success';
        badgeClass   = 'badge-success';
        statusText   = 'Tümünde Bulundu';
        iconName     = 'check_circle';
    } else if (foundCount > 0) {
        cardVariant  = 'result-card--partial';
        iconVariant  = 'result-status-icon--partial';
        badgeClass   = 'badge-partial';
        statusText   = `${foundCount}/${totalMarkets} Markette Bulundu`;
        iconName     = 'adjust';
    } else {
        cardVariant  = 'result-card--not-found';
        iconVariant  = 'result-status-icon--not-found';
        badgeClass   = 'badge-not-found';
        statusText   = 'Hiçbir Yerde Bulunamadı';
        iconName     = 'cancel';
    }

    const allMarkets = ['trendyol', 'hepsiburada', 'pazarama', 'carrefoursa', 'mopas', 'onurMarket', 'aftaMarket', 'sokMarket'];
    const numericPrices = allMarkets
        .filter(m => result.prices[m])
        .map(m => parseFloat(result.prices[m]));
    const bestPrice = numericPrices.length > 0 ? Math.min(...numericPrices) : null;

    const priceCells = allMarkets.map(market => {
        const config     = marketConfig[market];
        const price      = result.prices[market];
        const productUrl = config.url + result.barcode;
        const isBest     = price && bestPrice !== null && parseFloat(price) === bestPrice;

        if (price) {
            return `
                <a href="${productUrl}" target="_blank" class="price-cell${isBest ? ' price-cell--best' : ''}">
                    <svg class="price-cell-open-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor"><path d="M384 64C366.3 64 352 78.3 352 96C352 113.7 366.3 128 384 128L466.7 128L265.3 329.4C252.8 341.9 252.8 362.2 265.3 374.7C277.8 387.2 298.1 387.2 310.6 374.7L512 173.3L512 256C512 273.7 526.3 288 544 288C561.7 288 576 273.7 576 256L576 96C576 78.3 561.7 64 544 64L384 64zM144 160C99.8 160 64 195.8 64 240L64 496C64 540.2 99.8 576 144 576L400 576C444.2 576 480 540.2 480 496L480 416C480 398.3 465.7 384 448 384C430.3 384 416 398.3 416 416L416 496C416 504.8 408.8 512 400 512L144 512C135.2 512 128 504.8 128 496L128 240C128 231.2 135.2 224 144 224L224 224C241.7 224 256 209.7 256 192C256 174.3 241.7 160 224 160L144 160z"/></svg>
                    <div class="price-cell-market">
                        <img src="${config.logo}" alt="${config.name}" class="price-cell-logo">
                        <span class="price-cell-market-name">${config.name}</span>
                    </div>
                    <div class="price-cell-value">${result.prices[market]} ₺</div>
                    ${isBest ? '<div class="price-cell-best-label">En Ucuz</div>' : ''}
                </a>
            `;
        } else {
            return `
                <div class="price-cell price-cell--not-found">
                    <div class="price-cell-market">
                        <img src="${config.logo}" alt="${config.name}" class="price-cell-logo">
                        <span class="price-cell-market-name">${config.name}</span>
                    </div>
                    <div class="price-cell-not-found">Bulunamadı</div>
                </div>
            `;
        }
    }).join('');

    const html = `
        <div class="result-card ${cardVariant}" id="result-card-${result.barcode}">
            <div class="result-card-header">
                <div class="result-card-left">
                    <div class="result-status-icon ${iconVariant}">
                        <span class="material-symbols-outlined">${iconName}</span>
                    </div>
                    <span class="result-barcode-number">${result.barcode}</span>
                    <span class="result-badge ${badgeClass}">${statusText}</span>
                </div>
                <span class="result-timestamp">Tarama tamamlandı</span>
            </div>
            <div class="result-prices-grid">${priceCells}</div>
        </div>
    `;

    const existingCard = document.getElementById(`result-card-${result.barcode}`);
    if (existingCard) {
        existingCard.outerHTML = html;
    } else {
        container.insertAdjacentHTML('beforeend', html);
    }
}

function displaySummary(results, container) {
    const totalMarkets = 8;

    const rows = results.map(result => {
        const prices = Object.entries(result.prices)
            .filter(([, p]) => p !== null)
            .map(([m, p]) => ({ market: m, value: parseFloat(p) }));

        const lowest  = prices.length > 0 ? Math.min(...prices.map(p => p.value)) : null;
        const highest = prices.length > 0 ? Math.max(...prices.map(p => p.value)) : null;
        const bestEntry = prices.find(p => p.value === lowest);
        const bestMarketName = bestEntry ? marketConfig[bestEntry.market].name : null;
        const bestMarketLogo = bestEntry ? marketConfig[bestEntry.market].logo : null;
        const foundCount = prices.length;

        let statusClass, statusText;
        if (foundCount === totalMarkets) {
            statusClass = 'status-success'; statusText = 'Tümünde Bulundu';
        } else if (foundCount > 0) {
            statusClass = 'status-partial'; statusText = `${foundCount}/${totalMarkets} Markette`;
        } else {
            statusClass = 'status-not-found'; statusText = 'Bulunamadı';
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
}

function exportToExcel() {
    if (!window.exportData || window.exportData.length === 0) {
        alert('Henüz dışa aktarılacak veri yok!');
        return;
    }

    let csv = 'Barkod,Trendyol,Hepsiburada,Pazarama,CarrefourSA,Mopas,Onur Market,Afta Market,Sok Market\n';

    window.exportData.forEach(result => {
        const row = [
            result.barcode,
            result.prices.trendyol || 'Bulunamadı',
            result.prices.hepsiburada || 'Bulunamadı',
            result.prices.pazarama || 'Bulunamadı',
            result.prices.carrefoursa || 'Bulunamadı',
            result.prices.mopas || 'Bulunamadı',
            result.prices.onurMarket || 'Bulunamadı',
            result.prices.aftaMarket || 'Bulunamadı',
            result.prices.sokMarket || 'Bulunamadı'
        ];
        csv += row.join(',') + '\n';
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
    document.getElementById('emptyState').style.display    = 'flex';
    const chip  = document.getElementById('statusChip');
    const label = document.getElementById('statusLabel');
    chip.className      = 'status-chip';
    label.textContent   = 'Bekleniyor';
}

document.getElementById('barcodeInput').addEventListener('keypress', function(e) {
    if (e.ctrlKey && e.key === 'Enter') {
        searchBarcodes();
    }
});