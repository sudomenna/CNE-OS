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
 *   docs/60-flows/14-campaign-attribution.md §Clique (passo 2)
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

  // FLOW-14 §2: extrair contact_id em ordem de prioridade
  //   1. cookie cne_cid (definido em clique anterior ou login)
  //   2. query param ?cid=<contactId> (campanhas de e-mail pós-identificação)
  //   3. null (clique anônimo — emissão de TE-CAMPAIGN-CLICK com contact_id=null)
  const url = new URL(request.url)
  const contactId: string | null =
    request.cookies.get('cne_cid')?.value ??
    url.searchParams.get('cid') ??
    null

  // FLOW-14 §2: extrair ou gerar session_id
  //   cookie cne_sid se já existir; senão: gerar novo UUID e setar na resposta
  const existingSessionId = request.cookies.get('cne_sid')?.value
  const isNewSession = !existingSessionId
  const sessionId = existingSessionId ?? crypto.randomUUID()

  // TE-CAMPAIGN-CLICK: emissão Inngest fire-and-forget — não bloqueia redirect
  // OQ-TE-02: agregar por sessão para não inundar timeline (pendente Fase 2)
  const payload: CampaignLinkClicked = {
    kind: 'campaign_link_clicked',
    trackable_link_id: link.id,
    slug: link.slug,
    utm_snapshot: (link.utm ?? {}) as Record<string, unknown>,
    contact_id: contactId,
    session_id: sessionId,
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
  const response = NextResponse.redirect(link.destinationUrl, 302)

  // FLOW-14 §2: persistir session_id em cookie se foi gerado agora
  // httpOnly: protege de leitura via JS; sameSite=lax: seguro em navegação cross-site
  if (isNewSession) {
    response.cookies.set('cne_sid', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 86400 * 30, // 30 dias
      path: '/',
    })
  }

  return response
}
