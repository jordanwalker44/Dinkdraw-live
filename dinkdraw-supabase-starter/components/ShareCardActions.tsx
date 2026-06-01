'use client';

import { toPng } from 'html-to-image';

export function ShareCardActions({
  title,
}: {
  title: string;
}) {
  async function getImageFile() {
    const card = document.getElementById('dinkdraw-share-card');

    if (!card) {
      throw new Error('Share card not found.');
    }

    const dataUrl = await toPng(card, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#020b14',
    });

    const response = await fetch(dataUrl);
    const blob = await response.blob();

    return new File([blob], `${title || 'dinkdraw-results'}.png`, {
      type: 'image/png',
    });
  }

  async function saveImage() {
    try {
      const file = await getImageFile();
      const url = URL.createObjectURL(file);

      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();

      URL.revokeObjectURL(url);
    } catch {
      alert('Could not save image.');
    }
  }

  async function shareImage() {
    try {
      const file = await getImageFile();

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `${title} Results`,
          text: `Check out the final results from ${title} on DinkDraw.`,
          files: [file],
        });
        return;
      }

      await saveImage();
    } catch {
      alert('Could not share image.');
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
      <button className="button primary" type="button" onClick={shareImage}>
        📤 Share Image
      </button>
    </div>
  );
}
