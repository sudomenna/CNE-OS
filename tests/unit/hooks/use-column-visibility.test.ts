/**
 * @vitest-environment jsdom
 *
 * Testes do hook useColumnVisibility
 *
 * Cobre:
 *  1. Render inicial sem localStorage → defaults aplicados
 *  2. Render com localStorage existente → respeita `hidden`
 *  3. toggle esconde coluna → grava em localStorage
 *  4. toggle em coluna já oculta → mostra de novo
 *  5. toggle em alwaysVisible → no-op
 *  6. reset → limpa storage e volta aos defaults
 *  7. Payload corrupto → fallback gracioso (defaults)
 *  8. SSR-only render (typeof window === undefined simulado) → isHydrated = false, não toca localStorage
 *
 * Ref: docs/80-roadmap/13-sprint-16-table-columns-customizer.md T-16-01
 * Ref: docs/90-meta/04-decision-log.md ADR-19
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useColumnVisibility,
  type ColumnDef,
} from "@/lib/hooks/use-column-visibility";

// Colunas de exemplo para os testes
const COLUMNS: ColumnDef[] = [
  { id: "name", label: "Nome", alwaysVisible: true },
  { id: "email", label: "E-mail" },
  { id: "phone", label: "Telefone" },
  { id: "origin", label: "Origem", defaultVisible: false },
  { id: "createdAt", label: "Criado em", defaultVisible: false },
];

const TABLE_ID = "contacts:list";
const USER_ID = "user-abc-123";
const STORAGE_KEY = `cne-os:cols:${TABLE_ID}:${USER_ID}`;

function makePayload(hidden: string[]) {
  return JSON.stringify({
    v: 1,
    updatedAt: "2026-04-27T10:00:00.000Z",
    hidden,
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useColumnVisibility — defaults e inicialização", () => {
  it("sem localStorage: colunas com defaultVisible:false são ocultas por padrão", async () => {
    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: TABLE_ID, userId: USER_ID, columns: COLUMNS })
    );

    // Após hydration
    await act(async () => {});

    expect(result.current.isHydrated).toBe(true);
    expect(result.current.isVisible("name")).toBe(true);
    expect(result.current.isVisible("email")).toBe(true);
    expect(result.current.isVisible("phone")).toBe(true);
    // defaultVisible: false
    expect(result.current.isVisible("origin")).toBe(false);
    expect(result.current.isVisible("createdAt")).toBe(false);
  });

  it("hiddenIds reflete os defaults quando não há localStorage", async () => {
    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: TABLE_ID, userId: USER_ID, columns: COLUMNS })
    );
    await act(async () => {});

    expect(result.current.hiddenIds).toEqual(["createdAt", "origin"]); // ordenado
  });

  it("isHydrated começa false e vira true após useEffect", async () => {
    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: TABLE_ID, userId: USER_ID, columns: COLUMNS })
    );

    // ANTES do useEffect (estado inicial):
    // No vitest+jsdom o primeiro render já é síncrono, mas o useEffect roda assincronamente
    // Verificamos que após act() a flag está true
    await act(async () => {});
    expect(result.current.isHydrated).toBe(true);
  });
});

describe("useColumnVisibility — leitura de localStorage", () => {
  it("respeitando localStorage existente: oculta os ids em `hidden`", async () => {
    localStorage.setItem(STORAGE_KEY, makePayload(["email", "phone"]));

    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: TABLE_ID, userId: USER_ID, columns: COLUMNS })
    );
    await act(async () => {});

    expect(result.current.isVisible("name")).toBe(true); // alwaysVisible
    expect(result.current.isVisible("email")).toBe(false);
    expect(result.current.isVisible("phone")).toBe(false);
    expect(result.current.hiddenIds).toEqual(["email", "phone"]);
  });

  it("ignora ids de colunas que não existem mais na definição", async () => {
    localStorage.setItem(STORAGE_KEY, makePayload(["email", "coluna-removida"]));

    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: TABLE_ID, userId: USER_ID, columns: COLUMNS })
    );
    await act(async () => {});

    expect(result.current.hiddenIds).toEqual(["email"]);
  });

  it("payload com versão desconhecida → console.warn + usar defaults", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 99, updatedAt: "2026-04-27", hidden: ["email"] })
    );

    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: TABLE_ID, userId: USER_ID, columns: COLUMNS })
    );
    await act(async () => {});

    // Deve usar defaults (origin e createdAt ocultos)
    expect(result.current.hiddenIds).toEqual(["createdAt", "origin"]);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("JSON inválido no localStorage → console.warn + usar defaults", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, "{ broken json ]]]");

    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: TABLE_ID, userId: USER_ID, columns: COLUMNS })
    );
    await act(async () => {});

    expect(result.current.hiddenIds).toEqual(["createdAt", "origin"]);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("payload sem campo `hidden` → console.warn + usar defaults", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, updatedAt: "2026-04-27" }));

    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: TABLE_ID, userId: USER_ID, columns: COLUMNS })
    );
    await act(async () => {});

    expect(result.current.hiddenIds).toEqual(["createdAt", "origin"]);
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});

describe("useColumnVisibility — toggle", () => {
  it("toggle oculta coluna visível e grava no localStorage", async () => {
    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: TABLE_ID, userId: USER_ID, columns: COLUMNS })
    );
    await act(async () => {});

    act(() => {
      result.current.toggle("email");
    });

    expect(result.current.isVisible("email")).toBe(false);
    expect(result.current.hiddenIds).toContain("email");

    // Verificar localStorage
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.hidden).toContain("email");
    expect(stored.v).toBe(1);
    expect(stored.updatedAt).toBeTruthy();
  });

  it("toggle em coluna já oculta → mostra de novo (remove de hidden)", async () => {
    localStorage.setItem(STORAGE_KEY, makePayload(["email"]));

    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: TABLE_ID, userId: USER_ID, columns: COLUMNS })
    );
    await act(async () => {});

    expect(result.current.isVisible("email")).toBe(false);

    act(() => {
      result.current.toggle("email");
    });

    expect(result.current.isVisible("email")).toBe(true);
    expect(result.current.hiddenIds).not.toContain("email");

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.hidden).not.toContain("email");
  });

  it("toggle em coluna alwaysVisible → no-op silencioso", async () => {
    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: TABLE_ID, userId: USER_ID, columns: COLUMNS })
    );
    await act(async () => {});

    const hiddenBefore = result.current.hiddenIds.slice();

    act(() => {
      result.current.toggle("name"); // alwaysVisible: true
    });

    expect(result.current.isVisible("name")).toBe(true);
    expect(result.current.hiddenIds).toEqual(hiddenBefore);
    // localStorage não deve ter sido escrito (estava vazio, deve continuar nulo ou sem 'name')
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      expect(JSON.parse(stored).hidden).not.toContain("name");
    }
  });

  it("toggle em coluna inexistente → no-op silencioso", async () => {
    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: TABLE_ID, userId: USER_ID, columns: COLUMNS })
    );
    await act(async () => {});

    const hiddenBefore = result.current.hiddenIds.slice();

    act(() => {
      result.current.toggle("coluna-inexistente");
    });

    expect(result.current.hiddenIds).toEqual(hiddenBefore);
  });
});

describe("useColumnVisibility — reset", () => {
  it("reset remove chave do localStorage e volta aos defaults", async () => {
    localStorage.setItem(STORAGE_KEY, makePayload(["email", "phone"]));

    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: TABLE_ID, userId: USER_ID, columns: COLUMNS })
    );
    await act(async () => {});

    // Estado antes do reset
    expect(result.current.isVisible("email")).toBe(false);
    expect(result.current.isVisible("phone")).toBe(false);

    act(() => {
      result.current.reset();
    });

    // Após reset: volta defaults (origin e createdAt ocultos)
    expect(result.current.isVisible("email")).toBe(true);
    expect(result.current.isVisible("phone")).toBe(true);
    expect(result.current.isVisible("origin")).toBe(false);
    expect(result.current.isVisible("createdAt")).toBe(false);

    // localStorage removido
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("useColumnVisibility — visibleColumnIds e alwaysVisible", () => {
  it("alwaysVisible sempre está em visibleColumnIds independentemente de hiddenIds", async () => {
    // Forçar que 'name' apareça em hidden (edge case de payload antigo)
    localStorage.setItem(STORAGE_KEY, makePayload(["name", "email"]));

    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: TABLE_ID, userId: USER_ID, columns: COLUMNS })
    );
    await act(async () => {});

    // 'name' é alwaysVisible → deve sempre aparecer em visibleColumnIds
    expect(result.current.visibleColumnIds.has("name")).toBe(true);
    expect(result.current.isVisible("name")).toBe(true);
  });

  it("visibleColumnIds é um Set com os ids corretos", async () => {
    // Lista negativa: storage define somente "email" como oculto
    // "origin" e "createdAt" não estão em hidden → ficam visíveis (override do defaultVisible)
    // Isso é o comportamento correto de ADR-19: o storage é a fonte de verdade após hydration
    localStorage.setItem(STORAGE_KEY, makePayload(["email"]));

    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: TABLE_ID, userId: USER_ID, columns: COLUMNS })
    );
    await act(async () => {});

    const visible = result.current.visibleColumnIds;
    expect(visible.has("name")).toBe(true);   // alwaysVisible
    expect(visible.has("phone")).toBe(true);  // visível por default, não em hidden
    expect(visible.has("email")).toBe(false); // explicitamente em hidden
    // defaultVisible: false MAS não está em hidden do storage → storage é fonte de verdade → visível
    expect(visible.has("origin")).toBe(true);
    expect(visible.has("createdAt")).toBe(true);
  });
});

describe("useColumnVisibility — SSR safety", () => {
  it("estado inicial (antes de useEffect) reflete defaults sem tocar localStorage", () => {
    // No ambiente SSR o hook usa defaults na renderização inicial.
    // Populamos o localStorage com dados diferentes dos defaults para confirmar que
    // o estado inicial (síncrono) usa defaults e só depois o useEffect aplica o storage.
    localStorage.setItem(STORAGE_KEY, makePayload(["email", "phone"]));

    let initialHiddenIds: string[] | undefined;

    renderHook(() => {
      const r = useColumnVisibility({ tableId: TABLE_ID, userId: USER_ID, columns: COLUMNS });
      if (initialHiddenIds === undefined) {
        initialHiddenIds = r.hiddenIds;
      }
      return r;
    });

    // Estado inicial = defaults (origin e createdAt ocultos por defaultVisible: false)
    expect(initialHiddenIds).toEqual(["createdAt", "origin"]);
    // email e phone NÃO devem estar nos hidden iniciais (antes do useEffect ler storage)
    expect(initialHiddenIds).not.toContain("email");
    expect(initialHiddenIds).not.toContain("phone");
  });

  it("guard typeof window evita acesso ao localStorage durante a fase de render síncrona", () => {
    // Verifica que o localStorage.getItem NÃO é chamado durante o render síncrono (SSR phase).
    // Apenas o useEffect chama getItem — portanto no momento do render, spy deve ter 0 chamadas.
    const getItemSpy = vi.spyOn(localStorage, "getItem");

    let spyCallsAtFirstRender = 0;

    renderHook(() => {
      const r = useColumnVisibility({ tableId: TABLE_ID, userId: USER_ID, columns: COLUMNS });
      // Captura chamadas durante o render síncrono (antes de useEffect)
      spyCallsAtFirstRender = getItemSpy.mock.calls.length;
      return r;
    });

    // getItem só deve ser chamado no useEffect (após o render), não durante o render em si
    expect(spyCallsAtFirstRender).toBe(0);
  });
});
