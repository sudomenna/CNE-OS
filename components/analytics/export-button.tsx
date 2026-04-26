/**
 * ExportButton — botão "Exportar CSV" reutilizável para dashboards de analytics.
 * T-12-29: docs/70-ux/08-screen-dashboards.md §6 — Export CSV respeita filtros aplicados.
 *
 * Usa <a> nativo (não Next.js Link) pois href é construído dinamicamente com searchParams
 * e typedRoutes não aceita strings não-literais de rotas do App Router.
 */

import { Button } from "@/components/ui/button";

export type ExportButtonProps = {
  /** URL do route handler de export, incluindo query string de filtros */
  href: string;
  /** Label do botão; default "Exportar CSV" */
  label?: string;
};

export function ExportButton({
  href,
  label = "Exportar CSV",
}: ExportButtonProps) {
  return (
    <Button variant="outline" size="sm" asChild>
      {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
      <a href={href} aria-label={label}>
        {label}
      </a>
    </Button>
  );
}
