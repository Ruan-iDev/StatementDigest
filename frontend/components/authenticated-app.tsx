"use client";

import { Suspense, useEffect, useState } from "react";
import { DesktopTitlebar } from "@/components/desktop-titlebar";
import { AppFooter } from "@/components/app-footer";
import { ProfileProvider } from "@/components/profile-provider";
import { UploadQueueProvider } from "@/components/upload-queue-provider";
import { UploadProgressToast } from "@/components/upload-progress-toast";
import { Sidebar } from "@/components/sidebar";
import { ModuleSubnav } from "@/components/module-subnav";
import { GuestBanner } from "@/components/guest-banner";
import {
  FirstTimeAppGuide,
  resetAppGuideSeenIfForced,
  shouldShowAppGuide,
} from "@/components/first-time-app-guide";
import { TrialGate } from "@/components/trial-gate";
import { LicenseProvider } from "@/components/license-provider";
import { ModuleFlagsProvider } from "@/modules/practice/flags-provider";

/** Full app chrome — only mounted after a session is active. */
export function AuthenticatedApp({ children }: { children: React.ReactNode }) {
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    resetAppGuideSeenIfForced();
    setGuideOpen(shouldShowAppGuide());
  }, []);

  return (
    <LicenseProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <DesktopTitlebar />
        <div className="min-h-0 flex-1 overflow-hidden">
          <TrialGate>
            <ProfileProvider>
              <ModuleFlagsProvider>
                <UploadQueueProvider>
                  <div className="flex h-full overflow-hidden">
                    <Sidebar />
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                      <GuestBanner />
                      <Suspense fallback={null}>
                        <ModuleSubnav />
                      </Suspense>
                      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                        <div className="mx-auto w-full max-w-full p-4 md:p-6 lg:px-8">{children}</div>
                      </main>
                    </div>
                  </div>
                  <UploadProgressToast />
                </UploadQueueProvider>
              </ModuleFlagsProvider>
            </ProfileProvider>
          </TrialGate>
        </div>
        <AppFooter />

        {guideOpen && (
          <FirstTimeAppGuide onFinished={() => setGuideOpen(false)} />
        )}
      </div>
    </LicenseProvider>
  );
}
