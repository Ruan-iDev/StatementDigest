"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export type DisclaimerContent = {
  version: string;
  title: string;
  body: string;
  short: string;
  profile_public_id?: string | null;
};

type Props = {
  open: boolean;
  content: DisclaimerContent | null;
  fileCount: number;
  busy?: boolean;
  onAccept: () => void;
  onCancel: () => void;
};

export function UploadDisclaimerModal({
  open,
  content,
  fileCount,
  busy,
  onAccept,
  onCancel,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      hideClose
      title={content?.title || "Before you process statements"}
      description="Please read carefully — processing will not start until you accept."
      className="max-w-lg border-[hsl(var(--neon-amber))] shadow-neon-amber"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border-2 border-[hsl(var(--neon-amber)/0.75)] bg-[hsl(var(--neon-amber)/0.12)] px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--neon-amber))]" />
          <div className="min-w-0 space-y-2 text-sm leading-relaxed text-foreground">
            {(content?.body || "")
              .split(/\n\n+/)
              .filter(Boolean)
              .map((para, i) => (
                <p key={i} className={i === 0 ? "font-medium" : "text-muted-foreground"}>
                  {para}
                </p>
              ))}
          </div>
        </div>

        {content?.profile_public_id && (
          <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Profile attestation ID (recorded on Accept): </span>
            <code className="font-mono font-semibold tracking-wide text-foreground">
              {content.profile_public_id}
            </code>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          You are about to process <strong className="text-foreground">{fileCount}</strong> file
          {fileCount === 1 ? "" : "s"}. Full terms:{" "}
          <Link href="/terms" className="underline underline-offset-2" onClick={onCancel}>
            Terms of Use
          </Link>
          {content?.version ? (
            <span className="ml-1 text-[10px] opacity-70">· {content.version}</span>
          ) : null}
        </p>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onAccept}
            disabled={busy || !content}
            className="border-2 border-[hsl(var(--neon-amber)/0.6)] bg-[hsl(var(--neon-amber)/0.2)] text-foreground shadow-[0_0_14px_hsl(var(--neon-amber)/0.3)] hover:bg-[hsl(var(--neon-amber)/0.3)]"
          >
            {busy ? "Recording…" : "Accept & upload"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
