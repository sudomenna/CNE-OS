'use client'

import dynamic from 'next/dynamic'
import type { FlowEditorProps } from './flow-editor'

// Lazy-load FlowEditor client-side only — react-flow is large and SSR-incompatible.
// ssr: false must live in a Client Component (Next.js 15 restriction).
const FlowEditor = dynamic(
  () => import('./flow-editor').then((m) => ({ default: m.FlowEditor })),
  { ssr: false },
)

export function FlowEditorLoader(props: FlowEditorProps) {
  return <FlowEditor {...props} />
}
