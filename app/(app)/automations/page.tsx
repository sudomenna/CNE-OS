/**
 * /automations — Lista de fluxos de automação.
 * Server Component — lê DB via Drizzle.
 * T-11-11: UI /automations lista + editor visual drag-drop
 * Spec: docs/20-domain/15-automation.md
 */

import { desc, isNull } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { automationFlow } from '@/lib/db/schema/automation'
import { brand } from '@/lib/db/schema/organization'
import { eq } from 'drizzle-orm'
import { AutomationList } from '@/components/automation/automation-list'

export const metadata = {
  title: 'Automações — CNE-OS',
}

export default async function AutomationsPage() {
  const flows = await db
    .select({
      id: automationFlow.id,
      name: automationFlow.name,
      isActive: automationFlow.isActive,
      brandId: automationFlow.brandId,
      brandName: brand.name,
      createdAt: automationFlow.createdAt,
    })
    .from(automationFlow)
    .leftJoin(brand, eq(brand.id, automationFlow.brandId))
    .where(isNull(automationFlow.deletedAt))
    .orderBy(desc(automationFlow.createdAt))
    .limit(200)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Automações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie e gerencie fluxos de automação com gatilhos, condições e ações.
          </p>
        </div>
      </div>

      <AutomationList flows={flows} />
    </div>
  )
}
