/**
 * @vitest-environment jsdom
 *
 * Testes do componente <ColumnsCustomizer>
 *
 * Cobre:
 *  1. Render mostra checkboxes para cada coluna
 *  2. alwaysVisible aparece disabled
 *  3. Click em checkbox dispara onToggle (modo controlado)
 *  4. Click em "Restaurar padrão" dispara onReset
 *  5. Modo não-controlado (sem props de controle) usa o hook internamente
 *
 * Ref: docs/80-roadmap/13-sprint-16-table-columns-customizer.md T-16-01
 * Ref: docs/90-meta/04-decision-log.md ADR-19
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, act, cleanup, within } from "@testing-library/react";
import { ColumnsCustomizer, type ColumnDef } from "@/components/ui/columns-customizer";

// Colunas de exemplo
const COLUMNS: ColumnDef[] = [
  { id: "name", label: "Nome", alwaysVisible: true },
  { id: "email", label: "E-mail" },
  { id: "phone", label: "Telefone" },
  { id: "origin", label: "Origem", defaultVisible: false },
];

const TABLE_ID = "contacts:list";
const USER_ID = "user-test-001";
const STORAGE_KEY = `cne-os:cols:${TABLE_ID}:${USER_ID}`;

// Helper: abrir o popover via click no trigger dentro do container fornecido
async function openPopover(container: HTMLElement): Promise<void> {
  const trigger = within(container).getByRole("button", { name: /personalizar colunas/i });
  await act(async () => {
    fireEvent.click(trigger);
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("ColumnsCustomizer — modo controlado", () => {
  it("botão trigger possui aria-label acessível", () => {
    const onToggle = vi.fn();
    const onReset = vi.fn();
    const visibleIds = new Set(["name", "email", "phone"]);

    const { container } = render(
      <ColumnsCustomizer
        tableId={TABLE_ID}
        userId={USER_ID}
        columns={COLUMNS}
        visibleColumnIds={visibleIds}
        onToggle={onToggle}
        onReset={onReset}
      />
    );

    const trigger = within(container).getByRole("button", { name: /personalizar colunas/i });
    expect(trigger).toBeDefined();
  });

  it("após abrir o popover, exibe checkboxes para cada coluna", async () => {
    const onToggle = vi.fn();
    const onReset = vi.fn();
    const visibleIds = new Set(["name", "email", "phone"]);

    const { container } = render(
      <ColumnsCustomizer
        tableId={TABLE_ID}
        userId={USER_ID}
        columns={COLUMNS}
        visibleColumnIds={visibleIds}
        onToggle={onToggle}
        onReset={onReset}
      />
    );

    await openPopover(container);

    // O conteúdo do Popover é renderizado via Portal — buscar no document.body
    expect(document.querySelector('[aria-label="Nome (coluna obrigatória)"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="E-mail"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Telefone"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Origem"]')).not.toBeNull();
  });

  it("coluna alwaysVisible aparece com checkbox disabled", async () => {
    const onToggle = vi.fn();
    const onReset = vi.fn();
    const visibleIds = new Set(["name", "email", "phone"]);

    const { container } = render(
      <ColumnsCustomizer
        tableId={TABLE_ID}
        userId={USER_ID}
        columns={COLUMNS}
        visibleColumnIds={visibleIds}
        onToggle={onToggle}
        onReset={onReset}
      />
    );

    await openPopover(container);

    // O checkbox de "Nome" (alwaysVisible) deve estar disabled
    const nomeCheckbox = document.querySelector(
      '[aria-label="Nome (coluna obrigatória)"]'
    ) as HTMLButtonElement | null;
    expect(nomeCheckbox).not.toBeNull();

    // Radix Checkbox usa aria-disabled ou atributo disabled
    const isDisabled =
      nomeCheckbox!.getAttribute("disabled") !== null ||
      nomeCheckbox!.getAttribute("aria-disabled") === "true" ||
      nomeCheckbox!.hasAttribute("disabled");
    expect(isDisabled).toBe(true);
  });

  it("click em checkbox de coluna não-alwaysVisible dispara onToggle com o id correto", async () => {
    const onToggle = vi.fn();
    const onReset = vi.fn();
    const visibleIds = new Set(["name", "email", "phone"]);

    const { container } = render(
      <ColumnsCustomizer
        tableId={TABLE_ID}
        userId={USER_ID}
        columns={COLUMNS}
        visibleColumnIds={visibleIds}
        onToggle={onToggle}
        onReset={onReset}
      />
    );

    await openPopover(container);

    // Clicar no checkbox de E-mail
    const emailCheckbox = document.querySelector('[aria-label="E-mail"]') as HTMLElement | null;
    expect(emailCheckbox).not.toBeNull();
    await act(async () => {
      fireEvent.click(emailCheckbox!);
    });

    expect(onToggle).toHaveBeenCalledWith("email");
  });

  it("click em 'Restaurar padrão' dispara onReset", async () => {
    const onToggle = vi.fn();
    const onReset = vi.fn();
    const visibleIds = new Set(["name", "email"]);

    const { container } = render(
      <ColumnsCustomizer
        tableId={TABLE_ID}
        userId={USER_ID}
        columns={COLUMNS}
        visibleColumnIds={visibleIds}
        onToggle={onToggle}
        onReset={onReset}
      />
    );

    await openPopover(container);

    // Buscar botão "Restaurar padrão" no document (Portal)
    const resetBtns = Array.from(
      document.querySelectorAll("button")
    ).filter((btn) => btn.textContent?.trim() === "Restaurar padrão");
    expect(resetBtns.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(resetBtns[0] as HTMLButtonElement);
    });

    expect(onReset).toHaveBeenCalledOnce();
  });

  it("coluna oculta (não em visibleColumnIds) aparece com checkbox não-marcado", async () => {
    const onToggle = vi.fn();
    const onReset = vi.fn();
    // "origin" está oculto (não no Set)
    const visibleIds = new Set(["name", "email", "phone"]);

    const { container } = render(
      <ColumnsCustomizer
        tableId={TABLE_ID}
        userId={USER_ID}
        columns={COLUMNS}
        visibleColumnIds={visibleIds}
        onToggle={onToggle}
        onReset={onReset}
      />
    );

    await openPopover(container);

    const originCheckbox = document.querySelector(
      '[aria-label="Origem"]'
    ) as HTMLButtonElement | null;
    expect(originCheckbox).not.toBeNull();
    // Radix Checkbox: aria-checked="false" quando não marcado
    const checked = originCheckbox!.getAttribute("aria-checked");
    expect(checked).not.toBe("true");
  });

  it("não dispara onToggle ao clicar em checkbox disabled (alwaysVisible)", async () => {
    const onToggle = vi.fn();
    const onReset = vi.fn();
    const visibleIds = new Set(["name", "email", "phone"]);

    const { container } = render(
      <ColumnsCustomizer
        tableId={TABLE_ID}
        userId={USER_ID}
        columns={COLUMNS}
        visibleColumnIds={visibleIds}
        onToggle={onToggle}
        onReset={onReset}
      />
    );

    await openPopover(container);

    const nomeCheckbox = document.querySelector(
      '[aria-label="Nome (coluna obrigatória)"]'
    ) as HTMLElement | null;
    expect(nomeCheckbox).not.toBeNull();
    await act(async () => {
      fireEvent.click(nomeCheckbox!);
    });

    // onToggle não deve ser chamado para alwaysVisible
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe("ColumnsCustomizer — modo não-controlado (hook interno)", () => {
  it("renderiza sem erros com tableId/userId e exibe o trigger", () => {
    const { container } = render(
      <ColumnsCustomizer
        tableId={TABLE_ID}
        userId={USER_ID}
        columns={COLUMNS}
      />
    );

    const trigger = within(container).getByRole("button", { name: /personalizar colunas/i });
    expect(trigger).toBeDefined();
  });

  it("modo não-controlado: toggle escreve no localStorage", async () => {
    const { container } = render(
      <ColumnsCustomizer
        tableId={TABLE_ID}
        userId={USER_ID}
        columns={COLUMNS}
      />
    );

    await openPopover(container);

    const emailCheckbox = document.querySelector('[aria-label="E-mail"]') as HTMLElement | null;
    expect(emailCheckbox).not.toBeNull();
    await act(async () => {
      fireEvent.click(emailCheckbox!);
    });

    // localStorage deve conter a preferência gravada
    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    const payload = JSON.parse(stored!);
    expect(payload.v).toBe(1);
    expect(payload.hidden).toContain("email");
  });

  it("modo não-controlado: reset limpa localStorage", async () => {
    // Pre-popular localStorage
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 1, updatedAt: "2026-04-27T00:00:00.000Z", hidden: ["email"] })
    );

    const { container } = render(
      <ColumnsCustomizer
        tableId={TABLE_ID}
        userId={USER_ID}
        columns={COLUMNS}
      />
    );

    await openPopover(container);

    const resetBtns = Array.from(
      document.querySelectorAll("button")
    ).filter((btn) => btn.textContent?.trim() === "Restaurar padrão");
    expect(resetBtns.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(resetBtns[0] as HTMLButtonElement);
    });

    // localStorage deve estar limpo
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("ColumnsCustomizer — acessibilidade", () => {
  it("popover tem título 'Colunas visíveis' após abrir", async () => {
    const onToggle = vi.fn();
    const onReset = vi.fn();
    const visibleIds = new Set(["name", "email"]);

    const { container } = render(
      <ColumnsCustomizer
        tableId={TABLE_ID}
        userId={USER_ID}
        columns={COLUMNS}
        visibleColumnIds={visibleIds}
        onToggle={onToggle}
        onReset={onReset}
      />
    );

    await openPopover(container);

    const heading = Array.from(document.querySelectorAll("p, h1, h2, h3, h4, h5, h6")).find(
      (el) => el.textContent?.trim() === "Colunas visíveis"
    );
    expect(heading).toBeDefined();
  });
});
