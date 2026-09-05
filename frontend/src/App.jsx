import { SiteHeader } from "./components/layout/SiteHeader";
import { BenefitsSection } from "./components/sections/BenefitsSection";
import { HeroSection } from "./components/sections/HeroSection";
import { useReveal } from "./hooks/useReveal";

function App() {
  useReveal();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <HeroSection />
        <BenefitsSection />
      </main>
    </div>
  );
}
export default App;