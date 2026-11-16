# ARGO NEMO Visualization (static site)

Это статический сайт (HTML/CSS/JS), который подгружает данные через `fetch()` из папки `data/`.

## Как правильно запускать локально

Важно: **не открывайте страницы двойным кликом** (то есть через `file://...`) — браузер часто блокирует `fetch()` к JSON, из‑за этого SST/SSH/ARGO выглядят “пустыми”.

Запускайте через локальный HTTP‑сервер.

### Вариант A (Python, самый простой)

В PowerShell из корня проекта:

```powershell
python -m http.server 8000
```

Открыть в браузере:
- `http://localhost:8000/index.html`

### Вариант B (Node.js)

```powershell
npx http-server . -p 8000
```

### Вариант C (скрипт PowerShell)

Можно запустить:

```powershell
.\serve.ps1
```

### Вариант D (Node.js без npm/npx)

Если у вас есть `node`, но нет `npm/npx`, используйте встроенный сервер проекта:

```powershell
node .\serve.js 8000
```

## Если не загружается карта ARGO

ARGO-страницы используют Яндекс.Карты. Если карта не появляется:
- проверьте доступ к `api-maps.yandex.ru` (сеть/прокси),
- проверьте валидность/ограничения API‑ключа в `argo-time-series.html` и `argo-depth-analysis.html`.

