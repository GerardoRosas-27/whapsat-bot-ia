import * as fs from 'fs'
import * as path from 'path'

const LOG_DIR = path.join(process.cwd(), 'logs')
const LOG_FILE = path.join(LOG_DIR, 'server.log')

// Asegurar que el directorio de logs existe
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

interface LogEntry {
  timestamp: string
  level: 'INFO' | 'ERROR' | 'WARN' | 'DEBUG'
  message: string
  data?: any
}

function formatLogEntry(entry: LogEntry): string {
  const dataStr = entry.data ? ` | Data: ${JSON.stringify(entry.data)}` : ''
  return `[${entry.timestamp}] [${entry.level}] ${entry.message}${dataStr}\n`
}

export const logger = {
  info: (message: string, data?: any) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message,
      data
    }
    const logLine = formatLogEntry(entry)
    fs.appendFileSync(LOG_FILE, logLine)
    console.log(`[INFO] ${message}`, data || '')
  },

  error: (message: string, data?: any) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message,
      data
    }
    const logLine = formatLogEntry(entry)
    fs.appendFileSync(LOG_FILE, logLine)
    console.error(`[ERROR] ${message}`, data || '')
  },

  warn: (message: string, data?: any) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'WARN',
      message,
      data
    }
    const logLine = formatLogEntry(entry)
    fs.appendFileSync(LOG_FILE, logLine)
    console.warn(`[WARN] ${message}`, data || '')
  },

  debug: (message: string, data?: any) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'DEBUG',
      message,
      data
    }
    const logLine = formatLogEntry(entry)
    fs.appendFileSync(LOG_FILE, logLine)
    console.log(`[DEBUG] ${message}`, data || '')
  }
}
