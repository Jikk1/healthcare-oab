# OmniRisk — универсальная система прогнозирования рисков

Модуль реализует концепцию из ТЗ «Разработка универсальной системы прогнозирования
рисков развития всех известных медицинских патологий» как **дополнение** к
существующему бэкенду HealthCareOAB+. Это детерминированный, объяснимый,
полностью тестируемый ансамбль (а не обучаемая нейросеть): он повторяет
**архитектуру и выход** из плана в виде прозрачной аддитивно-выживаемостной
модели. Коэффициенты иллюстративные и подлежат калибровке на реальных когортах.

> Инструмент **поддержки принятия решений**, не диагностическое устройство.

## Соответствие разделов плана и файлов

| Раздел плана | Реализация |
|---|---|
| **Входные данные** (геном, эпигенетика, протеомика, метаболомика, микробиом, лаборатория, ЭМК, семья, образ жизни, носимые, соц./эко.) | [`domain/health-profile.ts`](domain/health-profile.ts) — типы профиля; [`domain/feature-space.ts`](domain/feature-space.ts) — нормировка в единый вектор сигналов |
| **Моделируемые заболевания** (каталог ICD-11, 17 категорий, субклинические формы) | [`domain/disease-catalog.ts`](domain/disease-catalog.ts) — расширяемый каталог нозологий с чувствительностями |
| **Архитектура ИИ → Слой №1** (трансформеры ЭМК) | [`domain/layers/transformer-layer.ts`](domain/layers/transformer-layer.ts) |
| **Слой №2** (графовые сети: Пациент↔Ген↔Белок↔…↔Болезнь) | [`domain/layers/graph-layer.ts`](domain/layers/graph-layer.ts) |
| **Слой №3** (модели временных рядов) | [`domain/layers/temporal-layer.ts`](domain/layers/temporal-layer.ts) |
| **Слой №4** (модели выживаемости: Cox / Deep Survival) | [`domain/layers/survival-layer.ts`](domain/layers/survival-layer.ts) |
| **Слой №5** (причинно-следственный ИИ, контрфактика) | [`domain/layers/causal-layer.ts`](domain/layers/causal-layer.ts) |
| **Слой №6** (мультимодальное объединение) | [`domain/layers/multimodal-fusion.ts`](domain/layers/multimodal-fusion.ts) |
| **Цифровой двойник человека** (системы организма, реакция на лечение) | [`domain/digital-twin.ts`](domain/digital-twin.ts) |
| **Основная цель** (горизонты 1/3/5/10/20/пожизненно, продолжительность жизни и здоровья, инвалидизация) | [`domain/layers/survival-layer.ts`](domain/layers/survival-layer.ts) + [`domain/life-expectancy.ts`](domain/life-expectancy.ts) |
| **Выход модели** (вероятность, возраст дебюта, CI, уровень, драйверы, динамика, влияние вмешательств) | [`domain/omni-risk-engine.ts`](domain/omni-risk-engine.ts) — оркестратор + `simulateIntervention` |
| **Объяснимость ИИ** (SHAP, attention, causal attribution) | [`domain/explainability.ts`](domain/explainability.ts) |
| **Обновление модели** (непрерывное/федеративное обучение, версионирование) | [`domain/model-registry.ts`](domain/model-registry.ts) |
| **Безопасность и этика** (анонимизация, дифф. приватность, защита генетики, k-анонимность) | [`domain/privacy.ts`](domain/privacy.ts) |
| API + валидация входа + аудит | [`prediction.routes.ts`](prediction.routes.ts), [`prediction.schema.ts`](prediction.schema.ts), [`prediction.service.ts`](prediction.service.ts) |

## API

Все маршруты требуют аутентификации (Bearer-токен). Ответы в общем конверте `{ data, meta }`.

| Метод | Путь | Назначение |
|---|---|---|
| `GET`  | `/v1/predict/model` | Паспорт модели (слои, метрики, режим обучения, ограничения) |
| `GET`  | `/v1/predict/catalog` | Каталог категорий и заболеваний |
| `POST` | `/v1/predict` | Прогноз по мультимодальному профилю (тело — `HealthProfile`) |
| `POST` | `/v1/predict/intervention` | Контрфактическое моделирование (`{ profile, overrides }`) |
| `GET`  | `/v1/patients/:id/predict` | Прогноз для пациента из БД (профиль из сохранённых биомаркеров) |

Пример:

```bash
curl -X POST http://localhost:8080/v1/predict \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{
    "ageYears": 64, "sex": "MALE",
    "genomic": { "prs": { "CARDIOVASCULAR": 2.1 }, "monogenic": ["LDLR"] },
    "labs": { "systolicBp": 165, "ldl": 5.2, "hba1c": 6.4, "bmi": 31 },
    "lifestyle": { "smokingStatus": "CURRENT", "packYears": 30, "activityPerWeek": 0 }
  }'
```

## Фронтенд

Самодостаточная страница `predict.html` + `predict.js` (в корне репозитория) с
клиентским портом движка [`/omnirisk.js`](../../../../omnirisk.js): работает в
браузере без бэкенда и БД, мат. ядро синхронизировано с этим модулем.

## Тесты

[`test/omni-risk-engine.test.ts`](../../../test/omni-risk-engine.test.ts) — детерминизм,
монотонность, границы вероятностей, расширение CI при неполных данных,
объяснимость, цифровой двойник и контрфактические вмешательства.

```bash
npm test            # весь набор (включая OmniRisk)
npx vitest run test/omni-risk-engine.test.ts
```
