import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { TooltipProvider } from "@/components/ui/tooltip";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={300}>
      <App />
    </TooltipProvider>
  </React.StrictMode>
);
