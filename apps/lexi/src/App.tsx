import { AppError } from "@lexi/core";

// Placeholder shell for Stage 1 step 1. Proves the app builds against @lexi/core.
export function App() {
  const coreLinked = new AppError("unknown", "probe").code === "unknown";
  return (
    <main className="shell">
      <h1>Lexi</h1>
      <p>Scaffold is running. Core linked: {coreLinked ? "yes" : "no"}.</p>
    </main>
  );
}
