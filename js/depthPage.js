function initDepthPage(map) {
    const state = {
        map,
        geoObjects: [],
        buoyData: null,
        currentBuoy: null,
        currentDepth: null
    };

    async function init() {
        state.buoyData = await AppUtils.loadJSON(AppUtils.config.dataUrl);
        if (!state.buoyData) {
            showNotification('Не удалось загрузить данные буёв', 'error');
            return;
        }

        // 1. Приоритет — параметр ?buoy=NNNN из URL
        const urlBuoy = new URLSearchParams(window.location.search).get('buoy');
        if (urlBuoy && state.buoyData[urlBuoy]) {
            state.currentBuoy = urlBuoy;
            state.currentDepth = null;
        } else {
            // 2. Иначе — из localStorage
            const savedState = AppUtils.getState('depth');
            if (savedState) {
                state.currentBuoy = savedState.currentBuoy;
                state.currentDepth = savedState.currentDepth;
            }
        }

        initBuoySelector();
        if (state.currentBuoy) {
            initDepthSelector();
        }

        // Обработчики ставим ДО построения карты/графика
        setupEventListeners();

        if (state.currentBuoy && state.currentDepth) {
            plotBuoysForDepth();
        } else {
            const plot = document.getElementById('plot');
            if (plot) plot.innerHTML = '<p class="info">Выберите буй и глубину для отображения данных</p>';
        }
    }

    function initBuoySelector() {
        if (!state.buoyData) return;

        const buoysWithDepthData = Object.keys(state.buoyData).filter(buoyId => {
            const buoyPoints = state.buoyData[buoyId];
            if (!buoyPoints || buoyPoints.length === 0) return false;
            const depthPoints = {};
            buoyPoints.forEach(point => {
                const depth = Math.round(parseFloat(point.zM));
                if (isFinite(depth)) depthPoints[depth] = (depthPoints[depth] || 0) + 1;
            });
            return Object.keys(depthPoints).some(depth => depthPoints[depth] >= 2);
        }).sort();

        const options = buoysWithDepthData.map(buoy => ({ value: buoy, label: buoy }));
        AppUtils.initSelect('buoy-select', options, 'Выберите буй');

        if (state.currentBuoy && !buoysWithDepthData.includes(state.currentBuoy)) {
            state.currentBuoy = null;
            state.currentDepth = null;
            AppUtils.saveState('depth', { currentBuoy: null, currentDepth: null });
        }

        if (state.currentBuoy && buoysWithDepthData.includes(state.currentBuoy)) {
            document.getElementById('buoy-select').value = state.currentBuoy;
        }
    }

    function initDepthSelector() {
        const depthSelect = document.getElementById('depth-select');
        if (!depthSelect) return;

        if (!state.currentBuoy || !state.buoyData[state.currentBuoy]) {
            depthSelect.innerHTML = '<option value="">Нет данных</option>';
            return;
        }

        const depthPoints = {};
        state.buoyData[state.currentBuoy].forEach(point => {
            const depth = Math.round(parseFloat(point.zM));
            if (isFinite(depth)) depthPoints[depth] = (depthPoints[depth] || 0) + 1;
        });

        const availableDepths = Object.keys(depthPoints)
            .filter(depth => depthPoints[depth] >= 2)
            .sort((a, b) => a - b)
            .map(depth => ({ value: depth, label: `${depth} м` }));

        AppUtils.initSelect('depth-select', availableDepths, 'Выберите глубину');

        if (state.currentDepth != null && availableDepths.some(d => d.value == state.currentDepth)) {
            depthSelect.value = state.currentDepth;
        } else if (availableDepths.length > 0) {
            state.currentDepth = availableDepths[0].value;
            depthSelect.value = state.currentDepth;
            AppUtils.saveState('depth', {
                currentBuoy: state.currentBuoy,
                currentDepth: state.currentDepth
            });
        } else {
            state.currentDepth = null;
        }
    }

    function plotBuoysForDepth() {
        const plotContainer = document.getElementById('plot');
        if (!plotContainer) return;

        if (!state.currentBuoy || state.currentDepth == null) {
            plotContainer.innerHTML = '<p class="info">Выберите буй и глубину для отображения данных</p>';
            return;
        }

        const buoyPoints = state.buoyData[state.currentBuoy].filter(point =>
            Math.round(parseFloat(point.zM)) === parseInt(state.currentDepth)
        );

        if (buoyPoints.length === 0) {
            plotContainer.innerHTML = '<p class="error">Нет данных для выбранной глубины</p>';
            return;
        }

        // Карта — опционально
        if (AppUtils.isMapReady(state.map)) {
            state.map.geoObjects.removeAll();
            state.geoObjects = [];

            const coordinates = buoyPoints
                .map(point => [parseFloat(point.latA), parseFloat(point.lonA)])
                .filter(([la, lo]) => isFinite(la) && isFinite(lo));

            if (coordinates.length > 1) {
                try {
                    const polyline = new ymaps.Polyline(coordinates, {}, {
                        strokeColor: '#FF0000',
                        strokeWidth: 2,
                        strokeOpacity: 0.5
                    });
                    state.map.geoObjects.add(polyline);
                    state.geoObjects.push(polyline);
                } catch (e) {
                    console.error('Ошибка создания полилинии:', e);
                }
            }

            buoyPoints.forEach(point => {
                const la = parseFloat(point.latA);
                const lo = parseFloat(point.lonA);
                if (!isFinite(la) || !isFinite(lo)) return;
                const tVal = point.tA != null ? point.tA : point.tM;

                const marker = AppUtils.createMarker(
                    state.map,
                    [la, lo],
                    `Буй: ${state.currentBuoy}<br>Глубина: ${state.currentDepth} м<br>Дата: ${point.timeA}<br>Температура: ${tVal != null ? tVal.toFixed(2) : 'N/A'}°C`,
                    'blue',
                    () => displayTimeSeriesPlot(point)
                );
                if (marker) state.geoObjects.push(marker);
            });
        }

        // График — всегда
        displayTimeSeriesPlot(buoyPoints[0]);
    }

    function displayTimeSeriesPlot(point) {
        const plotContainer = document.getElementById('plot');
        if (!plotContainer) return;
        plotContainer.innerHTML = '<div class="loading">Загрузка временного ряда...</div>';

        const depth = Math.round(parseFloat(point.zM));
        const imagePath = `images/depth_plots/buoy_${state.currentBuoy}_depth_${depth}m.png`;

        const img = new Image();
        img.onload = function() {
            plotContainer.innerHTML = `
                <div class="plot-content">
                    <h3>Временной ряд температуры на глубине ${depth} м</h3>
                    <div class="plot-image">
                        <img src="${imagePath}" alt="Временной ряд температуры">
                    </div>
                    <div class="plot-meta">
                        <span><strong>Буй:</strong> ${state.currentBuoy}</span>
                        <span><strong>Глубина:</strong> ${depth} м</span>
                        <span><strong>Координаты:</strong> ${point.latA}°N, ${point.lonA}°E</span>
                    </div>
                    <div class="plot-info">
                        <p>График показывает изменение температуры во времени на фиксированной глубине ${depth} метров.</p>
                        <p>Каждая точка соответствует измерению температуры в определенный момент времени.</p>
                    </div>
                </div>
            `;
        };
        img.onerror = function() {
            plotContainer.innerHTML = `
                <div class="plot-error">
                    <h3>Временной ряд температуры на глубине ${depth} м</h3>
                    <p class="error">График временного ряда не доступен</p>
                    <p class="info">Возможные причины:</p>
                    <ul class="info">
                        <li>Данные для выбранной глубины еще не обработаны</li>
                        <li>Недостаточно точек данных для построения временного ряда</li>
                        <li>Попробуйте выбрать другую глубину или буй</li>
                    </ul>
                    <div class="plot-meta">
                        <span><strong>Буй:</strong> ${state.currentBuoy}</span>
                        <span><strong>Глубина:</strong> ${depth} м</span>
                        <span><strong>Координаты:</strong> ${point.latA}°N, ${point.lonA}°E</span>
                    </div>
                </div>
            `;
        };
        img.src = imagePath;
    }

    function setupEventListeners() {
        const buoySelect = document.getElementById('buoy-select');
        if (buoySelect) {
            buoySelect.addEventListener('change', function() {
                state.currentBuoy = this.value || null;
                state.currentDepth = null;
                AppUtils.saveState('depth', {
                    currentBuoy: state.currentBuoy,
                    currentDepth: state.currentDepth
                });
                if (state.currentBuoy) {
                    initDepthSelector();
                    plotBuoysForDepth();
                } else {
                    document.getElementById('depth-select').innerHTML = '<option value="">Выберите глубину</option>';
                    const plot = document.getElementById('plot');
                    if (plot) plot.innerHTML = '<p class="info">Выберите буй для отображения данных</p>';
                }
            });
        }

        const depthSelect = document.getElementById('depth-select');
        if (depthSelect) {
            depthSelect.addEventListener('change', function() {
                state.currentDepth = this.value ? parseInt(this.value) : null;
                AppUtils.saveState('depth', {
                    currentBuoy: state.currentBuoy,
                    currentDepth: state.currentDepth
                });
                plotBuoysForDepth();
            });
        }
    }

    init();
}

window.initDepthPage = initDepthPage;