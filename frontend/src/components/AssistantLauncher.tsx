import { useState } from "react";
import { AiChatWidget } from "./AiChatWidget";

// A real, honest version of "an AI guide always on screen": one floating
// button, available everywhere once logged in, that opens the same genuine
// AI assistant used on the dashboard. It does NOT silently watch what a
// person is doing or interrupt them — it only acts when they tap it, which
// matters for user trust and for not being annoying on a small phone screen.
export function AssistantLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="ai-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        aria-expanded={open}
      >
        {open ? "✕" : "💬"}
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: "fixed",
            insetInlineEnd: "var(--space-4)",
            bottom: "calc(88px + env(safe-area-inset-bottom, 0px))",
            width: "min(360px, calc(100vw - 32px))",
            maxHeight: "60vh",
            overflowY: "auto",
            zIndex: 29,
            margin: 0,
          }}
        >
          <AiChatWidget />
        </div>
      )}
    </>
  );
}
