/**
 * MOD-AUTOMATION — DSL de condição (T-11-13)
 *
 * Schema Zod para validar `automation_condition.expr`.
 * Operadores mínimos definidos em docs/20-domain/15-automation.md §8:
 *   and, or, not, eq, neq, gte, lte, gt, lt, in, contains, has_tag
 *
 * A expressão é recursiva: operadores lógicos (and/or/not) contêm children;
 * operadores de comparação (eq/neq/gte/lte/gt/lt/in/contains/has_tag) são folha.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Operandos de comparação: string, number ou referência de campo ($path)
// ---------------------------------------------------------------------------

const operandSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

// ---------------------------------------------------------------------------
// Nós folha (comparação)
// ---------------------------------------------------------------------------

const eqExprSchema = z.object({
  op: z.literal('eq'),
  left: z.string().min(1),
  right: operandSchema,
})

const neqExprSchema = z.object({
  op: z.literal('neq'),
  left: z.string().min(1),
  right: operandSchema,
})

const gteExprSchema = z.object({
  op: z.literal('gte'),
  left: z.string().min(1),
  right: z.union([z.string(), z.number()]),
})

const lteExprSchema = z.object({
  op: z.literal('lte'),
  left: z.string().min(1),
  right: z.union([z.string(), z.number()]),
})

const gtExprSchema = z.object({
  op: z.literal('gt'),
  left: z.string().min(1),
  right: z.union([z.string(), z.number()]),
})

const ltExprSchema = z.object({
  op: z.literal('lt'),
  left: z.string().min(1),
  right: z.union([z.string(), z.number()]),
})

const inExprSchema = z.object({
  op: z.literal('in'),
  left: z.string().min(1),
  // values: array de primitivos
  values: z.array(operandSchema).min(1),
})

const containsExprSchema = z.object({
  op: z.literal('contains'),
  left: z.string().min(1),
  value: z.string().min(1),
})

const hasTagExprSchema = z.object({
  op: z.literal('has_tag'),
  tag: z.string().min(1),
})

// ---------------------------------------------------------------------------
// Nós lógicos (recursivos via z.lazy)
// docs/20-domain/15-automation.md §8: and, or têm children; not tem child.
// ---------------------------------------------------------------------------

// Declara o tipo inferido para z.lazy corretamente
export type ConditionExprInput =
  | z.infer<typeof eqExprSchema>
  | z.infer<typeof neqExprSchema>
  | z.infer<typeof gteExprSchema>
  | z.infer<typeof lteExprSchema>
  | z.infer<typeof gtExprSchema>
  | z.infer<typeof ltExprSchema>
  | z.infer<typeof inExprSchema>
  | z.infer<typeof containsExprSchema>
  | z.infer<typeof hasTagExprSchema>
  | { op: 'and'; children: ConditionExprInput[] }
  | { op: 'or'; children: ConditionExprInput[] }
  | { op: 'not'; child: ConditionExprInput }

// z.lazy permite recursão; o cast é necessário pois TypeScript não infere
// tipos recursivos nativamente pelo Zod — padrão documentado em Zod docs.
export const conditionExprSchema: z.ZodType<ConditionExprInput> = z.lazy(() =>
  z.union([
    // Lógicos
    z.object({
      op: z.literal('and'),
      children: z.array(conditionExprSchema).min(1),
    }),
    z.object({
      op: z.literal('or'),
      children: z.array(conditionExprSchema).min(1),
    }),
    z.object({
      op: z.literal('not'),
      child: conditionExprSchema,
    }),
    // Comparação
    eqExprSchema,
    neqExprSchema,
    gteExprSchema,
    lteExprSchema,
    gtExprSchema,
    ltExprSchema,
    inExprSchema,
    containsExprSchema,
    hasTagExprSchema,
  ]),
)
