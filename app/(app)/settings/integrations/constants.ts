/**
 * INTEGRATION_PROVIDERS — fonte única de configuração por provedor.
 *
 * kind:
 *   'channel'     — tem channel_account no DB (whatsapp, instagram)
 *   'webhook'     — configura via env var apenas (digital_guru, notazz);
 *                   migração para DB encriptado fica em Sprint 16+
 *   'placeholder' — adapter não implementado ainda (brevo)
 *
 * channelKind — só presente quando kind='channel'; mapeia para enum
 *   channel_kind (docs/30-contracts/01-enums.md).
 */
export const INTEGRATION_PROVIDERS = [
  {
    provider: 'digital_guru',
    kind: 'webhook' as const,
    displayName: 'Digital Guru',
    description: 'Plataforma de vendas. Recebe webhooks de aprovação, reembolso e ciclo de assinatura.',
    envVarKeys: ['DIGITAL_GURU_WEBHOOK_SECRET'],
  },
  {
    provider: 'brevo',
    kind: 'placeholder' as const,
    displayName: 'Brevo',
    description: 'Plataforma de e-mail marketing. Adapter em desenvolvimento.',
    envVarKeys: ['BREVO_WEBHOOK_SECRET'],
  },
  {
    provider: 'whatsapp_official',
    kind: 'channel' as const,
    channelKind: 'whatsapp' as const,
    displayName: 'WhatsApp (Meta)',
    description: 'Canal de mensagens via API oficial do WhatsApp Business.',
    envVarKeys: ['WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'],
  },
  {
    provider: 'instagram',
    kind: 'channel' as const,
    channelKind: 'instagram' as const,
    displayName: 'Instagram',
    description: 'Canal de mensagens via Instagram Direct (Meta Graph API).',
    envVarKeys: ['INSTAGRAM_APP_SECRET', 'INSTAGRAM_VERIFY_TOKEN'],
  },
  {
    provider: 'notazz',
    kind: 'webhook' as const,
    displayName: 'Notazz',
    description: 'Emissão de NF-e. Recebe webhooks de confirmação de emissão.',
    envVarKeys: ['NOTAZZ_WEBHOOK_TOKEN', 'NOTAZZ_API_KEY'],
  },
] as const

export type ProviderKey = (typeof INTEGRATION_PROVIDERS)[number]['provider']
export type ProviderKind = (typeof INTEGRATION_PROVIDERS)[number]['kind']

/** Extrai a definição de um provider pelo seu key. */
export type ProviderDef = (typeof INTEGRATION_PROVIDERS)[number]

/** Retorna a definição ou undefined. */
export function findProvider(provider: string): ProviderDef | undefined {
  return INTEGRATION_PROVIDERS.find((p) => p.provider === provider) as
    | ProviderDef
    | undefined
}
