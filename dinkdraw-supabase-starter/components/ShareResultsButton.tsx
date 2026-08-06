'use client';

export function ShareResultsButton({
  title,
  resultsUrl,
  shareCardUrl,
  resultSummary,
}: {
  title: string;
  resultsUrl: string;
  shareCardUrl: string;
  resultSummary?: string;
}) {
  async function handleShare() {
    const shareText = `🏆 ${title} Final Results${resultSummary ? `\n\n${resultSummary}` : ''}\n\nView the DinkDraw results:\n${resultsUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${title} Final Results`,
          text: shareText,
          url: shareCardUrl,
        });
        return;
      } catch {
        // User canceled share sheet. Do nothing.
      }
    }

    try {
      await navigator.clipboard.writeText(`${shareText}\n\n${shareCardUrl}`);
      alert('Results link copied.');
    } catch {
      alert('Could not share or copy the results link.');
    }
  }

  return (
    <button
      type="button"
      className="button primary"
      onClick={handleShare}
      style={{
        width: '100%',
        minHeight: 52,
        fontWeight: 900,
        fontSize: 17,
      }}
    >
      🏆 Share Results
    </button>
  );
}
