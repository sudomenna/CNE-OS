// Funções puras — sem I/O, sem DB.

// INV-CONTACT-08: todo contact_phone.e164 é armazenado normalizado em E.164;
// toda contact_email.email em lowercase/trim; toda contact.cpf com 11 dígitos numéricos sem máscara.

export class InvalidCpfError extends Error {
  constructor(raw: string) {
    super(`CPF inválido: "${raw}". Esperado: 11 dígitos numéricos.`);
    this.name = "InvalidCpfError";
  }
}

export class InvalidPhoneError extends Error {
  constructor(raw: string) {
    super(`Telefone inválido: "${raw}". Não foi possível gerar E.164 válido.`);
    this.name = "InvalidPhoneError";
  }
}

export class InvalidEmailError extends Error {
  constructor(raw: string) {
    super(`E-mail inválido: "${raw}". Esperado: endereço com '@'.`);
    this.name = "InvalidEmailError";
  }
}

/**
 * Normaliza CPF para 11 dígitos numéricos sem máscara.
 * Lança InvalidCpfError se não for possível extrair exatamente 11 dígitos.
 */
export function normalizeCpf(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) {
    throw new InvalidCpfError(raw);
  }
  return digits;
}

/**
 * Normaliza telefone para formato E.164 (+55DDDNUMERO).
 * Assume Brasil (+55) quando não há código de país.
 * Lança InvalidPhoneError se não for possível gerar número E.164 válido.
 *
 * Exemplos:
 *   '(11) 98888-7777' → '+5511988887777'
 *   '11988887777'     → '+5511988887777'
 *   '+5511988887777'  → '+5511988887777'
 *   '011988887777'    → '+5511988887777'
 */
export function normalizePhone(raw: string): string {
  // Remover tudo exceto '+' e dígitos
  const cleaned = raw.replace(/[^+\d]/g, "");

  let e164: string;

  if (cleaned.startsWith("+55")) {
    // Já tem código de país BR
    e164 = cleaned;
  } else if (cleaned.startsWith("55") && cleaned.length >= 12 && cleaned.length <= 13) {
    // Tem código de país BR sem o '+'
    e164 = "+" + cleaned;
  } else if (cleaned.startsWith("0")) {
    // Prefixo de discagem interurbana: remover '0' e adicionar +55
    const withoutZero = cleaned.slice(1);
    e164 = "+55" + withoutZero;
  } else if (cleaned.length >= 10 && cleaned.length <= 11) {
    // DDD + número sem código de país
    e164 = "+55" + cleaned;
  } else {
    throw new InvalidPhoneError(raw);
  }

  // Validar comprimento final: '+' + 11 a 14 dígitos = 12 a 15 chars
  // E.164: mínimo 7 dígitos, máximo 15 dígitos (sem o '+')
  const e164Digits = e164.slice(1); // remove '+'
  if (!e164.startsWith("+") || e164Digits.length < 11 || e164Digits.length > 14) {
    throw new InvalidPhoneError(raw);
  }

  return e164;
}

/**
 * Normaliza e-mail: lowercase + trim.
 * Lança InvalidEmailError se não contiver '@' após normalização.
 */
export function normalizeEmail(raw: string): string {
  const normalized = raw.toLowerCase().trim();
  if (!normalized.includes("@")) {
    throw new InvalidEmailError(raw);
  }
  return normalized;
}
