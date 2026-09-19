import { SiteHeader } from "./components/layout/SiteHeader";
import { AboutSection } from "./components/sections/AboutSection";
import { BenefitsSection } from "./components/sections/BenefitsSection";
import { ContactSection } from "./components/sections/ContactSection";
import { EventsSection } from "./components/sections/EventsSection";
import { FooterSection } from "./components/sections/FooterSection";
import { HeroSection } from "./components/sections/HeroSection";
import { MembershipSection } from "./components/sections/MembershipSection";
import { useReveal } from "./hooks/useReveal";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { useState } from "react";

function App() {
  useReveal();

  const [pathname, setPathname] = useState(
    () => window.location.pathname,
  );

  function navigate(path) {
    window.history.replaceState({}, "", path);
    setPathname(path);
  }

  const isLoginPage =
    pathname === "/login" ||
    pathname === "/login/";

  const isDashboardPage =
    pathname === "/dashboard" ||
    pathname === "/dashboard/";

  if (isLoginPage) {
    return (
      <LoginPage
        onAuthenticated={() =>
          navigate("/dashboard")
        }
      />
    );
  }

  if (isDashboardPage) {
    return (
      <DashboardPage
        onRequireLogin={() =>
          navigate("/login")
        }
        onLoggedOut={() =>
          navigate("/")
        }
      />
    );
  }

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
        <FooterSection />
      </main>
    </div>
  );
}
export default App;