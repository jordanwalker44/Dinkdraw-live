const steps = [
  {
    title: 'Open DinkDraw',
    body: 'Use the organizer link, open the DinkDraw app, or go to dinkdraw.app.',
  },
  {
    title: 'Create your account',
    body: 'Tap Sign In or Create Account. Use the email you want tied to your tournament history and stats.',
  },
  {
    title: 'Join the tournament',
    body: 'Tap Join Tournament and enter the 6-character join code from your organizer.',
  },
  {
    title: 'Claim your spot',
    body: 'Choose an open player spot. Your name will appear so the organizer knows you are checked in.',
  },
  {
    title: 'Allow notifications',
    body: 'Let DinkDraw send notifications so you know when play starts, where to go, and when scores are posted.',
  },
  {
    title: 'Follow along',
    body: 'During the event, DinkDraw shows your court, partner, opponents, scores, and standings.',
  },
];

export default function HowToPage() {
  return (
    <main className="how-to-flyer-page">
      <section className="how-to-flyer">
        <div className="how-to-flyer-brand">
          <div className="how-to-flyer-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <div className="how-to-flyer-logo">
              Dink<span>Draw</span>
            </div>
            <div className="how-to-flyer-tagline">Pickleball tournaments made easy</div>
          </div>
        </div>

        <div className="how-to-flyer-hero">
          <div>
            <div className="how-to-flyer-eyebrow">Player Setup Guide</div>
            <h1>Get into your tournament</h1>
            <p>
              Follow these quick steps before play starts so you can see your court, partner, opponents,
              scores, standings, and tournament updates.
            </p>
          </div>

          <div className="how-to-code-panel">
            <div className="how-to-code-label">Tournament Join Code</div>
            <div className="how-to-code-box">______</div>
            <div className="how-to-code-url">dinkdraw.app/tournament/join</div>
          </div>
        </div>

        <div className="how-to-flyer-steps">
          {steps.map((step, index) => (
            <div className="how-to-flyer-step" key={step.title}>
              <div className="how-to-flyer-step-number">{index + 1}</div>
              <div>
                <h2>{step.title}</h2>
                <p>{step.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="how-to-flyer-footer">
          <div>
            <strong>Need help?</strong> Ask your tournament organizer to confirm the join code or clear your spot.
          </div>
          <div className="how-to-flyer-url">DINKDRAW.APP</div>
        </div>
      </section>
    </main>
  );
}
