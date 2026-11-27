# Модель данных (проект, ещё не реализован)

Закрытая Google Таблица, доступ только у владельца deployment.

| Лист | Поля |
| --- | --- |
| Rooms | roomId, title, budget, giftDate, status, organizerTokenHash, createdAt, expiresAt, schemaVersion |
| Participants | roomId, participantId, name, wishes, participantTokenHash, createdAt |
| Exclusions | roomId, giverId, recipientId |
| Draws | roomId, giverId, recipientId, drawVersion, createdAt |
| Requests | scopeId, idempotencyKeyHash, action, resultReference, expiresAt |

Все даты — ISO 8601 UTC. ID и секреты не выводятся из имён.
Токены генерируются криптографически стойким способом; способ генерации и хранения
нужно подтвердить до реализации. В таблице хранятся только хеши токенов.
Токен участника не позволяет получить остальные строки листа.

Пользовательские строки при записи обязаны экранировать формулы Google Sheets
(например, начальные =, +, -, @); тестировать запись и чтение в реальной таблице.
Пожелания выводятся как текст, не HTML.
ScriptLock защищает изменение состава и жеребьёвку. Обычная запись Sheets не является
транзакцией: жеребьёвка публикуется только после полной проверки и фиксации версии.

Предлагаемый TTL комнаты — 90 дней с последующим удалением всех связанных строк.
Фоновая очистка и восстановление после частичной записи должны быть реализованы до MVP.
В каркасе нет обращения к SpreadsheetApp и не запрашивается доступ к таблицам.
