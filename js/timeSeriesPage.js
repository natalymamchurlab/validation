function initTimeSeriesPage(map) {
    const state = {
        map,
        geoObjects: [],
        buoyData: null,
        currentBuoy: null,
        currentDate: null
    };

    async function init() {
        // Данные и селекты не зависят от карты
        state.buoyData = await AppUtils.loadJSON(AppUtils.config.dataUrl);
        if (!state.buoyData) {
            showNotification('Не удалось загрузить данные буёв', 'error');
            return;
        }

        // 1. Приоритет — параметр ?buoy=NNNN из URL
        const urlBuoy = new URLSearchParams(window.location.search).get('buoy');
        if (urlBuoy && state.buoyData[urlBuoy]) {
            state.currentBuoy = urlBuoy;
            state.currentDate = null;
        } else {
            // 2. Иначе — из localStorage
            const savedState = AppUtils.getState('timeSeries');
            if (savedState) {
                state.currentBuoy = savedState.currentBuoy;
                state.currentDate = savedState.currentDate;
            }
        }

        initBuoySelector();
        if (state.currentBuoy) {
            updateDateSelector();
        }

        // Обработчики ставим ДО построения карты/графика — это важно
        setupEventListeners();

        // Карта рисуется, только если доступна
        if (state.currentBuoy) {
            plotBuoyTrack();
            if (state.currentDate) displayTemperatureProfile();
        }
    }

    function initBuoySelector() {
        if (!state.buoyData) return;

        const buoys = Object.keys(state.buoyData).sort();
        const options = buoys.map(buoy => ({ value: buoy, label: buoy }));
        AppUtils.initSelect('buoy-select', options, 'Выберите буй');

        if (state.currentBuoy && buoys.includes(state.currentBuoy)) {
            document.getElementById('buoy-select').value = state.currentBuoy;
        } else {
            state.currentBuoy = null;
        }
    }

    function updateDateSelector() {
        if (!state.currentBuoy || !state.buoyData[state.currentBuoy]) {
            document.getElementById('date-select').innerHTML = '<option value="">Нет данных</option>';
            return;
        }

        const dates = [...new Set(
            state.buoyData[state.currentBuoy].map(item => (item.timeM || '').split(' ')[0]).filter(Boolean)
        )].sort();

        const options = dates.map(date => ({ value: date, label: date }));
        AppUtils.initSelect('date-select', options, 'Выберите дату');

        if (state.currentDate && dates.includes(state.currentDate)) {
            document.getElementById('date-select').value = state.currentDate;
        } else if (dates.length > 0) {
            state.currentDate = dates[dates.length - 1];
            document.getElementById('date-select').value = state.currentDate;
            AppUtils.saveState('timeSeries', {
                currentBuoy: state.currentBuoy,
                currentDate: state.currentDate
            });
        }
    }

    function plotBuoyTrack() {
        // Если карты нет — просто выходим, график всё равно покажется
        if (!AppUtils.isMapReady(state.map)) return;
        if (!state.currentBuoy || !state.buoyData[state.currentBuoy]) return;

        state.map.geoObjects.removeAll();
        state.geoObjects = [];

        const buoyPoints = state.buoyData[state.currentBuoy];
        if (buoyPoints.length === 0) return;

        const coordinates = buoyPoints.map(point => [
            parseFloat(point.latA),
            parseFloat(point.lonA)
        ]).filter(([la, lo]) => isFinite(la) && isFinite(lo));

        if (coordinates.length > 1) {
            try {
                const polyline = new ymaps.Polyline(coordinates, {}, {
                    strokeColor: '#1E90FF',
                    strokeWidth: 3,
                    strokeOpacity: 0.7
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

            const date = (point.timeM || '').split(' ')[0];
            const tVal = point.tA != null ? point.tA : point.tM;

            const marker = AppUtils.createMarker(
                state.map,
                [la, lo],
                `Буй: ${state.currentBuoy}<br>Дата: ${point.timeM}<br>Глубина: ${point.zM} м<br>Температура: ${tVal != null ? tVal.toFixed(2) : 'N/A'}°C`,
                date === state.currentDate ? 'red' : 'blue',
                () => {
                    const sel = document.getElementById('date-select');
                    if (sel) sel.value = date;
                    state.currentDate = date;
                    AppUtils.saveState('timeSeries', {
                        currentBuoy: state.currentBuoy,
                        currentDate: state.currentDate
                    });
                    updateMarkers();
                    displayTemperatureProfile();
                }
            );
            if (marker) state.geoObjects.push(marker);
        });
    }

    function updateMarkers() {
        state.geoObjects.forEach(obj => {
            if (!obj || !obj.properties || !obj.properties.get) return;
            const balloonContent = obj.properties.get('balloonContent');
            if (!balloonContent) return;
            try {
                const date = balloonContent.split('<br>')[1].replace('Дата: ', '').split(' ')[0];
                const isSelectedDate = date === state.currentDate;
                obj.options.set('preset', isSelectedDate ? 'islands#redDotIcon' : 'islands#blueDotIcon');
            } catch (e) { /* ignore */ }
        });
    }

    function displayTemperatureProfile(point = null) {
        const plotContainer = document.getElementById('plot');
        if (!plotContainer) return;
        plotContainer.innerHTML = '<div class="loading">Загрузка профиля температуры...</div>';

        if (!state.currentBuoy || !state.currentDate) {
            plotContainer.innerHTML = '<div class="info">Выберите буй и дату для отображения профиля</div>';
            return;
        }

        if (!point) {
            const points = state.buoyData[state.currentBuoy].filter(
                p => (p.timeM || '').startsWith(state.currentDate));
            if (points.length > 0) point = points[0];
        }

        if (!point) {
            plotContainer.innerHTML = '<div class="error">Нет данных для отображения профиля температуры</div>';
            return;
        }

        const dateStr = (point.timeM || '').split(' ')[0];
        const imagePath = `images/time_series/profile_${dateStr}_buoy_${state.currentBuoy}.png`;

        const img = new Image();
        img.onload = function() {
            plotContainer.innerHTML = `
                <div class="plot-content">
                    <h3>Профиль температуры на ${dateStr}</h3>
                    <div class="plot-image">
                        <img src="${imagePath}" alt="Профиль температуры">
                    </div>
                    <div class="plot-meta">
                        <span><strong>Буй:</strong> ${state.currentBuoy}</span>
                        <span><strong>Дата:</strong> ${point.timeA || dateStr}</span>
                        <span><strong>Координаты:</strong> ${point.latA}°N, ${point.lonA}°E</span>
                    </div>
                    <div class="plot-info">
                        <p>График показывает вертикальное распределение температуры по глубине.</p>
                        <p>По оси X отображается температура (°C), по оси Y - глубина (м).</p>
                        <p>Профиль позволяет анализировать термоклин - слой быстрого изменения температуры.</p>
                    </div>
                </div>
            `;
        };
        img.onerror = function() {
            plotContainer.innerHTML = `
                <div class="plot-error">
                    <h3>Профиль температуры на ${dateStr}</h3>
                    <p class="error">Профиль температуры не доступен</p>
                    <p class="info">Возможные причины:</p>
                    <ul class="info">
                        <li>Данные для выбранной даты еще не обработаны</li>
                        <li>Отсутствуют измерения на разных глубинах для построения профиля</li>
                        <li>Попробуйте выбрать другую дату или буй</li>
                    </ul>
                    <div class="plot-meta">
                        <span><strong>Буй:</strong> ${state.currentBuoy}</span>
                        <span><strong>Дата:</strong> ${point.timeA || dateStr}</span>
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
                state.currentDate = null;
                AppUtils.saveState('timeSeries', {
                    currentBuoy: state.currentBuoy,
                    currentDate: state.currentDate
                });
                if (state.currentBuoy) {
                    updateDateSelector();
                    plotBuoyTrack();
                    if (state.currentDate) displayTemperatureProfile();
                } else {
                    document.getElementById('date-select').innerHTML = '<option value="">Выберите дату</option>';
                    const plot = document.getElementById('plot');
                    if (plot) plot.innerHTML = '<p class="info">Выберите буй для отображения данных</p>';
                }
            });
        }

        const dateSelect = document.getElementById('date-select');
        if (dateSelect) {
            dateSelect.addEventListener('change', function() {
                state.currentDate = this.value || null;
                AppUtils.saveState('timeSeries', {
                    currentBuoy: state.currentBuoy,
                    currentDate: state.currentDate
                });
                updateMarkers();
                displayTemperatureProfile();
            });
        }
    }

    init();
}

window.initTimeSeriesPage = initTimeSeriesPage;