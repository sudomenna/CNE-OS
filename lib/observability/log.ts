import { Axiom } from '@axiomhq/js'

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogMeta {
  [key: string]: unknown
}

function createLogger() {
  const token = process.env['AXIOM_TOKEN']
  const dataset = process.env['AXIOM_DATASET'] ?? 'cne-os'

  if (!token) {
    return {
      info: (msg: string, meta?: LogMeta) => console.log(JSON.stringify({ level: 'info', msg, ...meta })),
      warn: (msg: string, meta?: LogMeta) => console.warn(JSON.stringify({ level: 'warn', msg, ...meta })),
      error: (msg: string, meta?: LogMeta) => console.error(JSON.stringify({ level: 'error', msg, ...meta })),
      debug: (msg: string, meta?: LogMeta) => console.debug(JSON.stringify({ level: 'debug', msg, ...meta })),
    }
  }

  const axiom = new Axiom({ token })

  function log(level: LogLevel, msg: string, meta?: LogMeta) {
    axiom.ingest(dataset, [{ level, msg, _time: new Date().toISOString(), ...meta }])
    void axiom.flush()
  }

  return {
    info: (msg: string, meta?: LogMeta) => log('info', msg, meta),
    warn: (msg: string, meta?: LogMeta) => log('warn', msg, meta),
    error: (msg: string, meta?: LogMeta) => log('error', msg, meta),
    debug: (msg: string, meta?: LogMeta) => log('debug', msg, meta),
  }
}

export const log = createLogger()
