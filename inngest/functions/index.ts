import { helloWorld } from './hello-world'
import { instagramInbound } from './instagram-inbound'
import { whatsappInbound } from './whatsapp-inbound'
import { emailPoll } from './email-poll'
import { digitalGuruProcess } from './digital-guru-process'
import { notazzSend } from './notazz-send'
import { installmentSweep } from './installment-sweep'
import { subscriptionAdvance } from './subscription-advance'
import { dunningRetry } from './dunning-retry'
import { analyticsRefreshHourly } from './analytics-refresh'
import { automationRun } from './automation-run'
import { campaignLinkClicked } from './campaign-link-clicked'

export const functions = [helloWorld, instagramInbound, whatsappInbound, emailPoll, digitalGuruProcess, notazzSend, installmentSweep, subscriptionAdvance, dunningRetry, analyticsRefreshHourly, automationRun, campaignLinkClicked]
