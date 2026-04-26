export const INTEGRATION_PROVIDERS = [
  {
    provider: 'digital_guru',
    displayName: 'Digital Guru',
    envVarKeys: ['DIGITAL_GURU_WEBHOOK_SECRET'],
  },
  {
    provider: 'brevo',
    displayName: 'Brevo',
    envVarKeys: ['BREVO_WEBHOOK_SECRET'],
  },
  {
    provider: 'whatsapp_official',
    displayName: 'WhatsApp (Meta)',
    envVarKeys: ['WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'],
  },
  {
    provider: 'instagram',
    displayName: 'Instagram',
    envVarKeys: ['INSTAGRAM_APP_SECRET', 'INSTAGRAM_VERIFY_TOKEN'],
  },
  {
    provider: 'notazz',
    displayName: 'Notazz',
    envVarKeys: ['NOTAZZ_WEBHOOK_TOKEN', 'NOTAZZ_API_KEY'],
  },
] as const

export type ProviderKey = (typeof INTEGRATION_PROVIDERS)[number]['provider']
