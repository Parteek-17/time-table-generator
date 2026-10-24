import { SkeletonBlock } from '../progress.local';

/** Shown while a setup step loads (slow connections). */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <SkeletonBlock className="h-8 w-2/3" />
      <SkeletonBlock className="h-2 w-full" />
      <SkeletonBlock className="h-28 w-full" />
      <SkeletonBlock className="h-64 w-full" />
    </div>
  );
}
