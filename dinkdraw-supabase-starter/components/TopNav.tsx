import Link from 'next/link';

export function TopNav() {
  return (
    <div className="top-nav">
      <Link href="/"><button>Home</button></Link>
      <Link href="/account"><button>Account</button></Link>
      <Link href="/my-tournaments"><button>My Tournaments</button></Link>
      <Link href="/tournament/create"><button>Create Tournament</button></Link>
      <Link href="/tournament/join"><button>Join Tournament</button></Link>
    </div>
  );
}
