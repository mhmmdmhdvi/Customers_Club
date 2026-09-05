import { SiteHeader } from "./components/layout/SiteHeader";
import { AboutSection } from "./components/sections/AboutSection";
import { BenefitsSection } from "./components/sections/BenefitsSection";
import { ContactSection } from "./components/sections/ContactSection";
import { EventsSection } from "./components/sections/EventsSection";
import { HeroSection } from "./components/sections/HeroSection";
import { MembershipSection } from "./components/sections/MembershipSection";
import { useReveal } from "./hooks/useReveal";

function App() {
  useReveal();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <HeroSection />
        <BenefitsSection />
        <EventsSection />
        <MembershipSection />
        <AboutSection />
        <ContactSection />
      </main>
    </div>
  );
}
export default App;