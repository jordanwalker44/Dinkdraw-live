export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  return new Response('social image route is working', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
    },
  });
}
