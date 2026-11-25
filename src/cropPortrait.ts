import { Bytes } from 'firebase/firestore'
import { maxPortraitBytes } from './portraitData'

export type Crop = { zoom: number; x: number; y: number }
export const centered: Crop = { zoom: 1, x: 50, y: 50 }

export async function openPortrait(file: File) {
  if (file.size > 32 * 1024 * 1024) throw new Error('Bilden är för stor. Välj en fil under 32 MB.')
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const tag = String.fromCharCode(...header)
  if (!(tag.startsWith('\x89PNG\r\n\x1a\n') || tag.startsWith('\xff\xd8\xff') || (tag.startsWith('RIFF') && tag.slice(8) === 'WEBP'))) {
    throw new Error('Välj en PNG-, JPEG- eller WebP-bild.')
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } catch {
    throw new Error('Bilden gick inte att öppna. Välj en annan fil.')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function drawPortrait(canvas: HTMLCanvasElement, img: HTMLImageElement, crop: Crop) {
  const size = Math.min(img.naturalWidth, img.naturalHeight) / crop.zoom
  const x = (img.naturalWidth - size) * crop.x / 100
  const y = (img.naturalHeight - size) * crop.y / 100
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Förhandsvisningen kunde inte öppnas.')
  ctx.fillStyle = '#fff4dd'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, x, y, size, size, 0, 0, canvas.width, canvas.height)
}

export async function encodePortrait(canvas: HTMLCanvasElement) {
  for (const quality of [0.88, 0.73, 0.55]) {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.type === 'image/jpeg' && blob.size <= maxPortraitBytes) return Bytes.fromUint8Array(new Uint8Array(await blob.arrayBuffer()))
  }
  throw new Error('Porträttet kunde inte sparas. Prova en annan bild.')
}
