import { NextRequest, NextResponse } from 'next/server'
import {
  handleFacebookMarketplaceWebhook,
  validateMetaWebhookSignature,
  verifyFacebookMarketplaceChallenge,
  type FacebookMarketplaceWebhookPayload
} from '@/modules/marketplace-bot/domain'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const verification = verifyFacebookMarketplaceChallenge(
    request.nextUrl.searchParams
  )

  if (!verification.ok) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  return new NextResponse(verification.challenge || '', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')

  if (!validateMetaWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Firma invalida' }, { status: 403 })
  }

  let payload: FacebookMarketplaceWebhookPayload
  try {
    payload = JSON.parse(rawBody) as FacebookMarketplaceWebhookPayload
  } catch {
    return NextResponse.json({ error: 'JSON invalido' }, { status: 400 })
  }

  const result = await handleFacebookMarketplaceWebhook(payload)
  return NextResponse.json({ ok: true, ...result })
}
