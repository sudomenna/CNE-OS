"use client";

import { useState, useEffect, useCallback } from "react";

export interface ColumnDef {
  /** Identificador único da coluna no tableId */
  id: string;
  /** Label legível mostrado no popover */
  label: string;
  /** true = não pode ser desligada (sem checkbox toggleável) */
  alwaysVisible?: boolean;
  /** default true; se false, coluna nasce oculta */
  defaultVisible?: boolean;
}

export interface UseColumnVisibilityOptions {
  /** ex.: 'contacts:list' — convenção <scope>:<table> (ADR-19) */
  tableId: string;
  /** userId para namespace do localStorage */
  userId: string;
  /** definição completa das colunas da tabela */
  columns: ColumnDef[];
}

export interface UseColumnVisibilityResult {
  /** colunas atualmente visíveis (após mount; durante SSR/pre-hydration retorna todas as defaultVisible) */
  visibleColumnIds: Set<string>;
  isVisible: (columnId: string) => boolean;
  /** no-op se alwaysVisible */
  toggle: (columnId: string) => void;
  /** restaura defaults (limpa localStorage) */
  reset: () => void;
  /** false durante SSR; true após primeiro useEffect */
  isHydrated: boolean;
  /** espelha o `hidden` salvo (ordenado, sem duplicatas) */
  hiddenIds: string[];
}

// ADR-19: formato canônico do payload
interface StoredPayload {
  v: number;
  updatedAt: string;
  hidden: string[];
}

function buildStorageKey(tableId: string, userId: string): string {
  // ADR-19: chave cne-os:cols:<tableId>:<userId>
  return `cne-os:cols:${tableId}:${userId}`;
}

function getDefaultHiddenIds(columns: ColumnDef[]): string[] {
  return columns
    .filter((col) => col.defaultVisible === false && !col.alwaysVisible)
    .map((col) => col.id);
}

function computeVisibleIds(columns: ColumnDef[], hiddenIds: string[]): Set<string> {
  const hiddenSet = new Set(hiddenIds);
  return new Set(
    columns
      .filter((col) => col.alwaysVisible || !hiddenSet.has(col.id))
      .map((col) => col.id)
  );
}

function parseStoredPayload(raw: string, tableId: string, userId: string): string[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("v" in parsed) ||
      !("hidden" in parsed) ||
      typeof (parsed as StoredPayload).v !== "number" ||
      (parsed as StoredPayload).v !== 1 ||
      !Array.isArray((parsed as StoredPayload).hidden)
    ) {
      console.warn(
        `[useColumnVisibility] payload inválido ou versão desconhecida em cne-os:cols:${tableId}:${userId} — usando defaults`
      );
      return null;
    }
    const payload = parsed as StoredPayload;
    // Garantir que hidden contém apenas strings
    if (!payload.hidden.every((id) => typeof id === "string")) {
      console.warn(
        `[useColumnVisibility] hidden[] contém valores não-string em cne-os:cols:${tableId}:${userId} — usando defaults`
      );
      return null;
    }
    return payload.hidden;
  } catch {
    console.warn(
      `[useColumnVisibility] JSON inválido em cne-os:cols:${tableId}:${userId} — usando defaults`
    );
    return null;
  }
}

function readFromStorage(tableId: string, userId: string): string[] | null {
  if (typeof window === "undefined") return null;
  const key = buildStorageKey(tableId, userId);
  const raw = window.localStorage.getItem(key);
  if (raw === null) return null;
  return parseStoredPayload(raw, tableId, userId);
}

function writeToStorage(tableId: string, userId: string, hiddenIds: string[]): void {
  if (typeof window === "undefined") return;
  const key = buildStorageKey(tableId, userId);
  const payload: StoredPayload = {
    v: 1,
    updatedAt: new Date().toISOString(),
    hidden: [...hiddenIds].sort(),
  };
  window.localStorage.setItem(key, JSON.stringify(payload));
}

function removeFromStorage(tableId: string, userId: string): void {
  if (typeof window === "undefined") return;
  const key = buildStorageKey(tableId, userId);
  window.localStorage.removeItem(key);
}

export function useColumnVisibility(
  opts: UseColumnVisibilityOptions
): UseColumnVisibilityResult {
  const { tableId, userId, columns } = opts;

  // Estado inicial: defaults (sem tocar no localStorage — SSR safety)
  const defaultHidden = getDefaultHiddenIds(columns);
  const [hiddenIds, setHiddenIds] = useState<string[]>(defaultHidden);
  const [isHydrated, setIsHydrated] = useState(false);

  // Após mount, ler localStorage e atualizar estado
  useEffect(() => {
    const stored = readFromStorage(tableId, userId);
    if (stored !== null) {
      // Filtrar ids que já não existem na definição de colunas (coluna removida do código)
      const validColumnIds = new Set(columns.map((c) => c.id));
      const filtered = stored.filter(
        (id) => validColumnIds.has(id) && !columns.find((c) => c.id === id)?.alwaysVisible
      );
      setHiddenIds(filtered);
    }
    setIsHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, userId]);

  const visibleColumnIds = computeVisibleIds(columns, hiddenIds);

  const isVisible = useCallback(
    (columnId: string): boolean => {
      const col = columns.find((c) => c.id === columnId);
      if (col?.alwaysVisible) return true;
      return visibleColumnIds.has(columnId);
    },
    [columns, visibleColumnIds]
  );

  const toggle = useCallback(
    (columnId: string): void => {
      const col = columns.find((c) => c.id === columnId);
      // no-op silencioso para colunas alwaysVisible
      if (!col || col.alwaysVisible) return;

      setHiddenIds((prev) => {
        let next: string[];
        if (prev.includes(columnId)) {
          // Estava oculta → mostrar
          next = prev.filter((id) => id !== columnId);
        } else {
          // Estava visível → ocultar
          next = [...prev, columnId];
        }
        writeToStorage(tableId, userId, next);
        return next;
      });
    },
    [columns, tableId, userId]
  );

  const reset = useCallback((): void => {
    removeFromStorage(tableId, userId);
    setHiddenIds(defaultHidden);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, userId]);

  // hiddenIds ordenado e sem duplicatas (garantia de contrato)
  const sortedHiddenIds = [...new Set(hiddenIds)].sort();

  return {
    visibleColumnIds,
    isVisible,
    toggle,
    reset,
    isHydrated,
    hiddenIds: sortedHiddenIds,
  };
}
