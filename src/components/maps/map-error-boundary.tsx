"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { MapPinOff } from "lucide-react";

type Props = {
  children: ReactNode;
  title?: string;
};

type State = { hasError: boolean; message: string | null };

/** Tangkap kegagalan render peta / kuota API — hindari crash seluruh halaman ride. */
export class MapLoadErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || "Peta tidak dapat dimuat",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[MapLoadErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert variant="destructive" className="flex items-start gap-2 rounded-2xl">
          <MapPinOff className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">{this.props.title ?? "Peta tidak tersedia"}</p>
            <p className="mt-1 text-sm opacity-90">
              {this.state.message}. Periksa koneksi atau coba refresh halaman.
            </p>
          </div>
        </Alert>
      );
    }
    return this.props.children;
  }
}
