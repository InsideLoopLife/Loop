import { Nav } from "@/components/Nav";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";

export function LoopWealthRouteLoading({ label }: { label: string }) {
  return (
    <>
      <Nav />
      <WealthRouteSkeleton label={label} />
    </>
  );
}
