'use client';

import { use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DesignEditor } from '@/components/editor/DesignEditor';
import { getDesign } from '@/lib/api';

// Full-screen editor. The session's Editor tab lists designs and opens them here.
export default function DesignPage({ params }: { params: Promise<{ designId: string }> }) {
  const { designId } = use(params);
  const router = useRouter();
  // Set when the editor was opened from somewhere specific (e.g. a carousel slide).
  const returnTo = useSearchParams().get('returnTo');

  async function back() {
    if (returnTo && returnTo.startsWith('/')) return router.push(returnTo);
    try {
      const { design } = await getDesign(designId);
      router.push(design.presentation ? '/presentation' : design.session ? `/sessions/${design.session}?tab=editor` : '/studio');
    } catch {
      router.push('/');
    }
  }

  return (
    <div className="h-dvh min-h-[520px]">
      <DesignEditor designId={designId} onBack={back} backLabel="Back" />
    </div>
  );
}
