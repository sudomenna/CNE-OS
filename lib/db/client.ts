import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@/lib/db/schema/index'

const connectionString = process.env['DATABASE_URL']!

// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(connectionString, { prepare: false })

export const db = drizzle(client, { schema })

// ADR-11: funções que fazem write recebem `tx: DbTx` para suportar transações
export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0]
