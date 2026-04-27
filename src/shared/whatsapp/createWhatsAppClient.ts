import { Client, LocalAuth } from 'whatsapp-web.js'

export function createWhatsAppClient(dataPath: string): Client {
  return new Client({
    authStrategy: new LocalAuth({
      dataPath
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  })
}
