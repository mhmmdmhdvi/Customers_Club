import { SiteHeader } from "./components/layout/SiteHeader";

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader/>

      <main>
        <h1 className="sr-only">باشگاه مشتریان</h1>
      </main>
    </div>
  );
}
export default App;