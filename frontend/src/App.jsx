import { SiteHeader } from "./components/layout/SiteHeader";
import { HeroSection } from "./components/sections/HeroSection";
import { useReveal } from "./hooks/useReveal";

function App() {
  useReveal();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <HeroSection />
      </main>
    </div>
  );
}
export default App;