/**
 * Сводная страница ARGO: карта всех буёв + сортируемая таблица метрик.
 * Работает и без карты (если ymaps недоступен).
 */
(function () {
    'use strict';

    const state = {
        map: null,
        buoyData: null,
        metrics: [],
        markers: new Map(),
        sortKey: 'rmse',
        sortAsc: true,
        metric: 'rmse'
    };

    const COLORS_RMSE = ['#1a9850', '#a6d96a', '#ffffbf', '#fdae61', '#d73027'];

    window.initArgoSummary = function (map) {
        state.map = map;
        bootstrap();
    };

    async function bootstrap() {
        console.log("Загрузка JSON...");
        state.buoyData = await AppUtils.loadJSON(AppUtils.config.dataUrl);
        if (!state.buoyData) {
            const tb = document.getElementById('buoy-tbody');
            if (tb) tb.innerHTML = '<tr><td colspan="10" class="table-empty" style="color:red">Не удалось загрузить данные JSON</td></tr>';
            return;
        }

        console.log("Данные загружены, считаем метрики...");
        state.metrics = Object.keys(state.buoyData)
            .map(id => computeMetrics(id, state.buoyData[id]))
            .filter(Boolean);

        if (state.metrics.length === 0) {
            const tb = document.getElementById('buoy-tbody');
            if (tb) tb.innerHTML = '<tr><td colspan="10" class="table-empty">Не удалось посчитать метрики</td></tr>';
            return;
        }

        console.log("Метрики посчитаны, отрисовываем...");
        renderSummaryCards();
        renderTable();
        renderMap(); // безопасно: если карты нет, просто выйдет
        updateLegend();
        bindEvents();
    }

    function computeMetrics(id, points) {
        if (!Array.isArray(points) || points.length === 0) return null;

        const pairs = [];
        points.forEach(p => {
            const m = num(p.tM), a = num(p.tA);
            if (m != null && a != null) pairs.push([m, a]);
        });
        if (pairs.length === 0) return null;

        const n = pairs.length;
        let sumErr = 0, sumAbsErr = 0, sumSqErr = 0, sumA = 0;
        pairs.forEach(([m, a]) => {
            const e = m - a;
            sumErr += e;
            sumAbsErr += Math.abs(e);
            sumSqErr += e * e;
            sumA += a;
        });
        const meanA = sumA / n;
        const bias = sumErr / n;
        const mae  = sumAbsErr / n;
        const rmse = Math.sqrt(sumSqErr / n);

        let ssTot = 0, ssRes = 0;
        pairs.forEach(([m, a]) => {
            ssTot += (a - meanA) ** 2;
            ssRes += (m - a) ** 2;
        });
        const r2 = ssTot > 0 ? 1 - ssRes / ssTot : null;

        let lat = 0, lon = 0, k = 0;
        points.forEach(p => {
            const la = num(p.latA), lo = num(p.lonA);
            if (la != null && lo != null) { lat += la; lon += lo; k++; }
        });
        if (k === 0) return null;
        lat /= k; lon /= k;

        const dates = [...new Set(points.map(p => (p.timeM || '').split(' ')[0]).filter(Boolean))].sort();
        let period;
        if (dates.length === 0) period = '—';
        else if (dates.length === 1) period = dates[0];
        else period = dates[0] + ' … ' + dates[dates.length - 1];

        const depthsSet = new Set();
        points.forEach(p => {
            const z = Math.round(parseFloat(p.zM));
            if (isFinite(z)) depthsSet.add(z);
        });

        const REGIONS = { 555: 'Чёрное море' };
        const regionRaw = points[0].region;
        const region = REGIONS[regionRaw] || (regionRaw != null ? 'Регион ' + regionRaw : '—');

        return {
            id, lat, lon, region, period,
            depths: depthsSet.size,
            profiles: dates.length,
            points: n,
            rmse, bias, mae, r2
        };
    }

    function renderSummaryCards() {
        const all = state.metrics;
        const totalPoints = all.reduce((s, b) => s + b.points, 0);
        const totalProfiles = all.reduce((s, b) => s + b.profiles, 0);
        const totalSqErr = all.reduce((s, b) => s + b.rmse * b.rmse * b.points, 0);
        const overallRmse = totalPoints > 0 ? Math.sqrt(totalSqErr / totalPoints) : null;

        setText('sum-buoys', all.length);
        setText('sum-profiles', totalProfiles);
        setText('sum-points', totalPoints);
        setText('sum-rmse', overallRmse != null ? overallRmse.toFixed(3) : '—');
    }

    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function renderTable() {
        const tbody = document.getElementById('buoy-tbody');
        if (!tbody) return;

        const sorted = [...state.metrics].sort((a, b) => {
            const va = a[state.sortKey], vb = b[state.sortKey];
            if (va == null && vb == null) return 0;
            if (va == null) return 1;
            if (vb == null) return -1;
            if (typeof va === 'number') return state.sortAsc ? va - vb : vb - va;
            return state.sortAsc
                ? String(va).localeCompare(String(vb))
                : String(vb).localeCompare(String(va));
        });

        const rmseVals = state.metrics.map(b => b.rmse).filter(v => v != null);
        const rmseMin = Math.min(...rmseVals), rmseMax = Math.max(...rmseVals);

        const biasVals = state.metrics.map(b => b.bias).filter(v => v != null);
        const biasAbsMax = Math.max(...biasVals.map(v => Math.abs(v)), 0.01);

        tbody.innerHTML = sorted.map(b => {
            const rmseColor = valueToColor(b.rmse, rmseMin, rmseMax, COLORS_RMSE);
            const biasColor = biasToColor(b.bias, biasAbsMax);
            const biasSign = b.bias > 0 ? '+' : '';

            return '<tr data-buoy="' + b.id + '">' +
                    '<td><a href="argo-profiles.html?buoy=' + b.id + '">' + b.id + '</a></td>' +
                    '<td>' + b.region + '</td>' +
                    '<td>' + b.period + '</td>' +
                    '<td class="num">' + b.depths + '</td>' +
                    '<td class="num">' + b.profiles + '</td>' +
                    '<td class="num">' + b.points + '</td>' +
                    '<td class="num"><span class="metric-badge" style="background:' + rmseColor + '">' + b.rmse.toFixed(3) + '</span></td>' +
                    '<td class="num"><span class="metric-badge" style="background:' + biasColor + '">' + biasSign + b.bias.toFixed(3) + '</span></td>' +
                    '<td class="num">' + fmt(b.mae) + '</td>' +
                    '<td class="num">' + (b.r2 != null ? b.r2.toFixed(3) : '—') + '</td>' +
                '</tr>';
        }).join('');

        document.querySelectorAll('#buoy-table th').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.key === state.sortKey) {
                th.classList.add(state.sortAsc ? 'sort-asc' : 'sort-desc');
            }
        });

        tbody.querySelectorAll('tr[data-buoy]').forEach(tr => {
            tr.addEventListener('click', e => {
                if (e.target.tagName === 'A') return;
                focusBuoy(tr.dataset.buoy);
            });
        });
    }

    function fmt(v) { return v != null ? v.toFixed(3) : '—'; }

    function renderMap() {
        if (!AppUtils.isMapReady(state.map)) {
            console.warn("Карта не готова, пропускаем отрисовку маркеров.");
            return;
        }

        state.map.geoObjects.removeAll();
        state.markers.clear();

        const values = state.metrics.map(b => b[state.metric]).filter(v => v != null);
        const vmin = Math.min(...values), vmax = Math.max(...values);

        const collection = new ymaps.GeoObjectCollection();

        state.metrics.forEach(b => {
            let color;
            if (state.metric === 'bias') {
                const absMax = Math.max(...values.map(v => Math.abs(v)), 0.01);
                color = biasToColor(b.bias, absMax);
            } else {
                color = valueToColor(b[state.metric], vmin, vmax, COLORS_RMSE);
            }

            const biasSign = b.bias > 0 ? '+' : '';
            
            try {
                const marker = new ymaps.Placemark(
                    [b.lat, b.lon],
                    {
                        balloonContentHeader: 'Буй ' + b.id,
                        balloonContentBody: 
                            '<b>Регион:</b> ' + b.region + '<br>' +
                            '<b>Период:</b> ' + b.period + '<br>' +
                            '<b>Профилей:</b> ' + b.profiles + '<br>' +
                            '<b>Точек:</b> ' + b.points + '<br>' +
                            '<b>RMSE:</b> ' + b.rmse.toFixed(3) + ' °C<br>' +
                            '<b>Bias:</b> ' + biasSign + b.bias.toFixed(3) + ' °C<br>' +
                            '<b>MAE:</b> ' + b.mae.toFixed(3) + ' °C<br>' +
                            '<b>R²:</b> ' + (b.r2 != null ? b.r2.toFixed(3) : '—') + '<br>' +
                            '<a href="argo-profiles.html?buoy=' + b.id + '" style="display:inline-block;margin-top:6px;color:#005b96;font-weight:bold;">→ Открыть страницу буя</a>'
                    },
                    {
                        preset: 'islands#circleIcon',
                        iconColor: color
                    }
                );

                marker.events.add('click', () => highlightRow(b.id));
                state.markers.set(b.id, marker);
                collection.add(marker);
            } catch (e) {
                console.error("Ошибка при создании маркера для буя", b.id, e);
            }
        });

        state.map.geoObjects.add(collection);

        if (state.metrics.length > 1) {
            try {
                const bounds = collection.getBounds();
                if (bounds) state.map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 });
            } catch (e) { /* ignore */ }
        }
    }

    function focusBuoy(id) {
        const b = state.metrics.find(x => x.id === id);
        if (!b || !state.map) return;
        state.map.setCenter([b.lat, b.lon], 8, { duration: 300 });
        const marker = state.markers.get(id);
        if (marker) marker.balloon.open();
    }

    function highlightRow(id) {
        document.querySelectorAll('#buoy-tbody tr').forEach(tr => {
            tr.classList.toggle('highlight', tr.dataset.buoy === id);
        });
        const tr = document.querySelector('#buoy-tbody tr[data-buoy="' + id + '"]');
        if (tr) tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function updateLegend() {
        const values = state.metrics.map(b => b[state.metric]).filter(v => v != null);
        if (values.length === 0) return;

        let min, max;
        if (state.metric === 'bias') {
            const absMax = Math.max(...values.map(v => Math.abs(v)), 0.01);
            min = -absMax; max = absMax;
        } else {
            min = Math.min(...values); max = Math.max(...values);
        }
        document.getElementById('legend-min').textContent = min.toFixed(2);
        document.getElementById('legend-max').textContent = (max > 0 ? '+' : '') + max.toFixed(2);
    }

    function bindEvents() {
        document.querySelectorAll('#buoy-table th').forEach(th => {
            th.addEventListener('click', () => {
                const key = th.dataset.key;
                if (state.sortKey === key) state.sortAsc = !state.sortAsc;
                else { state.sortKey = key; state.sortAsc = true; }
                renderTable();
            });
        });

        const sel = document.getElementById('metric-select');
        if (sel) {
            sel.addEventListener('change', e => {
                state.metric = e.target.value;
                renderTable();
                renderMap();
                updateLegend();
            });
        }
    }

    function num(v) { const n = parseFloat(v); return isFinite(n) ? n : null; }

    function valueToColor(v, vmin, vmax, palette) {
        if (v == null) return '#cccccc';
        if (vmax === vmin) return palette[2];
        const t = Math.max(0, Math.min(1, (v - vmin) / (vmax - vmin)));
        return interpPalette(t, palette);
    }

    function biasToColor(v, absMax) {
        if (v == null) return '#cccccc';
        const t = Math.max(-1, Math.min(1, v / absMax));
        if (t < 0) return lerpHex('#f7f7f7', '#2166ac', -t);
        if (t > 0) return lerpHex('#f7f7f7', '#b2182b', t);
        return '#f7f7f7';
    }

    function interpPalette(t, palette) {
        const idx = t * (palette.length - 1);
        const i0 = Math.floor(idx), i1 = Math.min(palette.length - 1, i0 + 1);
        const frac = idx - i0;
        return lerpHex(palette[i0], palette[i1], frac);
    }

    function lerpHex(a, b, t) {
        const pa = hexToRgb(a), pb = hexToRgb(b);
        const r = Math.round(pa.r + (pb.r - pa.r) * t);
        const g = Math.round(pa.g + (pb.g - pa.g) * t);
        const bl = Math.round(pa.b + (pb.b - pa.b) * t);
        return 'rgb(' + r + ',' + g + ',' + bl + ')';
    }
    
    function hexToRgb(hex) {
        const h = hex.replace('#', '');
        return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
    }
})();