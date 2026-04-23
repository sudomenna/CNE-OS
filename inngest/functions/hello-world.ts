import { inngest } from '@/inngest/client'

export const helloWorld = inngest.createFunction(
  { id: 'hello-world', name: 'Hello World (smoke test)' },
  { event: 'test/hello.world' },
  async ({ event, step }) => {
    await step.sleep('wait-a-moment', '1s')
    return { message: `Hello ${String(event.data.email ?? 'world')}` }
  },
)
