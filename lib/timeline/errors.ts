/**
 * MOD-TIMELINE — Domain errors for emitTimelineEvent
 *
 * docs/20-domain/04-timeline.md §5
 * docs/50-business-rules/BR-TIMELINE.md
 */

export class UnknownTimelineKindError extends Error {
  constructor(kind: string) {
    super(`Unknown timeline event kind: "${kind}". Register it in lib/timeline/schemas/index.ts`)
    this.name = 'UnknownTimelineKindError'
  }
}

export class TimelinePayloadError extends Error {
  constructor(kind: string, zodError: string) {
    super(`Timeline payload for kind "${kind}" is invalid: ${zodError}`)
    this.name = 'TimelinePayloadError'
  }
}

export class TimelineOccurredAtError extends Error {
  constructor() {
    super('occurredAt cannot be in the future (INV-TIMELINE-06)')
    this.name = 'TimelineOccurredAtError'
  }
}
