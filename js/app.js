// Конфигурация приложения
const AppConfig = {
    dataUrl: 'data/buoy_data.json',
    mapDefaults: {
        center: [44.0, 35.0],
        zoom: 6,
        type: 'yandex#hybrid'
    }
};

// Предупреждение при открытии через file://
(function warnIfFileProtocol() {
    try {
        if (window.location && window.location.protocol === 'file:') {
            console.warn('Сайт открыт через file://. Для загрузки данных откройте через локальный HTTP-сервер.');
            window.addEventListener('DOMContentLoaded', () => {
                if (typeof showNotification === 'function') {
                    showNotification(
                        'Страница открыта как файл (file://). Откройте через локальный сервер, иначе данные могут не загрузиться.',
                        'error'
                    );
                }
            });
        }
    } catch (e) { /* ignore */ }
})();

// Сохранение состояния в localStorage
function saveAppState(page, state) {
    const fullState = JSON.parse(localStorage.getItem('argoAppState')) || {};
    fullState[page] = state;
    localStorage.setItem('argoAppState', JSON.stringify(fullState));
}

// Получение состояния из localStorage
function getAppState(page) {
    const fullState = JSON.parse(localStorage.getItem('argoAppState')) || {};
    return page ? fullState[page] : fullState;
}

// Загрузка данных JSON
async function loadJSON(url) {
    try {
        console.log(`Пытаюсь загрузить данные из: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Ошибка HTTP: ${response.status}`);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Данные успешно загружены:', data);
        return data;
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        showNotification('Ошибка загрузки данных. Проверьте консоль для подробностей.', 'error');
        return null;
    }
}

// Показать уведомление
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

// Проверка, доступна ли карта и API Яндекс.Карт
function isMapReady(map) {
    return !!(map && typeof ymaps !== 'undefined' && map.geoObjects);
}

// Создание маркера на карте (безопасно: ничего не делает, если карты нет)
function createMarker(map, position, title, color = 'blue', clickHandler = null) {
    if (!isMapReady(map)) return null;

    const presetByColor = {
        blue:   'islands#blueDotIcon',
        red:    'islands#redDotIcon',
        green:  'islands#greenDotIcon',
        yellow: 'islands#yellowDotIcon'
    };

    let marker;
    try {
        marker = new ymaps.Placemark(position, {
            balloonContent: title
        }, {
            preset: presetByColor[color] || 'islands#blueDotIcon'
        });
        map.geoObjects.add(marker);
        if (clickHandler) {
            marker.events.add('click', clickHandler);
        }
    } catch (e) {
        console.error('Ошибка создания маркера:', e);
        return null;
    }
    return marker;
}

// Очистка всех маркеров
function clearMarkers(geoObjects) {
    if (geoObjects && geoObjects.length) {
        geoObjects.forEach(obj => {
            try {
                if (obj && obj.geoObjects) {
                    obj.geoObjects.remove(obj);
                } else if (obj && obj.map && obj.map.geoObjects) {
                    obj.map.geoObjects.remove(obj);
                }
            } catch (e) { /* ignore */ }
        });
    }
}

// Инициализация select элемента
function initSelect(selectId, data, placeholder = 'Выберите значение') {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = `<option value="">${placeholder}</option>`;
    data.forEach(item => {
        const option = document.createElement('option');
        option.value = item.value;
        option.textContent = item.label;
        select.appendChild(option);
    });
}

// Экспорт функций
window.AppUtils = {
    config: AppConfig,
    saveState: saveAppState,
    getState: getAppState,
    loadJSON,
    showNotification,
    createMarker,
    clearMarkers,
    initSelect,
    isMapReady
};