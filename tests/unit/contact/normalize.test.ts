import { describe, it, expect } from "vitest";
import {
  normalizeCpf,
  normalizePhone,
  normalizeEmail,
  InvalidCpfError,
  InvalidPhoneError,
  InvalidEmailError,
} from "../../../lib/domain/contact/normalize";

describe("INV-CONTACT-08 — normalizeCpf", () => {
  it("given CPF com máscara when normalizeCpf then retorna 11 dígitos sem máscara", () => {
    expect(normalizeCpf("123.456.789-09")).toBe("12345678909");
  });

  it("given CPF já limpo when normalizeCpf then retorna inalterado", () => {
    expect(normalizeCpf("12345678909")).toBe("12345678909");
  });

  it("given CPF com 3 dígitos when normalizeCpf then lança InvalidCpfError", () => {
    expect(() => normalizeCpf("123")).toThrow(InvalidCpfError);
  });

  it("given string vazia when normalizeCpf then lança InvalidCpfError", () => {
    expect(() => normalizeCpf("")).toThrow(InvalidCpfError);
  });

  it("given CPF com 12 dígitos when normalizeCpf then lança InvalidCpfError", () => {
    expect(() => normalizeCpf("123456789012")).toThrow(InvalidCpfError);
  });
});

describe("INV-CONTACT-08 — normalizePhone", () => {
  it("given telefone com máscara BR when normalizePhone then retorna E.164", () => {
    expect(normalizePhone("(11) 98888-7777")).toBe("+5511988887777");
  });

  it("given telefone já em E.164 when normalizePhone then retorna idempotente", () => {
    expect(normalizePhone("+5511988887777")).toBe("+5511988887777");
  });

  it("given telefone BR sem código de país when normalizePhone then adiciona +55", () => {
    expect(normalizePhone("11988887777")).toBe("+5511988887777");
  });

  it("given telefone com prefixo 0 when normalizePhone then remove 0 e adiciona +55", () => {
    expect(normalizePhone("011988887777")).toBe("+5511988887777");
  });

  it("given string não numérica when normalizePhone then lança InvalidPhoneError", () => {
    expect(() => normalizePhone("abc")).toThrow(InvalidPhoneError);
  });

  it("given número muito curto when normalizePhone then lança InvalidPhoneError", () => {
    expect(() => normalizePhone("123")).toThrow(InvalidPhoneError);
  });

  it("given telefone com código 55 sem + e 12 dígitos when normalizePhone then adiciona +", () => {
    expect(normalizePhone("5511988887777")).toBe("+5511988887777");
  });

  it("given telefone fixo BR 10 dígitos sem código when normalizePhone then retorna E.164", () => {
    expect(normalizePhone("1133334444")).toBe("+551133334444");
  });
});

describe("INV-CONTACT-08 — normalizeEmail", () => {
  it("given e-mail com maiúsculas when normalizeEmail then retorna lowercase", () => {
    expect(normalizeEmail("JOE@X.COM ")).toBe("joe@x.com");
  });

  it("given e-mail com espaços when normalizeEmail then retorna trimado", () => {
    expect(normalizeEmail("  alice@example.com  ")).toBe("alice@example.com");
  });

  it("given string sem @ when normalizeEmail then lança InvalidEmailError", () => {
    expect(() => normalizeEmail("semArroba")).toThrow(InvalidEmailError);
  });

  it("given string vazia when normalizeEmail then lança InvalidEmailError", () => {
    expect(() => normalizeEmail("")).toThrow(InvalidEmailError);
  });
});
