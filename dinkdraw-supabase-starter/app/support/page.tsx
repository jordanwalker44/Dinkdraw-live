'use client';

import Link from 'next/link';
import { TopNav } from '../../components/TopNav';

export default function SupportPage() {
  return (
    <main className="page-shell">
      <TopNav />

      <div className="card">
        <div className="card-title">Support</div>
        <div className="card-subtitle">
          Need help with DinkDraw? We’re here to help.
        </div>

        <div className="grid" style={{ gap: 18 }}>
          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              Contact Support
            </div>

            <div className="muted">
              For support questions, bug reports, or tournament issues, email:
              <br />
              dinkdrawapp@gmail.com
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              Helpful Details To Include
            </div>

            <div className="muted">
              Please include what device you’re using, what tournament you were
              in, and what happened.
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
