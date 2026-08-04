import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Sidebar } from "@/components/sidebar";
import { UploadQueueProvider } from "@/components/upload-queue-provider";
import { UploadProgressToast } from "@/components/upload-progress-toast";
import { ProfileProvider } from "@/components/profile-provider";
import { AuthProvider } from "@/components/auth-provider";
import { GuestBanner } from "@/components/guest-banner";
import { AppFooter } from "@/components/app-footer";
import { DesktopTitlebar } from "@/components/desktop-titlebar";

export const metadata: Metadata = {
  title: "LedgerFlow",
  description: "Local-first personal finance — statements to ledgers to P&L",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="h-screen overflow-hidden font-sans text-foreground antialiased">
        <ThemeProvider>
          <div className="flex h-screen flex-col overflow-hidden">
            {/* Desktop only: custom drag bar + window controls (no OS chrome) */}
            <DesktopTitlebar />
            <div className="min-h-0 flex-1 overflow-hidden">
              <AuthProvider>
                <ProfileProvider>
                  <UploadQueueProvider>
                    <div className="flex h-full overflow-hidden">
                      <Sidebar />
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                        <GuestBanner />
                        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                          {/* Full main width so dense views (P&amp;L matrix) can use the screen */}
                          <div className="mx-auto w-full max-w-full p-4 md:p-6 lg:px-8">{children}</div>
                        </main>
                      </div>
                    </div>
                    <UploadProgressToast />
                  </UploadQueueProvider>
                </ProfileProvider>
              </AuthProvider>
            </div>
            <AppFooter />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
