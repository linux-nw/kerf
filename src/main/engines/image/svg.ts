import { optimize } from 'svgo'
import { EngineError } from '../../errors'
import type { CompressLevel } from '../pdf/profiles'

export function compressSvgBytes(input: Uint8Array, level: CompressLevel): Uint8Array {
  const source = Buffer.from(input).toString('utf8')
  try {
    const result = optimize(source, {
      multipass: true,
      floatPrecision: level === 'winzig' ? 3 : 4,
      plugins: [
        {
          name: 'preset-default',
          params: { overrides: { cleanupIds: false, removeDesc: false, removeHiddenElems: false } }
        }
      ]
    })
    return new Uint8Array(Buffer.from(result.data, 'utf8'))
  } catch {
    throw new EngineError('unreadable', 'Die SVG-Datei konnte nicht gelesen werden')
  }
}
