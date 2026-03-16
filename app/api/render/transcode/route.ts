import type { NextRequest } from 'next/server'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { NextResponse } from 'next/server'

const execFileAsync = promisify(execFile)

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('video') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No video file provided' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const timestamp = Date.now()
  const inputPath = join(tmpdir(), `orbitone-input-${timestamp}.webm`)
  const outputPath = join(tmpdir(), `orbitone-output-${timestamp}.mp4`)

  try {
    await writeFile(inputPath, buffer)

    await execFileAsync('ffmpeg', [
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      '-y',
      outputPath,
    ], { timeout: 280_000 })

    const mp4Buffer = await readFile(outputPath)

    return new NextResponse(mp4Buffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="orbitone-export-${timestamp}.mp4"`,
      },
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Transcoding failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
  finally {
    await Promise.allSettled([
      unlink(inputPath),
      unlink(outputPath),
    ])
  }
}
