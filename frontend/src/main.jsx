import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/vazirmatn/wght.css";
import "./styles/index.css";
import { ToastProvider } from "./components/ui/ToastProvider";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthProvider";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ToastProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ToastProvider>
  </StrictMode>
);