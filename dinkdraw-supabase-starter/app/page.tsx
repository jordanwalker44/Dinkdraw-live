import Link from 'next/link';
import { TopNav } from '@/components/TopNav';

export default function HomePage() {
  return (
    <main className="page-shell">
      <div className="hero"><div className="hero-inner">
        <img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" />
        <h1 className="hero-title">DinkDraw</h1>
        <p className="hero-subtitle">Supabase-connected starter for accounts, tournaments, join codes, and claiming player spots.</p>
      </div></div>
      <TopNav />
      <div className="grid">
        <Link href="/account"><button className="action-button blue"><div className="action-title">Create an account</div><div className="action-subtitle">Sign up or sign in with Supabase Auth.</div></button></Link>
        <Link href="/tournament/create"><button className="action-button green"><div className="action-title">Create a Round Robin Tournament</div><div className="action-subtitle">Create a real tournament in Supabase and get a live join code.</div></button></Link>
        <Link href="/tournament/join"><button className="action-button black"><div className="action-title">Join a Round Robin Tournament</div><div className="action-subtitle">Enter a join code and claim your player spot from any phone.</div></button></Link>
      </div>
    </main>
  );
}
