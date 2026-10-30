// Which deployment is live right now. The installed app asks this to find out whether it is running an old version.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ id: process.env.NEXT_PUBLIC_BUILD_ID ?? "" }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
