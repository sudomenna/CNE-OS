// Função pura — sem I/O, sem DB.
// Avalia expressões DSL JSON recursivas contra um contexto em tempo de execução.

// ---------------------------------------------------------------------------
// Tipos do DSL
// ---------------------------------------------------------------------------

export type LogicalAndExpr = { and: ConditionExpr[] };
export type LogicalOrExpr = { or: ConditionExpr[] };
export type LogicalNotExpr = { not: ConditionExpr };

export type EqExpr = { eq: [string, unknown] };
export type NeqExpr = { neq: [string, unknown] };
export type GteExpr = { gte: [string, unknown] };
export type LteExpr = { lte: [string, unknown] };
export type GtExpr = { gt: [string, unknown] };
export type LtExpr = { lt: [string, unknown] };
export type InExpr = { in: [string, unknown[]] };
export type ContainsExpr = { contains: [string, string] };

export type HasTagExpr = { has_tag: string };

export type LogicalExpr = LogicalAndExpr | LogicalOrExpr | LogicalNotExpr;
export type ComparisonExpr =
  | EqExpr
  | NeqExpr
  | GteExpr
  | LteExpr
  | GtExpr
  | LtExpr
  | InExpr
  | ContainsExpr;

export type ConditionExpr = LogicalExpr | ComparisonExpr | HasTagExpr;

// ---------------------------------------------------------------------------
// Resolução de campo com dot-notation
// ---------------------------------------------------------------------------

/**
 * Resolve "$campo" ou "$contact.email" contra ctx.
 * Retorna undefined se campo não existir ou expr não começar com "$".
 */
function resolveField(expr: string, ctx: Record<string, unknown>): unknown {
  if (typeof expr !== "string" || !expr.startsWith("$")) {
    return undefined;
  }
  const path = expr.slice(1); // remove "$"
  const parts = path.split(".");
  let current: unknown = ctx;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ---------------------------------------------------------------------------
// Type guards para cada nó do DSL
// ---------------------------------------------------------------------------

function isLogicalAnd(expr: ConditionExpr): expr is LogicalAndExpr {
  return "and" in expr && Array.isArray((expr as LogicalAndExpr).and);
}

function isLogicalOr(expr: ConditionExpr): expr is LogicalOrExpr {
  return "or" in expr && Array.isArray((expr as LogicalOrExpr).or);
}

function isLogicalNot(expr: ConditionExpr): expr is LogicalNotExpr {
  return "not" in expr;
}

function isEq(expr: ConditionExpr): expr is EqExpr {
  return "eq" in expr;
}

function isNeq(expr: ConditionExpr): expr is NeqExpr {
  return "neq" in expr;
}

function isGte(expr: ConditionExpr): expr is GteExpr {
  return "gte" in expr;
}

function isLte(expr: ConditionExpr): expr is LteExpr {
  return "lte" in expr;
}

function isGt(expr: ConditionExpr): expr is GtExpr {
  return "gt" in expr;
}

function isLt(expr: ConditionExpr): expr is LtExpr {
  return "lt" in expr;
}

function isIn(expr: ConditionExpr): expr is InExpr {
  return "in" in expr;
}

function isContains(expr: ConditionExpr): expr is ContainsExpr {
  return "contains" in expr;
}

function isHasTag(expr: ConditionExpr): expr is HasTagExpr {
  return "has_tag" in expr;
}

// ---------------------------------------------------------------------------
// Avaliador principal
// ---------------------------------------------------------------------------

/**
 * Avalia uma expressão DSL JSON recursiva contra um contexto.
 *
 * Regras de segurança:
 * - Erros de avaliação (tipo inválido, campo inexistente) retornam `false`.
 * - Nunca lança exceção.
 * - Função pura: sem I/O, sem efeitos colaterais.
 */
export function evalCondition(
  expr: ConditionExpr,
  ctx: Record<string, unknown>
): boolean {
  try {
    if (expr === null || expr === undefined || typeof expr !== "object") {
      return false;
    }

    // --- Lógicos ---

    if (isLogicalAnd(expr)) {
      const children = expr.and;
      if (!Array.isArray(children) || children.length === 0) return false;
      return children.every((child) => evalCondition(child, ctx));
    }

    if (isLogicalOr(expr)) {
      const children = expr.or;
      if (!Array.isArray(children) || children.length === 0) return false;
      return children.some((child) => evalCondition(child, ctx));
    }

    if (isLogicalNot(expr)) {
      return !evalCondition(expr.not, ctx);
    }

    // --- has_tag ---

    if (isHasTag(expr)) {
      // BR-AUTOMATION: has_tag verifica se ctx.tags (array de strings) contém a tag
      const tags = ctx["tags"];
      if (!Array.isArray(tags)) return false;
      return tags.includes(expr.has_tag);
    }

    // --- Comparações ---

    if (isEq(expr)) {
      const [field, expected] = expr.eq;
      const value = resolveField(field, ctx);
      if (value === undefined) return false;
      return value === expected;
    }

    if (isNeq(expr)) {
      const [field, expected] = expr.neq;
      const value = resolveField(field, ctx);
      if (value === undefined) return false;
      return value !== expected;
    }

    if (isGte(expr)) {
      const [field, expected] = expr.gte;
      const value = resolveField(field, ctx);
      if (value === undefined || typeof value !== "number" || typeof expected !== "number") return false;
      return value >= expected;
    }

    if (isLte(expr)) {
      const [field, expected] = expr.lte;
      const value = resolveField(field, ctx);
      if (value === undefined || typeof value !== "number" || typeof expected !== "number") return false;
      return value <= expected;
    }

    if (isGt(expr)) {
      const [field, expected] = expr.gt;
      const value = resolveField(field, ctx);
      if (value === undefined || typeof value !== "number" || typeof expected !== "number") return false;
      return value > expected;
    }

    if (isLt(expr)) {
      const [field, expected] = expr.lt;
      const value = resolveField(field, ctx);
      if (value === undefined || typeof value !== "number" || typeof expected !== "number") return false;
      return value < expected;
    }

    if (isIn(expr)) {
      const [field, list] = expr.in;
      const value = resolveField(field, ctx);
      if (value === undefined) return false;
      if (!Array.isArray(list)) return false;
      return list.includes(value);
    }

    if (isContains(expr)) {
      const [field, substring] = expr.contains;
      const value = resolveField(field, ctx);
      if (value === undefined || typeof value !== "string" || typeof substring !== "string") return false;
      return value.includes(substring);
    }

    // Operador desconhecido — retorna false sem lançar exceção
    return false;
  } catch {
    // Qualquer erro de runtime (ex.: acesso a propriedade em null) retorna false
    return false;
  }
}
