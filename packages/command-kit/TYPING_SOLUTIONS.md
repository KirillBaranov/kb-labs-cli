# Решения для улучшения вывода типов флагов в defineSystemCommand

## Проблема

TypeScript не может автоматически вывести типы флагов из схемы в перегрузке `defineSystemCommand<TResult>`, потому что используется общий тип `FlagSchemaDefinition` вместо конкретного типа схемы.

## Решение 1: Использование `satisfies` оператора (TypeScript 4.9+)

**Преимущества:**
- Сохраняет literal types из схемы
- TypeScript может вывести типы из схемы
- Не требует дополнительных helper types

**Реализация:**

```typescript
// В define-system-command.ts
export function defineSystemCommand<TResult extends CommandResult>(
  config: {
    name: string;
    description: string;
    longDescription?: string;
    category?: string;
    aliases?: string[];
    examples?: string[];
    flags: FlagSchemaDefinition;
    analytics?: Omit<TrackingConfig, 'command'> & { command?: string };
    handler: <TFlags extends FlagSchemaDefinition>(
      ctx: EnhancedCliContext,
      argv: string[],
      flags: InferFlags<TFlags>
    ) => Promise<number | TResult> | number | TResult;
    formatter?: <TFlags extends FlagSchemaDefinition>(
      result: TResult,
      ctx: EnhancedCliContext,
      flags: InferFlags<TFlags>
    ) => void;
  }
): Command;
```

**Использование:**

```typescript
export const wfList = defineSystemCommand<WorkflowListResult>({
  name: 'list',
  description: 'List all discovered workflows',
  flags: {
    source: { type: 'string', default: 'all' },
    tag: { type: 'string' },
    json: { type: 'boolean' },
  } satisfies FlagSchemaDefinition, // Сохраняет literal types
  async handler(ctx, argv, flags) {
    // flags.source имеет тип string (не unknown!)
    // flags.tag имеет тип string | undefined
    // flags.json имеет тип boolean
    const source = flags.source; // string
    const tag = flags.tag; // string | undefined
    return { ok: true, workflows: [], total: 0 };
  },
});
```

**Ограничения:**
- Требует TypeScript 4.9+
- Нужно явно указывать `satisfies FlagSchemaDefinition`

---

## Решение 2: Helper type с `typeof` для вывода типов

**Преимущества:**
- Работает с любыми версиями TypeScript
- Чистый синтаксис без `satisfies`
- Автоматический вывод типов

**Реализация:**

```typescript
// В define-system-command.ts
/**
 * Helper type для вывода типов флагов из схемы
 */
export type InferFlagsFromSchema<T extends FlagSchemaDefinition> = InferFlags<T>;

/**
 * Helper функция для создания команды с автоматическим выводом типов
 */
export function createSystemCommand<
  TFlags extends FlagSchemaDefinition,
  TResult extends CommandResult
>(
  config: SystemCommandConfig<TFlags, TResult>
): Command {
  return defineSystemCommand<TFlags, TResult>(config);
}

// Перегрузка с helper type
export function defineSystemCommand<TResult extends CommandResult>(
  config: {
    name: string;
    description: string;
    longDescription?: string;
    category?: string;
    aliases?: string[];
    examples?: string[];
    flags: FlagSchemaDefinition;
    analytics?: Omit<TrackingConfig, 'command'> & { command?: string };
    handler: <TFlags extends FlagSchemaDefinition>(
      ctx: EnhancedCliContext,
      argv: string[],
      flags: InferFlagsFromSchema<TFlags>
    ) => Promise<number | TResult> | number | TResult;
    formatter?: <TFlags extends FlagSchemaDefinition>(
      result: TResult,
      ctx: EnhancedCliContext,
      flags: InferFlagsFromSchema<TFlags>
    ) => void;
  }
): Command;
```

**Использование:**

```typescript
// Вариант 1: Использование helper функции
const flagsSchema = {
  source: { type: 'string', default: 'all' },
  tag: { type: 'string' },
  json: { type: 'boolean' },
} as const;

export const wfList = createSystemCommand<
  typeof flagsSchema,
  WorkflowListResult
>({
  name: 'list',
  description: 'List all discovered workflows',
  flags: flagsSchema,
  async handler(ctx, argv, flags) {
    // flags.source имеет тип string
    // flags.tag имеет тип string | undefined
    // flags.json имеет тип boolean
    return { ok: true, workflows: [], total: 0 };
  },
});
```

**Ограничения:**
- Требует определения схемы отдельно или использования `as const`
- Нужно явно указывать тип схемы в generic параметре

---

## Решение 3: Улучшенная перегрузка с conditional types

**Преимущества:**
- Автоматический вывод типов из схемы
- Не требует дополнительных helper types
- Работает с любыми версиями TypeScript

**Реализация:**

```typescript
// В define-system-command.ts
/**
 * Перегрузка для автоматического вывода типов из схемы
 */
export function defineSystemCommand<
  TResult extends CommandResult,
  TFlags extends FlagSchemaDefinition = FlagSchemaDefinition
>(
  config: {
    name: string;
    description: string;
    longDescription?: string;
    category?: string;
    aliases?: string[];
    examples?: string[];
    flags: TFlags;
    analytics?: Omit<TrackingConfig, 'command'> & { command?: string };
    handler: CommandHandler<InferFlags<TFlags>, TResult>;
    formatter?: CommandFormatter<InferFlags<TFlags>, TResult>;
  }
): Command;
```

**Использование:**

```typescript
export const wfList = defineSystemCommand<WorkflowListResult>({
  name: 'list',
  description: 'List all discovered workflows',
  flags: {
    source: { type: 'string', default: 'all' },
    tag: { type: 'string' },
    json: { type: 'boolean' },
  } as const, // Сохраняет literal types
  async handler(ctx, argv, flags) {
    // TypeScript выводит типы из схемы
    // flags.source имеет тип string
    // flags.tag имеет тип string | undefined
    // flags.json имеет тип boolean
    return { ok: true, workflows: [], total: 0 };
  },
});
```

**Ограничения:**
- Требует `as const` для схемы флагов
- Может не работать идеально во всех случаях

---

## Решение 4: Двухэтапный подход с явным определением схемы

**Преимущества:**
- Полный контроль над типами
- Явная типизация схемы
- Работает с любыми версиями TypeScript

**Реализация:**

```typescript
// Без изменений в define-system-command.ts
// Используем существующую перегрузку с явным указанием типа флагов
```

**Использование:**

```typescript
// Шаг 1: Определяем схему флагов
const wfListFlags = {
  source: { type: 'string' as const, default: 'all' },
  tag: { type: 'string' as const },
  json: { type: 'boolean' as const },
} satisfies FlagSchemaDefinition;

// Шаг 2: Используем тип схемы в команде
export const wfList = defineSystemCommand<
  typeof wfListFlags,
  WorkflowListResult
>({
  name: 'list',
  description: 'List all discovered workflows',
  flags: wfListFlags,
  async handler(ctx, argv, flags) {
    // flags.source имеет тип string
    // flags.tag имеет тип string | undefined
    // flags.json имеет тип boolean
    return { ok: true, workflows: [], total: 0 };
  },
});
```

**Ограничения:**
- Требует определения схемы отдельно
- Более многословный синтаксис

---

## Решение 5: Использование `defineFlags` helper для вывода типов

**Преимущества:**
- Использует существующий `defineFlags` helper
- Автоматический вывод типов через `schema.infer`
- Чистый синтаксис

**Реализация:**

```typescript
// В define-system-command.ts
import { defineFlags, type FlagSchemaWithInfer } from './flags/index.js';

/**
 * Перегрузка с использованием defineFlags для вывода типов
 */
export function defineSystemCommand<
  TResult extends CommandResult,
  TFlags extends FlagSchemaDefinition
>(
  config: {
    name: string;
    description: string;
    longDescription?: string;
    category?: string;
    aliases?: string[];
    examples?: string[];
    flags: FlagSchemaWithInfer<TFlags> | TFlags;
    analytics?: Omit<TrackingConfig, 'command'> & { command?: string };
    handler: CommandHandler<InferFlags<TFlags>, TResult>;
    formatter?: CommandFormatter<InferFlags<TFlags>, TResult>;
  }
): Command;
```

**Использование:**

```typescript
// Вариант 1: Использование defineFlags
const flagsSchema = defineFlags({
  source: { type: 'string', default: 'all' },
  tag: { type: 'string' },
  json: { type: 'boolean' },
});

export const wfList = defineSystemCommand<
  typeof flagsSchema.schema,
  WorkflowListResult
>({
  name: 'list',
  description: 'List all discovered workflows',
  flags: flagsSchema.schema,
  async handler(ctx, argv, flags) {
    // flags.source имеет тип string
    // flags.tag имеет тип string | undefined
    // flags.json имеет тип boolean
    return { ok: true, workflows: [], total: 0 };
  },
});

// Вариант 2: Прямое использование схемы
export const wfList = defineSystemCommand<
  { source: { type: 'string'; default: 'all' }; tag: { type: 'string' }; json: { type: 'boolean' } },
  WorkflowListResult
>({
  name: 'list',
  description: 'List all discovered workflows',
  flags: {
    source: { type: 'string', default: 'all' },
    tag: { type: 'string' },
    json: { type: 'boolean' },
  },
  async handler(ctx, argv, flags) {
    // flags.source имеет тип string
    // flags.tag имеет тип string | undefined
    // flags.json имеет тип boolean
    return { ok: true, workflows: [], total: 0 };
  },
});
```

**Ограничения:**
- Требует явного указания типа схемы в generic параметре
- Более многословный синтаксис

---

## Рекомендация

**Лучшее решение: Комбинация Решения 1 и Решения 3**

Использовать улучшенную перегрузку с `satisfies` оператором для автоматического вывода типов:

```typescript
export function defineSystemCommand<
  TResult extends CommandResult,
  TFlags extends FlagSchemaDefinition = FlagSchemaDefinition
>(
  config: {
    name: string;
    description: string;
    longDescription?: string;
    category?: string;
    aliases?: string[];
    examples?: string[];
    flags: TFlags;
    analytics?: Omit<TrackingConfig, 'command'> & { command?: string };
    handler: CommandHandler<InferFlags<TFlags>, TResult>;
    formatter?: CommandFormatter<InferFlags<TFlags>, TResult>;
  }
): Command;
```

**Использование с `satisfies`:**

```typescript
export const wfList = defineSystemCommand<WorkflowListResult>({
  name: 'list',
  description: 'List all discovered workflows',
  flags: {
    source: { type: 'string', default: 'all' },
    tag: { type: 'string' },
    json: { type: 'boolean' },
  } satisfies FlagSchemaDefinition,
  async handler(ctx, argv, flags) {
    // TypeScript выводит типы из схемы
    const source = flags.source; // string
    const tag = flags.tag; // string | undefined
    return { ok: true, workflows: [], total: 0 };
  },
});
```

**Преимущества:**
- Автоматический вывод типов из схемы
- Чистый синтаксис с `satisfies`
- Работает в IDE с live compile
- Не требует дополнительных helper types

