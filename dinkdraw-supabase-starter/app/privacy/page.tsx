'use client';

import Link from 'next/link';
import { TopNav } from '../../components/TopNav';

export default function PrivacyPage() {
  return (
    <main className="page-shell">
      <TopNav />

      <div className="card">
        <div className="card-title">Privacy Policy</div>
        <div className="card-subtitle">
          Last updated: May 2026
        </div>

        <div className="grid" style={{ gap: 18 }}>
          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              Information We Collect
            </div>

            <div className="muted">
              DinkDraw stores account information such as email addresses,
              display names, tournament participation, match scores,
              and player statistics.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              How Information Is Used
            </div>

            <div className="muted">
              Your information is used to operate tournaments,
              standings, player stats, and account functionality
              inside DinkDraw.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              Third-Party Services
            </div>

            <div className="muted">
              DinkDraw uses Supabase for authentication,
              database storage, and realtime syncing.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              Data Sharing
            </div>

            <div className="muted">
              DinkDraw does not sell personal information.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              Account Deletion
            </div>

            <div className="muted">
              Users can permanently delete their account
              directly from the Account page inside the app.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              Contact
            </div>

            <div className="muted">
              For support or privacy questions, contact:
              <br />
              dinkdrawapp@gmail.com
            </div>
          </div>

          <Link href="/account" className="button primary">
            Back to Account
          </Link>
        </div>
      </div>
    </main>
  );
}
