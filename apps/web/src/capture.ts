export async function captureScreen() {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen capture is unavailable in this browser.');
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser' }, audio: false });
  try { const video = document.createElement('video'); video.srcObject = stream; await video.play(); await new Promise(requestAnimationFrame); const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d')?.drawImage(video, 0, 0); const link = document.createElement('a'); link.download = `vibeos-${Date.now()}.png`; link.href = canvas.toDataURL('image/png'); link.click(); }
  finally { stream.getTracks().forEach(track => track.stop()); }
}
