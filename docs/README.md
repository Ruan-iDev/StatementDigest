# LedgerFlow — Project documentation (source of truth)

**Keep these files up to date whenever product decisions or major code change.**  
If a chat/session drops, start here and continue from `TODO.md` + root `devlog.md`.

| Document | Purpose | Update when… |
|----------|---------|----------------|
| [WHAT_IS_THIS_APP.md](./WHAT_IS_THIS_APP.md) | What the product is, who it’s for, non-goals | Vision or audience changes |
| [USER_FLOW.md](./USER_FLOW.md) | Step-by-step florist-friendly user journey | UX or workflow changes |
| [PARSING_AND_PROFILES.md](./PARSING_AND_PROFILES.md) | How the app “reads” a statement (no terminal script) | Parser / bank profile design changes |
| [PARSER_STABILITY.md](./PARSER_STABILITY.md) | **Locked bank islands** + human verification + bulk TBD | Any parser lock or accuracy claim |
| [FILE_TREE.md](./FILE_TREE.md) | What each folder/file does | Structure or ownership changes |
| [TODO.md](./TODO.md) | Living backlog + **next phase** | Every development session |
| [RELEASE_NOTES.md](./RELEASE_NOTES.md) | What shipped per version + future roadmap | Every release / portable build |
| [UPDATES.md](./UPDATES.md) | Version file + OTA channel (when enabled) | Versioning / update hosting |
| [DESKTOP_BUILD.md](./DESKTOP_BUILD.md) | How to package the Windows portable EXE | Build pipeline changes |
| [DECISIONS.md](./DECISIONS.md) | Short log of agreed decisions | After planning agreements |
| [AIBrainSelfTrain.md](./AIBrainSelfTrain.md) | Dev train / ghost feedback loop | Training feature changes |
| [DISCLAIMER_AND_LIABILITY.md](./DISCLAIMER_AND_LIABILITY.md) | Upload Accept gate + acceptance audit | Disclaimer / legal UX |
| [../devlog.md](../devlog.md) | Daily hours + session narrative | End of each work day |

**Last documentation pass:** 2026-08-04 · **shipped app v1.3.0**

## Quick resume (next session)

1. Read **[RELEASE_NOTES.md](./RELEASE_NOTES.md)** (v1.3.0 shipped)  
2. Read **Next phase** in [TODO.md](./TODO.md)  
3. **(1)** Capture Discovery Personal multi-statement data  
4. **(2)** Calibrate Reporting against real numbers  
5. **(3)** Later: bulk Capitec + Nedbank accuracy; OTA channel; code signing  
6. Do **not** edit locked parsers for another bank — [PARSER_STABILITY.md](./PARSER_STABILITY.md)  

## Parser lock snapshot

| Bank | Status | Verified |
|------|--------|----------|
| Discovery Personal | ✅ Locked | 226 · 100% |
| FNB Gold Business | ✅ Locked | 1000+ · 100% |
| Capitec Business | ✅ Locked | Sample; bulk TBD |
| Nedbank Personal | ✅ Locked | Sample; bulk TBD |
