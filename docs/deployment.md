# Развёртывание

## GitHub Pages

1. Создать пустой GitHub repository secret-santa (при GitHub Pro можно приватный; сайт будет публичным).
2. Добавить origin и отправить main. Локальная инициализация проекта не создаёт repository в GitHub.
3. Settings → Pages → Source: GitHub Actions.
4. После публикации Apps Script добавить Actions repository variable APPS_SCRIPT_URL — публичный /exec URL.
5. Запустить Publish Pages вручную или отправить новый коммит в main.
6. Проверить сайт по project URL: CSS и JS должны загружаться по относительным путям.

Workflow сначала выполняет проверки, затем собирает и публикует только dist/.
Apps Script, docs и tests на Pages не копируются. Публикация backend не автоматизирована:
OAuth credentials не требуются для CI и не хранятся в GitHub.
Защитить main обязательным Checks / verify и review по необходимости.

## Google Apps Script

1. Создать отдельный проект на script.google.com. Реальная Google Таблица понадобится на этапе комнат.
2. В Project Settings включить отображение appsscript.json. Скопировать backend/appsscript.json,
   Code.gs, Budget.gs и HTML-файл Status (содержимое Status.html).
3. Добавить Script Properties из operations.md; сначала оставить SERVICE_ENABLED=false.
4. Deploy → New deployment → Web app → Execute as: Me → доступ: Anyone.
   Если аккаунт/организация запрещает анонимный доступ, эта схема требует другого аккаунта или авторизации.
5. Авторизовать только заявленные разрешения. Текущий manifest запрашивает script.storage;
   разрешения Google Sheets будут добавлены при реализации хранилища.
6. Сохранить /exec URL в APPS_SCRIPT_URL. /dev не подходит для участников.
7. Вручную установить SERVICE_ENABLED=true и проверить статус.

Изменение файлов требует новой версии deployment (Deploy → Manage deployments → Edit → New version).
Обновление Pages само по себе не обновляет Apps Script.

## Smoke checks перед запуском

- Открыть Pages на компьютере и телефоне, проверить клавиатуру и отсутствие ошибок загрузки.
- В анонимном окне открыть ссылку диагностики, нажать «Проверить»: «Сервис доступен».
- Выключить сервис: MAINTENANCE без stack trace.
- На отдельном тестовом deployment выставить REQUESTS_PER_MINUTE=1: второй запрос даёт RATE_LIMITED.
- Выставить REQUESTS_PER_DAY=1: после допуска второй запрос даёт DAILY_LIMIT; восстановить конфигурацию.
- Проверить параллельные вызовы: состояние бюджета не теряется.
- Протестировать RPC failure/таймаут без автоповторов. Не исчерпывать настоящую квоту ради проверки.

Локальные mocks не подтверждают доступность Google, разрешения, browser transport или квоты.
Полный тест регистрации и жеребьёвки добавится после их реализации.

## Откат

Pages: revert проблемного коммита и повторная публикация.
Apps Script: переключить deployment на предыдущую проверенную версию, затем smoke check.
При необходимости сначала выключить сервис. Версии frontend/backend должны оставаться совместимыми.
