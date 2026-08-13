import { Nav } from "@/components/Nav";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";

export default function AppLoading() {
  return (
    <>
      <Nav />
      <WealthRouteSkeleton label="LOOP" />
    </>
  );
}
