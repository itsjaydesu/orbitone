import type { ExportFormat, ExportSessionInitRequest } from '@/lib/export'
import { Buffer } from 'node:buffer'
import { NextResponse } from 'next/server'
import { isExportFormat } from '@/lib/export'
import {
  createExportSession,
  finalizeExportSession,
  removeExportSession,
  writeExportAudio,
  writeExportFrame,
} from '@/lib/server/export-session'

export const runtime = 'nodejs'
export const maxDuration = 300

function parseRequiredString(formData: FormData, fieldName: string) {
  const value = formData.get(fieldName)

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing ${fieldName}.`)
  }

  return value
}

function parseRequiredNumber(formData: FormData, fieldName: string) {
  const value = Number(parseRequiredString(formData, fieldName))

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${fieldName}.`)
  }

  return value
}

function parseInitRequest(formData: FormData): ExportSessionInitRequest {
  const format = parseRequiredString(formData, 'format')

  if (!isExportFormat(format)) {
    throw new Error(`Unsupported export format: ${format}.`)
  }

  return {
    fileName: parseRequiredString(formData, 'fileName'),
    format,
    fps: parseRequiredNumber(formData, 'fps'),
    frameCount: parseRequiredNumber(formData, 'frameCount'),
    height: parseRequiredNumber(formData, 'height'),
    totalDurationSeconds: parseRequiredNumber(formData, 'totalDurationSeconds'),
    width: parseRequiredNumber(formData, 'width'),
  }
}

async function handleInit(formData: FormData) {
  const session = await createExportSession(parseInitRequest(formData))
  return new NextResponse(session.sessionId, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}

async function handleFrameUpload(formData: FormData) {
  const sessionId = parseRequiredString(formData, 'sessionId')
  const frameIndex = parseRequiredNumber(formData, 'frameIndex')
  const frame = formData.get('frame')

  if (!(frame instanceof File)) {
    throw new Error('Missing frame upload.')
  }

  await writeExportFrame(
    sessionId,
    frameIndex,
    Buffer.from(await frame.arrayBuffer()),
  )

  return NextResponse.json({ ok: true })
}

async function handleAudioUpload(formData: FormData) {
  const sessionId = parseRequiredString(formData, 'sessionId')
  const audio = formData.get('audio')

  if (!(audio instanceof File)) {
    throw new Error('Missing audio upload.')
  }

  await writeExportAudio(sessionId, Buffer.from(await audio.arrayBuffer()))

  return NextResponse.json({ ok: true })
}

async function handleFinalize(formData: FormData) {
  const sessionId = parseRequiredString(formData, 'sessionId')
  console.info(`[export][session:${sessionId}] route finalize request received`)
  const result = await finalizeExportSession(sessionId)

  await removeExportSession(sessionId)
  console.info(`[export][session:${sessionId}] route finalize response ready bytes=${result.buffer.byteLength}`)

  return new NextResponse(result.buffer, {
    headers: {
      'Content-Disposition': `attachment; filename="${result.fileName}"`,
      'Content-Type': result.contentType,
    },
  })
}

export async function POST(request: Request) {
  let action: string | null = null
  try {
    action = new URL(request.url).searchParams.get('action')
    const formData = await request.formData()

    if (action === 'init') {
      return await handleInit(formData)
    }

    if (action === 'frame') {
      return await handleFrameUpload(formData)
    }

    if (action === 'audio') {
      return await handleAudioUpload(formData)
    }

    if (action === 'finalize') {
      return await handleFinalize(formData)
    }

    return NextResponse.json({ error: 'Unsupported export action.' }, { status: 400 })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Export request failed.'
    console.error(
      `[export][route] action=${action ?? 'unknown'} failed: ${message}`,
      error,
    )
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionId = new URL(request.url).searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId.' }, { status: 400 })
    }

    await removeExportSession(sessionId)
    return NextResponse.json({ ok: true })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel export.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
