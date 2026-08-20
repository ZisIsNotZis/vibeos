import html2canvas from 'html2canvas';

export async function captureElement(element: HTMLElement) {
  const canvas = await html2canvas(element, { backgroundColor: null, useCORS: true, logging: false, scale: 1 });
  return canvas.toDataURL('image/png');
}

export async function captureScreen() {
  const dataUrl = await captureElement(document.querySelector<HTMLElement>('.os') ?? document.body);
  const link = document.createElement('a'); link.download = `vibeos-${Date.now()}.png`; link.href = dataUrl; link.click();
}
