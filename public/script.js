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
    resultsDiv.classList.remove('active');
    resultsDiv.innerHTML = '';
    searchBtn.disabled = true;
    clearBtn.disabled = true;

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
                        progressFill.textContent = percentage + '%';
                        progressText.textContent = `${data.barcode} aranıyor... (${data.current}/${data.total})`;
                    }

                    if (data.type === 'result') {
                        results.push(data.data);
                        window.exportData.push(data.data);
                        displayResult(data.data, resultsDiv);
                        
                        if (!resultsDiv.classList.contains('active')) {
                            resultsDiv.classList.add('active');
                        }
                    }

                    if (data.type === 'complete') {
                        loadingDiv.classList.remove('active');
                        displaySummary(results, resultsDiv);
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
    } finally {
        searchBtn.disabled = false;
    }
}

function displayResult(result, container) {
    const totalMarkets = 8;
    const foundCount = Object.keys(result.prices).length;
    let statusClass, statusText;

    if (foundCount === totalMarkets) {
        statusClass = 'status-success';
        statusText = 'Tüm marketlerde bulundu';
    } else if (foundCount > 0) {
        statusClass = 'status-partial';
        statusText = `${foundCount}/${totalMarkets} markette bulundu`;
    } else {
        statusClass = 'status-not-found';
        statusText = 'Hiçbir yerde bulunamadı';
    }

    let html = `
        <div class="result-item">
            <div class="result-header">
                <div class="barcode-title">${result.barcode}</div>
                <div class="status-badge ${statusClass}">${statusText}</div>
            </div>
            <div class="prices-list">
    `;

    const allMarkets = ['trendyol', 'hepsiburada', 'pazarama', 'carrefoursa', 'mopas', 'onurMarket', 'aftaMarket', 'sokMarket'];
    
    allMarkets.forEach(market => {
        const config = marketConfig[market];
        const productUrl = config.url + result.barcode;
        
        if (result.prices[market]) {
            html += `
                <a href="${productUrl}" target="_blank" class="price-row" style="text-decoration: none; color: inherit;">
                    <div class="market-info">
                        <img src="${config.logo}" alt="${config.name}" class="market-logo">
                        <span class="market-name">${config.name}</span>
                    </div>
                    <div class="price-value">${result.prices[market]} ₺</div>
                </a>
            `;
        } else {
            html += `
                <div class="price-row not-found">
                    <div class="market-info">
                        <img src="${config.logo}" alt="${config.name}" class="market-logo">
                        <span class="market-name">${config.name}</span>
                    </div>
                    <div class="price-value not-found-text">Bulunamadı</div>
                </div>
            `;
        }
    });

    html += `
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', html);
}

function displaySummary(results, container) {
    const totalMarkets = 8;
    let totalFound = 0;
    let totalPartial = 0;
    let totalNotFound = 0;

    results.forEach(result => {
        const foundCount = Object.keys(result.prices).length;
        if (foundCount === totalMarkets) totalFound++;
        else if (foundCount > 0) totalPartial++;
        else totalNotFound++;
    });

    const summaryHtml = `
        <div class="summary">
            <div class="summary-header">
                <h3>Özet</h3>
                <button class="btn-export" onclick="exportToExcel()">Excel'e Aktar</button>
            </div>
            <div class="summary-stats">
                <div class="stat-item">
                    <div class="stat-value">${results.length}</div>
                    <div class="stat-label">Toplam Barkod</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${totalFound}</div>
                    <div class="stat-label">Tümünde Bulundu</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${totalPartial}</div>
                    <div class="stat-label">Kısmi Bulundu</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${totalNotFound}</div>
                    <div class="stat-label">Bulunamadı</div>
                </div>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('afterbegin', summaryHtml);
}

function exportToExcel() {
    if (!window.exportData || window.exportData.length === 0) {
        alert('Henüz dışa aktarılacak veri yok!');
        return;
    }

    // CSV formatında veri oluştur
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
}

document.getElementById('barcodeInput').addEventListener('keypress', function(e) {
    if (e.ctrlKey && e.key === 'Enter') {
        searchBarcodes();
    }
});