"use client";

import { Button } from "@/components/ui/button";
import { Mail, MessageCircle } from "lucide-react";

interface ReceiptShareStubsProps {
  orderId: string;
  customerEmail?: string;
}

/**
 * Placeholders for Resend (email) and Fonnte/Wablas (WhatsApp).
 * Wire to /api/receipt/email and /api/receipt/whatsapp when credentials exist.
 */
export function ReceiptShareStubs({ orderId, customerEmail }: ReceiptShareStubsProps) {
  async function shareEmail() {
    await fetch("/api/receipt/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, to: customerEmail }),
    });
    alert("Stub: Email receipt via Resend — configure RESEND_API_KEY");
  }

  async function shareWhatsApp() {
    await fetch("/api/receipt/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    alert("Stub: WhatsApp via Fonnte/Wablas — configure WA API token");
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={shareEmail}>
        <Mail className="h-4 w-4" /> Email
      </Button>
      <Button variant="outline" size="sm" onClick={shareWhatsApp}>
        <MessageCircle className="h-4 w-4" /> WhatsApp
      </Button>
    </div>
  );
}
