import { Nav } from "@/components/Nav";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";

export default function Loading() {
  return (
    <>
      <Nav />
      <WealthRouteSkeleton label="income" />
    </>
  );
}
