# Архитектура

## Решение

GitHub Pages раздаёт интерфейс. Apps Script выполняет операции от имени владельца.
Google Таблица закрыта от участников; доступ к данным проходит через проверяемые серверные операции.
Цель — небольшие компании без отдельного платного сервера, не гарантированная доступность публичного SaaS.

## Транспорт: важная граница

Текущий рабочий диагностический путь: Pages открывает /exec в отдельной вкладке;
страница Apps Script вызывает serviceStatus через google.script.run. Междоменного fetch в каркасе нет.
Это позволяет не выдавать неподтверждённый CORS-доступ за готовый API.

До реализации комнат нужен отдельный spike: postMessage-мост через HTML Service
с проверкой точного origin, источника сообщения и корреляционного nonce, либо переход
в интерфейс Apps Script. Google использует вложенные sandbox iframe; простой
`event.source === iframe.contentWindow` без живой проверки недостаточен.
Нельзя обходить CORS через no-cors: непрозрачный ответ не подтверждает выполнение операции.
JSONP запрещён для личных данных и операций записи.
После выбора транспорта обновить CSP в web/index.html и добавить интеграционный smoke test.

## Правила сервера

Порядок будущей мутации: валидация → авторизация → лимиты → ScriptLock → чтение актуального
состояния → изменение → сохранение → ответ. Для повторяемых запросов нужен idempotency key.
Текущий status RPC имеет только выключатель и глобальный бюджет; пользователей в нём нет.
Все helpers Apps Script имеют суффикс `_`, чтобы не становиться открытыми RPC.

Бюджет хранится в одной Script Property, изменяется под ScriptLock и имеет фиксированные окна
по минуте и суткам UTC. Это лимит расходов приложения, не гарантия защиты Google quotas.

## Источники решений

- [Apps Script web apps](https://developers.google.com/apps-script/guides/web)
- [HTML Service RPC](https://developers.google.com/apps-script/guides/html/communication)
- [Content Service и redirects/JSONP](https://developers.google.com/apps-script/guides/content)
- [LockService](https://developers.google.com/apps-script/reference/lock)
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
