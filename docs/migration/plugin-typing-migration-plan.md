# План миграции плагинов на типизацию

**Дата создания:** 2025-11-20  
**Статус:** Планирование  
**Приоритет:** Высокий

## Цель

Мигрировать все плагины на использование строгой типизации флагов и результатов в `defineCommand`, следуя стандартам, установленным для системных команд.

## Текущее состояние

### Проблемы

1. **Отсутствие типизации флагов**: Все плагины используют `defineCommand` без явных типов флагов
2. **Отсутствие типизации результатов**: Нет явных типов результатов команд
3. **Использование `any` типов**: `ctx: any`, `argv: any`, `flags: any` в handler функциях
4. **`@ts-expect-error` комментарии**: Временные обходные пути из-за отсутствия типов
5. **Небезопасные type assertions**: Множественные `as string`, `as boolean` и т.д.

### Статистика

- **Всего плагинов с командами:** ~8-10
- **Всего команд:** ~50-60
- **Плагины:**
  - `@kb-labs/release-cli` (~7 команд)
  - `@kb-labs/mind-cli` (~9 команд)
  - `@kb-labs/audit-cli` (~4 команды)
  - `@kb-labs/analytics-cli` (~8 команд)
  - `@kb-labs/core-cli` (~12 команд)
  - `@kb-labs/ai-review-plugin` (~1 команда)
  - `@kb-labs/ai-docs-plugin` (~5 команд)
  - `@kb-labs/ai-tests-plugin` (~6 команд)

## Стандарт миграции

### Целевое состояние

```typescript
// 1. Определить тип флагов
type ReleasePlanFlags = {
  scope: { type: 'string'; description?: string };
  profile: { type: 'string'; description?: string };
  bump: { type: 'string'; description?: string; choices?: readonly string[]; default?: string };
  strict: { type: 'boolean'; description?: string; default?: boolean };
  json: { type: 'boolean'; description?: string; default?: boolean };
};

// 2. Определить тип результата
type ReleasePlanResult = CommandResult & {
  plan?: ReleasePlan;
  packagesCount?: number;
  strategy?: string;
};

// 3. Использовать типы в defineCommand
export const planCommand = defineCommand<ReleasePlanFlags, ReleasePlanResult>({
  name: 'release:plan',
  flags: {
    scope: { type: 'string', description: 'Package scope (glob pattern)' },
    profile: { type: 'string', description: 'Release profile to use' },
    bump: { 
      type: 'string', 
      description: 'Version bump strategy',
      choices: ['patch', 'minor', 'major', 'auto'] as const,
      default: 'auto',
    },
    strict: { type: 'boolean', description: 'Fail on any check failure', default: false },
    json: { type: 'boolean', description: 'Print plan as JSON', default: false },
  },
  async handler(ctx, argv, flags) {
    // Теперь flags типизированы автоматически!
    const scope = flags.scope; // string | undefined
    const bump = flags.bump; // string (есть default)
    const strict = flags.strict; // boolean (есть default)
    
    // ... логика команды
    
    return { ok: true, plan, packagesCount: plan.packages.length };
  },
});
```

### Преимущества

- ✅ Полная типобезопасность флагов и результатов
- ✅ Автодополнение в IDE
- ✅ Проверка типов на этапе компиляции
- ✅ Устранение `@ts-expect-error` комментариев
- ✅ Устранение небезопасных type assertions
- ✅ Единообразие с системными командами

## Этапы миграции

### Этап 1: Подготовка (1-2 дня)

**Задачи:**
- [ ] Создать шаблон миграции для команды
- [ ] Написать документацию по миграции
- [ ] Подготовить примеры миграции для каждого типа команды
- [ ] Создать чеклист для проверки миграции

**Результат:** Готовые инструменты и документация для миграции

### Этап 2: Пилотная миграция (2-3 дня)

**Выбрать один простой плагин для пилота:**
- Рекомендуется: `@kb-labs/audit-cli` (4 команды, относительно простые)

**Задачи:**
- [ ] Мигрировать все команды плагина
- [ ] Убедиться, что типы работают корректно
- [ ] Проверить, что нет ошибок компиляции
- [ ] Протестировать команды вручную
- [ ] Задокументировать найденные проблемы и решения

**Результат:** Полностью мигрированный плагин и обновленная документация

### Этап 3: Массовая миграция (1-2 недели)

**Приоритет миграции:**

1. **Высокий приоритет** (критичные плагины):
   - `@kb-labs/release-cli` (7 команд)
   - `@kb-labs/mind-cli` (9 команд)
   - `@kb-labs/core-cli` (12 команд)

2. **Средний приоритет** (часто используемые):
   - `@kb-labs/audit-cli` (4 команды) - уже мигрирован в пилоте
   - `@kb-labs/analytics-cli` (8 команд)
   - `@kb-labs/ai-review-plugin` (1 команда)

3. **Низкий приоритет** (менее критичные):
   - `@kb-labs/ai-docs-plugin` (5 команд)
   - `@kb-labs/ai-tests-plugin` (6 команд)

**Задачи для каждого плагина:**
- [ ] Создать типы флагов для всех команд
- [ ] Создать типы результатов для всех команд
- [ ] Обновить `defineCommand` вызовы с типами
- [ ] Удалить `@ts-expect-error` комментарии
- [ ] Удалить `any` типы из handler функций
- [ ] Удалить небезопасные type assertions
- [ ] Проверить компиляцию TypeScript
- [ ] Протестировать команды вручную
- [ ] Обновить документацию плагина (если есть)

**Результат:** Все плагины мигрированы на типизацию

### Этап 4: Финализация (2-3 дня)

**Задачи:**
- [ ] Провести финальную проверку всех плагинов
- [ ] Убедиться, что нет оставшихся `@ts-expect-error`
- [ ] Убедиться, что нет оставшихся `any` типов
- [ ] Обновить общую документацию
- [ ] Создать ADR (Architecture Decision Record) о завершении миграции
- [ ] Обновить шаблон плагина (`kb-labs-plugin-template`)

**Результат:** Полностью завершенная миграция

## Чеклист миграции для одной команды

### Подготовка

- [ ] Прочитать текущую реализацию команды
- [ ] Определить все используемые флаги
- [ ] Определить структуру результата команды
- [ ] Найти все использования `as` assertions для флагов

### Миграция

- [ ] Создать тип флагов (`XxxFlags`)
- [ ] Создать тип результата (`XxxResult`)
- [ ] Обновить `defineCommand` с типами: `defineCommand<XxxFlags, XxxResult>`
- [ ] Обновить сигнатуру handler: убрать `any`, использовать типизированные параметры
- [ ] Удалить все `@ts-expect-error` комментарии
- [ ] Удалить все `as` assertions для флагов
- [ ] Убедиться, что TypeScript компилируется без ошибок

### Проверка

- [ ] Проверить автодополнение в IDE для флагов
- [ ] Проверить автодополнение в IDE для результата
- [ ] Запустить команду вручную и проверить работу
- [ ] Проверить JSON режим (если есть)
- [ ] Проверить все флаги по отдельности

## Примеры миграции

### Пример 1: Простая команда с несколькими флагами

**До:**
```typescript
export const runCommand = defineCommand({
  name: 'audit:run',
  flags: {
    scope: { type: 'string', description: 'Package scope' },
    strict: { type: 'boolean', description: 'Fail on any breach', default: false },
    json: { type: 'boolean', description: 'JSON output', default: false },
  },
  async handler(ctx: any, argv: any, flags: any) {
    const scope = flags.scope as string | undefined;
    const strict = flags.strict as boolean;
    // ...
    return { ok: true };
  },
});
```

**После:**
```typescript
type AuditRunFlags = {
  scope: { type: 'string'; description?: string };
  strict: { type: 'boolean'; description?: string; default?: boolean };
  json: { type: 'boolean'; description?: string; default?: boolean };
};

type AuditRunResult = CommandResult & {
  checksRun?: number;
  issuesFound?: number;
};

export const runCommand = defineCommand<AuditRunFlags, AuditRunResult>({
  name: 'audit:run',
  flags: {
    scope: { type: 'string', description: 'Package scope' },
    strict: { type: 'boolean', description: 'Fail on any breach', default: false },
    json: { type: 'boolean', description: 'JSON output', default: false },
  },
  async handler(ctx, argv, flags) {
    // flags.scope: string | undefined (типизировано автоматически!)
    // flags.strict: boolean (есть default)
    // flags.json: boolean (есть default)
    const scope = flags.scope;
    const strict = flags.strict;
    // ...
    return { ok: true, checksRun: 10, issuesFound: 2 };
  },
});
```

### Пример 2: Команда с choices

**До:**
```typescript
export const planCommand = defineCommand({
  name: 'release:plan',
  flags: {
    bump: {
      type: 'string',
      description: 'Version bump strategy',
      choices: ['patch', 'minor', 'major', 'auto'] as const,
      default: 'auto',
    },
  },
  async handler(ctx: any, argv: any, flags: any) {
    const bump = flags.bump as 'patch' | 'minor' | 'major' | 'auto';
    // ...
  },
});
```

**После:**
```typescript
type ReleasePlanFlags = {
  bump: { 
    type: 'string'; 
    description?: string; 
    choices?: readonly string[]; 
    default?: string;
  };
};

export const planCommand = defineCommand<ReleasePlanFlags, ReleasePlanResult>({
  name: 'release:plan',
  flags: {
    bump: {
      type: 'string',
      description: 'Version bump strategy',
      choices: ['patch', 'minor', 'major', 'auto'] as const,
      default: 'auto',
    },
  },
  async handler(ctx, argv, flags) {
    // flags.bump: string (есть default, choices проверяются в runtime)
    const bump = flags.bump;
    // ...
  },
});
```

### Пример 3: Команда с массивом флагов

**До:**
```typescript
export const runCommand = defineCommand({
  name: 'test:run',
  flags: {
    files: {
      type: 'array',
      description: 'Test files to run',
    },
  },
  async handler(ctx: any, argv: any, flags: any) {
    const files = (flags.files as string[]) || [];
    // ...
  },
});
```

**После:**
```typescript
type TestRunFlags = {
  files: { type: 'array'; description?: string };
};

type TestRunResult = CommandResult & {
  testsRun?: number;
  passed?: number;
  failed?: number;
};

export const runCommand = defineCommand<TestRunFlags, TestRunResult>({
  name: 'test:run',
  flags: {
    files: {
      type: 'array',
      description: 'Test files to run',
    },
  },
  async handler(ctx, argv, flags) {
    // flags.files: string[] | undefined
    const files = flags.files || [];
    // ...
    return { ok: true, testsRun: files.length, passed: 5, failed: 1 };
  },
});
```

## Риски и митигация

### Риск 1: Несовместимость типов с существующим кодом

**Митигация:**
- Типы опциональны - можно мигрировать постепенно
- Старый код продолжит работать
- Можно использовать `as` для временных переходов

### Риск 2: Сложность определения типов для сложных команд

**Митигация:**
- Начать с простых команд
- Использовать примеры из системных команд
- Консультироваться с командой при необходимости

### Риск 3: Время на миграцию

**Митигация:**
- Разбить на этапы
- Мигрировать по одному плагину за раз
- Не блокировать другие задачи

## Метрики успеха

- ✅ 100% команд используют типизацию флагов
- ✅ 100% команд используют типизацию результатов
- ✅ 0 `@ts-expect-error` комментариев в командах
- ✅ 0 `any` типов в handler функциях
- ✅ Все команды компилируются без ошибок TypeScript
- ✅ Все команды протестированы вручную

## Временные рамки

- **Этап 1 (Подготовка):** 1-2 дня
- **Этап 2 (Пилот):** 2-3 дня
- **Этап 3 (Массовая миграция):** 1-2 недели (в зависимости от доступности)
- **Этап 4 (Финализация):** 2-3 дня

**Итого:** ~2-3 недели

## Ответственные

- **Координатор миграции:** [TBD]
- **Разработчики:** Команда KB Labs
- **Ревьюеры:** [TBD]

## Следующие шаги

1. [ ] Утвердить план миграции
2. [ ] Назначить координатора миграции
3. [ ] Начать Этап 1 (Подготовка)
4. [ ] Выбрать плагин для пилота (Этап 2)

---

**Последнее обновление:** 2025-11-20

