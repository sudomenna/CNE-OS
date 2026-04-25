import { describe, it, expect } from "vitest";
import { evalCondition, type ConditionExpr } from "../../../lib/domain/automation/eval-condition";

describe("evalCondition DSL", () => {
  // -------------------------------------------------------------------------
  // eq
  // -------------------------------------------------------------------------
  describe("eq", () => {
    it("given eq operator when field matches value then returns true", () => {
      const expr: ConditionExpr = { eq: ["$status", "lead"] };
      expect(evalCondition(expr, { status: "lead" })).toBe(true);
    });

    it("given eq operator when field does not match value then returns false", () => {
      const expr: ConditionExpr = { eq: ["$status", "lead"] };
      expect(evalCondition(expr, { status: "customer" })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // neq
  // -------------------------------------------------------------------------
  describe("neq", () => {
    it("given neq operator when field differs from value then returns true", () => {
      const expr: ConditionExpr = { neq: ["$status", "lead"] };
      expect(evalCondition(expr, { status: "customer" })).toBe(true);
    });

    it("given neq operator when field equals value then returns false", () => {
      const expr: ConditionExpr = { neq: ["$status", "lead"] };
      expect(evalCondition(expr, { status: "lead" })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // gte
  // -------------------------------------------------------------------------
  describe("gte", () => {
    it("given gte operator when field equals threshold then returns true", () => {
      const expr: ConditionExpr = { gte: ["$score", 20] };
      expect(evalCondition(expr, { score: 20 })).toBe(true);
    });

    it("given gte operator when field is above threshold then returns true", () => {
      const expr: ConditionExpr = { gte: ["$score", 20] };
      expect(evalCondition(expr, { score: 25 })).toBe(true);
    });

    it("given gte operator when field is below threshold then returns false", () => {
      const expr: ConditionExpr = { gte: ["$score", 20] };
      expect(evalCondition(expr, { score: 10 })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // lte
  // -------------------------------------------------------------------------
  describe("lte", () => {
    it("given lte operator when field equals threshold then returns true", () => {
      const expr: ConditionExpr = { lte: ["$score", 100] };
      expect(evalCondition(expr, { score: 100 })).toBe(true);
    });

    it("given lte operator when field is above threshold then returns false", () => {
      const expr: ConditionExpr = { lte: ["$score", 100] };
      expect(evalCondition(expr, { score: 101 })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // gt
  // -------------------------------------------------------------------------
  describe("gt", () => {
    it("given gt operator when field is strictly above threshold then returns true", () => {
      const expr: ConditionExpr = { gt: ["$amount", 50] };
      expect(evalCondition(expr, { amount: 51 })).toBe(true);
    });

    it("given gt operator when field equals threshold then returns false", () => {
      const expr: ConditionExpr = { gt: ["$amount", 50] };
      expect(evalCondition(expr, { amount: 50 })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // lt
  // -------------------------------------------------------------------------
  describe("lt", () => {
    it("given lt operator when field is strictly below threshold then returns true", () => {
      const expr: ConditionExpr = { lt: ["$amount", 50] };
      expect(evalCondition(expr, { amount: 49 })).toBe(true);
    });

    it("given lt operator when field equals threshold then returns false", () => {
      const expr: ConditionExpr = { lt: ["$amount", 50] };
      expect(evalCondition(expr, { amount: 50 })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // in
  // -------------------------------------------------------------------------
  describe("in", () => {
    it("given in operator when field value is in the list then returns true", () => {
      const expr: ConditionExpr = { in: ["$classification", ["lead", "hot"]] };
      expect(evalCondition(expr, { classification: "lead" })).toBe(true);
    });

    it("given in operator when field value is not in the list then returns false", () => {
      const expr: ConditionExpr = { in: ["$classification", ["lead", "hot"]] };
      expect(evalCondition(expr, { classification: "cold" })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // contains
  // -------------------------------------------------------------------------
  describe("contains", () => {
    it("given contains operator when field contains substring then returns true", () => {
      const expr: ConditionExpr = { contains: ["$email", "@outsiders"] };
      expect(evalCondition(expr, { email: "user@outsiders.digital" })).toBe(true);
    });

    it("given contains operator when field does not contain substring then returns false", () => {
      const expr: ConditionExpr = { contains: ["$email", "@gmail"] };
      expect(evalCondition(expr, { email: "user@outsiders.digital" })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // has_tag
  // -------------------------------------------------------------------------
  describe("has_tag", () => {
    it("given has_tag when ctx.tags contains the tag then returns true", () => {
      const expr: ConditionExpr = { has_tag: "vip" };
      expect(evalCondition(expr, { tags: ["lead", "vip", "newsletter"] })).toBe(true);
    });

    it("given has_tag when ctx.tags does not contain the tag then returns false", () => {
      const expr: ConditionExpr = { has_tag: "vip" };
      expect(evalCondition(expr, { tags: ["lead", "newsletter"] })).toBe(false);
    });

    it("given has_tag when ctx.tags is undefined then returns false", () => {
      const expr: ConditionExpr = { has_tag: "vip" };
      expect(evalCondition(expr, {})).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // and
  // -------------------------------------------------------------------------
  describe("and", () => {
    it("given and operator when all children are true then returns true", () => {
      const expr: ConditionExpr = {
        and: [
          { eq: ["$status", "lead"] },
          { gte: ["$score", 10] },
        ],
      };
      expect(evalCondition(expr, { status: "lead", score: 20 })).toBe(true);
    });

    it("given and operator when one child is false then returns false", () => {
      const expr: ConditionExpr = {
        and: [
          { eq: ["$status", "lead"] },
          { gte: ["$score", 50] },
        ],
      };
      expect(evalCondition(expr, { status: "lead", score: 20 })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // or
  // -------------------------------------------------------------------------
  describe("or", () => {
    it("given or operator when at least one child is true then returns true", () => {
      const expr: ConditionExpr = {
        or: [
          { eq: ["$status", "customer"] },
          { has_tag: "vip" },
        ],
      };
      expect(evalCondition(expr, { status: "lead", tags: ["vip"] })).toBe(true);
    });

    it("given or operator when all children are false then returns false", () => {
      const expr: ConditionExpr = {
        or: [
          { eq: ["$status", "customer"] },
          { has_tag: "vip" },
        ],
      };
      expect(evalCondition(expr, { status: "lead", tags: [] })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // not
  // -------------------------------------------------------------------------
  describe("not", () => {
    it("given not operator when inner expression is true then returns false", () => {
      const expr: ConditionExpr = { not: { eq: ["$status", "lead"] } };
      expect(evalCondition(expr, { status: "lead" })).toBe(false);
    });

    it("given not operator when inner expression is false then returns true", () => {
      const expr: ConditionExpr = { not: { eq: ["$status", "lead"] } };
      expect(evalCondition(expr, { status: "customer" })).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Aninhamento
  // -------------------------------------------------------------------------
  describe("nested expressions", () => {
    it("given and inside or when condition matches then returns true", () => {
      const expr: ConditionExpr = {
        or: [
          {
            and: [
              { eq: ["$status", "lead"] },
              { gte: ["$score", 20] },
            ],
          },
          { has_tag: "priority" },
        ],
      };
      // matches the first branch of or
      expect(evalCondition(expr, { status: "lead", score: 30, tags: [] })).toBe(true);
    });

    it("given and inside or when no branch matches then returns false", () => {
      const expr: ConditionExpr = {
        or: [
          {
            and: [
              { eq: ["$status", "lead"] },
              { gte: ["$score", 20] },
            ],
          },
          { has_tag: "priority" },
        ],
      };
      // score too low and no tag
      expect(evalCondition(expr, { status: "lead", score: 5, tags: [] })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Dot-notation
  // -------------------------------------------------------------------------
  describe("dot-notation field resolution", () => {
    it("given $contact.email when field exists then resolves correctly", () => {
      const expr: ConditionExpr = { eq: ["$contact.email", "user@example.com"] };
      expect(
        evalCondition(expr, { contact: { email: "user@example.com" } })
      ).toBe(true);
    });

    it("given $contact.email when nested field does not exist then returns false", () => {
      const expr: ConditionExpr = { eq: ["$contact.email", "user@example.com"] };
      expect(evalCondition(expr, { contact: {} })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Campo inexistente
  // -------------------------------------------------------------------------
  describe("missing field", () => {
    it("given field that does not exist in ctx when comparing then returns false", () => {
      const expr: ConditionExpr = { eq: ["$nonexistent", "value"] };
      expect(evalCondition(expr, {})).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Expr inválida — não lança exceção
  // -------------------------------------------------------------------------
  describe("invalid / empty expressions", () => {
    it("given null expression when evaluated then returns false without throwing", () => {
      // Force cast to test runtime safety
      expect(evalCondition(null as unknown as ConditionExpr, {})).toBe(false);
    });

    it("given empty object expression when evaluated then returns false without throwing", () => {
      expect(evalCondition({} as unknown as ConditionExpr, {})).toBe(false);
    });

    it("given unknown operator when evaluated then returns false without throwing", () => {
      const expr = { unknown_op: ["$field", "value"] } as unknown as ConditionExpr;
      expect(evalCondition(expr, { field: "value" })).toBe(false);
    });
  });
});
