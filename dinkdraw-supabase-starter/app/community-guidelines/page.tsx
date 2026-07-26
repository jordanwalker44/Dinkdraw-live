'use client';

import Link from 'next/link';
import { TopNav } from '../../components/TopNav';

export default function CommunityGuidelinesPage() {
  return (
    <main className="page-shell">
      <TopNav />

      <div className="card">
        <div className="card-title">Community Guidelines</div>
        <div className="card-subtitle">Last updated: July 2026</div>

        <div className="grid" style={{ gap: 18 }}>
          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Keep It Tournament-Related</div>
            <div className="muted">
              Tournament rooms are for schedules, courts, partners, scores, and other event coordination.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Treat Players With Respect</div>
            <div className="muted">
              Harassment, threats, hate, sexual content, bullying, impersonation, and targeted insults are not allowed.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Protect Privacy</div>
            <div className="muted">
              Do not share another person&apos;s private contact, location, financial, health, or account information.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>No Spam or Abuse</div>
            <div className="muted">
              Do not flood rooms, advertise unrelated products, attempt scams, or misuse reporting and blocking tools.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Moderation</div>
            <div className="muted">
              Tournament organizers may remove messages. Players can delete their own messages, report concerning
              content, and block another player&apos;s conversation messages.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Get Help</div>
            <div className="muted">
              For serious or urgent concerns, save relevant details and contact dinkdrawapp@gmail.com. Contact local
              emergency services when someone may be in immediate danger.
            </div>
          </div>

          <Link href="/" className="button primary">Back to DinkDraw</Link>
        </div>
      </div>
    </main>
  );
}
