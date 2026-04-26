"use client";

import * as React from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import {
  useColumnVisibility,
  type ColumnDef,
} from "@/lib/hooks/use-column-visibility";

export type { ColumnDef };

export interface ColumnsCustomizerProps {
  tableId: string;
  userId: string;
  columns: ColumnDef[];
  /**
   * Modo controlado (opcional): quando fornecido, o componente NÃO instancia
   * useColumnVisibility internamente — usa os valores passados pelo pai.
   * DataTable pode usar isso para evitar duplicar o hook.
   */
  visibleColumnIds?: Set<string>;
  onToggle?: (columnId: string) => void;
  onReset?: () => void;
}

/**
 * Componente interno para quando o modo é controlado externamente.
 */
function ColumnsCustomizerControlled({
  columns,
  visibleColumnIds,
  onToggle,
  onReset,
}: {
  columns: ColumnDef[];
  visibleColumnIds: Set<string>;
  onToggle: (columnId: string) => void;
  onReset: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Personalizar colunas"
          title="Personalizar colunas"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <div className="px-4 pt-4 pb-2 border-b">
          <p className="text-sm font-medium leading-none">Colunas visíveis</p>
          <p className="text-xs text-muted-foreground mt-1">
            Escolha quais colunas exibir nesta tabela.
          </p>
        </div>
        <ul role="list" className="py-2 max-h-72 overflow-y-auto">
          {columns.map((col) => {
            const isChecked = col.alwaysVisible || visibleColumnIds.has(col.id);
            const checkboxId = `col-toggle-${col.id}`;
            return (
              <li key={col.id}>
                <div
                  className={
                    "flex items-center gap-3 px-4 py-2 hover:bg-muted/50 transition-colors " +
                    (col.alwaysVisible ? "cursor-default opacity-60" : "cursor-pointer")
                  }
                  onClick={() => {
                    if (!col.alwaysVisible) {
                      onToggle(col.id);
                    }
                  }}
                  role="none"
                >
                  <Checkbox
                    id={checkboxId}
                    checked={isChecked}
                    disabled={col.alwaysVisible === true}
                    onCheckedChange={() => {
                      if (!col.alwaysVisible) {
                        onToggle(col.id);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    title={col.alwaysVisible ? "Coluna obrigatória" : undefined}
                    aria-label={col.alwaysVisible ? `${col.label} (coluna obrigatória)` : col.label}
                  />
                  <Label
                    htmlFor={checkboxId}
                    className={
                      "text-sm font-normal leading-none " +
                      (col.alwaysVisible ? "cursor-default" : "cursor-pointer")
                    }
                    onClick={(e) => {
                      // Prevenir duplo toggle (o div já toglea)
                      e.stopPropagation();
                    }}
                  >
                    {col.label}
                  </Label>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="px-4 py-2 border-t flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="text-xs h-7"
          >
            Restaurar padrão
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Componente interno para modo não-controlado (instancia o hook internamente).
 */
function ColumnsCustomizerUncontrolled({
  tableId,
  userId,
  columns,
}: {
  tableId: string;
  userId: string;
  columns: ColumnDef[];
}) {
  const { visibleColumnIds, toggle, reset } = useColumnVisibility({
    tableId,
    userId,
    columns,
  });

  return (
    <ColumnsCustomizerControlled
      columns={columns}
      visibleColumnIds={visibleColumnIds}
      onToggle={toggle}
      onReset={reset}
    />
  );
}

/**
 * `<ColumnsCustomizer>` — botão-ícone que abre popover com checkboxes para
 * controlar visibilidade de colunas de uma tabela.
 *
 * Suporta dois modos:
 * - **Controlado**: passar `visibleColumnIds`, `onToggle`, `onReset` — o pai gerencia estado (ex.: DataTable que já usa o hook).
 * - **Não-controlado**: omitir as props de controle — o componente instancia `useColumnVisibility` internamente.
 *
 * @example Modo não-controlado
 * ```tsx
 * <ColumnsCustomizer
 *   tableId="contacts:list"
 *   userId={session.userId}
 *   columns={CONTACT_COLUMNS}
 * />
 * ```
 *
 * @example Modo controlado (DataTable)
 * ```tsx
 * const { visibleColumnIds, toggle, reset } = useColumnVisibility({ tableId, userId, columns })
 * <ColumnsCustomizer
 *   tableId={tableId}
 *   userId={userId}
 *   columns={columns}
 *   visibleColumnIds={visibleColumnIds}
 *   onToggle={toggle}
 *   onReset={reset}
 * />
 * ```
 */
export function ColumnsCustomizer({
  tableId,
  userId,
  columns,
  visibleColumnIds,
  onToggle,
  onReset,
}: ColumnsCustomizerProps): React.JSX.Element {
  const isControlled =
    visibleColumnIds !== undefined && onToggle !== undefined && onReset !== undefined;

  if (isControlled) {
    return (
      <ColumnsCustomizerControlled
        columns={columns}
        visibleColumnIds={visibleColumnIds}
        onToggle={onToggle}
        onReset={onReset}
      />
    );
  }

  return (
    <ColumnsCustomizerUncontrolled
      tableId={tableId}
      userId={userId}
      columns={columns}
    />
  );
}
