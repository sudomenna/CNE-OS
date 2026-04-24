/**
 * Route Handler: GET /go/[slug]
 *
 * Resolve um trackable_link pelo slug e redireciona (302) para destination_url.
 * Emite o evento `campaign_link_clicked` via Inngest de forma fire-and-forget
 * para não bloquear a latência do redirect.
 *
 * Specs:
 *   docs/20-domain/07-campaign-creative.md §8 — TE-CAMPAIGN-CLICK
 *   docs/30-contracts/03-timeline-event-catalog.md (Marketing / Funil)
 *   docs/80-roadmap/03-sprint-5-marketing-funnels.md T-5-05
 *
 * NÃO é Server Action — é Route Handler puro (Next.js App Router).
 * NÃO requer autenticação: a URL /go/* é pública (link rastreável externo).
 */
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { trackableLink } from '@/lib/db/schema/campaign'
import { inngest } from '@/inngest/client'
import type { CampaignLinkClicked } from '@/lib/timeline/schemas/campaign-click'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  // Busca trackable_link pelo slug (INV-CAMPAIGN-03: slug globalmente único)
  const link = await db.query.trackableLink.findFirst({
    where: eq(trackableLink.slug, slug),
  })

  if (!link) {
    return new NextResponse('Link not found', { status: 404 })
  }

  // TE-CAMPAIGN-CLICK: emissão Inngest fire-and-forget — não bloqueia redirect
  // OQ-TE-02: agregar por sessão para não inundar timeline (pendente Sprint 5)
  const payload: CampaignLinkClicked = {
    kind: 'campaign_link_clicked',
    trackable_link_id: link.id,
    slug: link.slug,
    utm_snapshot: (link.utm ?? {}) as Record<string, unknown>,
    ip: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? undefined,
    user_agent: request.headers.get('user-agent') ?? undefined,
  }

  // Fire-and-forget: erro de emissão não cancela o redirect
  inngest
    .send({
      name: 'campaign/link.clicked',
      data: payload,
    })
    .catch(console.error)

  // 302: redirect temporário (preserva rastreabilidade em futuros cliques)
  return NextResponse.redirect(link.destinationUrl, 302)
}
