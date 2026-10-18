import { toPng } from 'html-to-image';

export async function downloadCurrentScreenPng(): Promise<void> {
  const target = document.querySelector<HTMLElement>('#app-main');
  if (!target) throw new Error('Current screen is unavailable for capture');
  const image = await toPng(target, { pixelRatio: 2, cacheBust: true, skipFonts: true });
  const link = document.createElement('a');
  link.href = image;
  link.download = `aura-${window.location.hash.replace('#/', '') || 'command'}-${Date.now()}.png`;
  link.click();
}