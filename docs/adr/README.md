# Architecture Decision Records

Короткие записи о значимых архитектурных решениях: контекст, само решение и его
последствия. Формат — облегчённый [MADR](https://adr.github.io/madr/). Записи
иммутабельны: решение не переписывают, а при изменении добавляют новую ADR со
статусом, отменяющим прежнюю (`Supersedes` / `Superseded by`).

| # | Решение | Статус |
|---|---|---|
| [0001](0001-vite-vanilla.md) | Vite + Vanilla JS (без фреймворка) | Accepted |
| [0002](0002-modular-monolith.md) | Модульный монолит на бэкенде | Accepted |
| [0003](0003-token-in-memory.md) | Access-токен только в памяти вкладки | Accepted |
| [0004](0004-progressive-enhancement.md) | Прогрессивное улучшение (демо → API) | Accepted |
| [0005](0005-strict-csp.md) | Строгий CSP без `'unsafe-inline'` | Accepted |
| [0006](0006-audit-hash-chain.md) | Хеш-цепочка аудита с монотонным `seq` | Accepted |
| [0007](0007-runtime-config.md) | Рантайм-конфиг из env (один образ) | Accepted |
| [0008](0008-i18n.md) | Runtime-i18n: RU-источник + EN-словарь | Accepted |
| [0009](0009-phi-reporting-compliance.md) | Комплаенс отчётности по ПДн | Accepted |
