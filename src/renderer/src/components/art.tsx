import type { PdfMode } from '@shared/types'

const MERGE = `<rect class="kf-f-1 kf-s-ls" x="22" y="38" width="44" height="58" rx="4"/><rect class="kf-f-1 kf-s-lc" x="34" y="30" width="44" height="58" rx="4"/><rect class="kf-f-1 kf-s-mu" x="46" y="22" width="44" height="58" rx="4"/><path class="kf-s-lc" d="M54 36h28M54 44h28M54 52h20" stroke-linecap="round"/><path class="kf-s-act" d="M104 60h32m-8-8 8 8-8 8" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><rect class="kf-f-acs kf-s-ac" x="156" y="16" width="56" height="74" rx="4" stroke-width="2"/><path class="kf-s-act" d="M166 32h36M166 42h36M166 52h36M166 62h26" stroke-linecap="round"/>`

const SPLIT = `<rect class="kf-f-acs kf-s-ac" x="26" y="22" width="56" height="74" rx="4" stroke-width="2"/><path class="kf-s-act" d="M36 38h36M36 48h36M36 58h36M36 68h26" stroke-linecap="round"/><path class="kf-s-act" d="M104 60h32m-8-8 8 8-8 8" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><rect class="kf-f-1 kf-s-mu" x="154" y="14" width="36" height="46" rx="4"/><rect class="kf-f-1 kf-s-mu" x="154" y="64" width="36" height="46" rx="4"/><rect class="kf-f-1 kf-s-lc" x="196" y="14" width="36" height="46" rx="4"/><path class="kf-s-lc" d="M160 26h24M160 34h24M160 76h24M160 84h24" stroke-linecap="round"/>`

const PAGES = `<rect class="kf-f-1 kf-s-mu" x="20" y="28" width="38" height="52" rx="4"/><rect class="kf-f-acs kf-s-ac" x="66" y="28" width="38" height="52" rx="4" stroke-width="2"/><rect class="kf-f-1 kf-s-mu" x="112" y="28" width="38" height="52" rx="4"/><rect class="kf-f-1 kf-s-lc" x="162" y="34" width="52" height="38" rx="4" transform="rotate(12 188 53)"/><path class="kf-s-lc" d="M28 42h22M28 50h22M74 42h22M74 50h22M120 42h22M120 50h22" stroke-linecap="round"/><path class="kf-s-act" d="M85 92c0 10 8 14 18 14h40" stroke-width="2" stroke-linecap="round"/><path class="kf-s-act" d="m136 98 8 8-8 8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`

const WATERMARK = `<rect class="kf-f-1 kf-s-mu" x="82" y="12" width="76" height="96" rx="5"/><path class="kf-s-ls" d="M96 32h48M96 42h48M96 52h48M96 62h36" stroke-linecap="round"/><text class="kf-f-ac kf-nostroke" x="120" y="86" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="15" font-weight="500" transform="rotate(-24 120 86)">ENTWURF</text>`

const NUMBERS = `<rect class="kf-f-1 kf-s-lc" x="40" y="14" width="48" height="92" rx="4"/><rect class="kf-f-1 kf-s-lc" x="96" y="14" width="48" height="92" rx="4"/><rect class="kf-f-1 kf-s-lc" x="152" y="14" width="48" height="92" rx="4"/><path class="kf-s-ls" d="M50 30h28M50 40h28M106 30h28M106 40h28M162 30h28M162 40h28" stroke-linecap="round"/><g class="kf-f-act kf-nostroke" font-family="IBM Plex Mono,monospace" font-size="12" font-weight="500" text-anchor="middle"><text x="64" y="94">1</text><text x="120" y="94">2</text><text x="176" y="94">3</text></g>`

const OCR_DEMO = `<g transform="rotate(-4 98 135)"><rect class="kf-f-2 kf-s-ls" x="28" y="40" width="140" height="190" rx="6"/><path class="kf-s-lc" d="M44 66h70" stroke-width="7" stroke-linecap="round" opacity=".6"/><path class="kf-s-lc" d="M44 92h108M44 106h100M44 120h108M44 134h84M44 160h108M44 174h96M44 188h106" stroke-width="4" stroke-linecap="round" opacity=".45"/><rect class="kf-f-ac kf-nostroke" x="20" y="108" width="156" height="3" opacity=".9"/></g><path class="kf-s-act" d="M190 135h30m-8-8 8 8-8 8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect class="kf-f-1 kf-s-mu" x="232" y="30" width="144" height="210" rx="6"/><path class="kf-s-ink" d="M246 56h74" stroke-width="7" stroke-linecap="round"/><path class="kf-s-mu" d="M246 84h112M246 98h104M246 112h112M246 126h72M262 154h60M262 170h72M262 186h50M246 212h92" stroke-width="3" stroke-linecap="round"/><g class="kf-f-act kf-nostroke"><circle cx="250" cy="154" r="2.5"/><circle cx="250" cy="170" r="2.5"/><circle cx="250" cy="186" r="2.5"/></g>`

const PACK = `<rect class="kf-f-2 kf-s-lc" x="12" y="26" width="34" height="44" rx="4"/><rect class="kf-f-2 kf-s-mu" x="30" y="38" width="34" height="44" rx="4"/><path class="kf-s-act" d="M80 60h32m-8-8 8 8-8 8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect class="kf-f-acs kf-s-ac" x="128" y="22" width="60" height="14" rx="3" stroke-width="2"/><path class="kf-f-acs kf-s-ac" d="M132 36v52a4 4 0 0 0 4 4h44a4 4 0 0 0 4-4V36" stroke-width="2"/><path class="kf-s-act" d="M148 50h24" stroke-width="2" stroke-linecap="round"/>`

const UNPACK = `<rect class="kf-f-acs kf-s-ac" x="12" y="22" width="60" height="14" rx="3" stroke-width="2"/><path class="kf-f-acs kf-s-ac" d="M16 36v52a4 4 0 0 0 4 4h44a4 4 0 0 0 4-4V36" stroke-width="2"/><path class="kf-s-act" d="M32 50h24" stroke-width="2" stroke-linecap="round"/><path class="kf-s-act" d="M88 60h32m-8-8 8 8-8 8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect class="kf-f-2 kf-s-lc" x="138" y="26" width="34" height="44" rx="4"/><rect class="kf-f-2 kf-s-mu" x="154" y="38" width="34" height="44" rx="4"/>`

const PDF_ART: Record<PdfMode, string> = { merge: MERGE, split: SPLIT, pages: PAGES, watermark: WATERMARK, numbers: NUMBERS }

interface ArtProps {
  markup: string
  viewBox: string
  className?: string
}

function Art({ markup, viewBox, className }: ArtProps) {
  return <svg className={`kf-art${className ? ` ${className}` : ''}`} viewBox={viewBox} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: markup }} />
}

export function PdfArt({ mode }: { mode: PdfMode }) {
  return <Art markup={PDF_ART[mode]} viewBox="0 0 240 120" />
}

export function OcrDemoArt() {
  return <Art markup={OCR_DEMO} viewBox="0 0 400 300" />
}

export function ArchiveArt({ kind }: { kind: 'pack' | 'unpack' }) {
  return <Art markup={kind === 'pack' ? PACK : UNPACK} viewBox="0 0 200 110" className="kf-drop__art" />
}
