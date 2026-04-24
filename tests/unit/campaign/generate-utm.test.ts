import { describe, it, expect } from "vitest";
import { generateUtm, type UtmContext } from "../../../lib/domain/campaign/generate-utm";

describe("generateUtm", () => {
  // ── caso base completo ──────────────────────────────────────────────────────
  describe("caso base", () => {
    it("given brand + campaign + creative com channel + funnel when generateUtm then monta todos os 5 campos UTM corretamente", () => {
      const ctx: UtmContext = {
        brand: { slug: "cne-carreiras" },
        campaign: { slug: "black-friday-2026" },
        creative: { slug: "vid-testimonial-01", channel: "meta_ads" },
        funnel: { slug: "topo-carreira" },
      };

      const utm = generateUtm(ctx);

      expect(utm).toEqual({
        utm_source: "cne-carreiras",
        utm_medium: "meta_ads",
        utm_campaign: "black-friday-2026",
        utm_content: "vid-testimonial-01",
        utm_term: "topo-carreira",
      });
    });
  });

  // ── determinismo ────────────────────────────────────────────────────────────
  describe("INV-CAMPAIGN-04 — determinismo", () => {
    it("given mesmos inputs when generateUtm chamado duas vezes then outputs são idênticos", () => {
      const ctx: UtmContext = {
        brand: { slug: "cne-medicina" },
        campaign: { slug: "vestibular-2027" },
        creative: { slug: "banner-hero", channel: "google_ads" },
        funnel: { slug: "fundo-medicina" },
      };

      expect(generateUtm(ctx)).toEqual(generateUtm(ctx));
    });
  });

  // ── ausência de utm_term ────────────────────────────────────────────────────
  describe("ausência de funnel", () => {
    it("given ctx sem funnel when generateUtm then utm_term está ausente no output", () => {
      const ctx: UtmContext = {
        brand: { slug: "cne-carreiras" },
        campaign: { slug: "lancamento-2026" },
        creative: { slug: "copy-email-01", channel: "email" },
      };

      const utm = generateUtm(ctx);

      expect(utm.utm_term).toBeUndefined();
      expect(utm.utm_source).toBe("cne-carreiras");
      expect(utm.utm_campaign).toBe("lancamento-2026");
      expect(utm.utm_content).toBe("copy-email-01");
    });
  });

  // ── ausência de utm_content ─────────────────────────────────────────────────
  describe("ausência de creative", () => {
    it("given ctx sem creative when generateUtm then utm_content está ausente e utm_medium cai para organic", () => {
      const ctx: UtmContext = {
        brand: { slug: "cne-carreiras" },
        campaign: { slug: "topo-organico" },
        funnel: { slug: "topo-carreira" },
      };

      const utm = generateUtm(ctx);

      expect(utm.utm_content).toBeUndefined();
      expect(utm.utm_medium).toBe("organic");
      expect(utm.utm_term).toBe("topo-carreira");
    });
  });

  // ── override de medium ──────────────────────────────────────────────────────
  describe("mediumOverride", () => {
    it("given mediumOverride definido when generateUtm then utm_medium usa o override, ignorando creative.channel", () => {
      const ctx: UtmContext = {
        brand: { slug: "cne-carreiras" },
        campaign: { slug: "campanha-parceiro" },
        creative: { slug: "banner-parceiro", channel: "meta_ads" },
        funnel: { slug: "fundo-carreira" },
        mediumOverride: "affiliate",
      };

      const utm = generateUtm(ctx);

      expect(utm.utm_medium).toBe("affiliate");
    });
  });

  // ── campos extras no ctx são ignorados ─────────────────────────────────────
  describe("campos extras ignorados", () => {
    it("given ctx com propriedades além do contrato when generateUtm then output contém apenas campos UTM padrão", () => {
      // Simula um objeto ampliado que pode vir de código legado ou de serialização
      const ctx = {
        brand: { slug: "cne-medicina", displayName: "CNE Medicina" },
        campaign: { slug: "plantao-2026", startDate: "2026-01-01" },
        creative: { slug: "reel-01", channel: "organic_ig", id: "abc-123" },
        funnel: { slug: "fundo-med", isActive: true },
        someExtraField: "ignored",
      } as unknown as UtmContext;

      const utm = generateUtm(ctx);

      // Deve ter exatamente os campos UTM — sem extra-fields vazando
      const keys = Object.keys(utm);
      expect(keys).toEqual(
        expect.arrayContaining([
          "utm_source",
          "utm_medium",
          "utm_campaign",
          "utm_content",
          "utm_term",
        ])
      );
      expect(keys.every((k) => k.startsWith("utm_"))).toBe(true);
    });
  });

  // ── override vazio cai para organic ────────────────────────────────────────
  describe("mediumOverride em branco", () => {
    it("given mediumOverride vazio when generateUtm then utm_medium cai para organic", () => {
      const ctx: UtmContext = {
        brand: { slug: "cne-carreiras" },
        campaign: { slug: "campanha-abc" },
        mediumOverride: "   ",
      };

      const utm = generateUtm(ctx);

      expect(utm.utm_medium).toBe("organic");
    });
  });
});
