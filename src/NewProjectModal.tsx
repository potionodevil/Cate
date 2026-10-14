/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useEffect, useState } from "react";
import type { Project } from "./types";
import { IconFolder, IconGit } from "./icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModelInput } from "@/components/ModelInput";
import { EmojiPickerButton } from "@/components/EmojiPicker";
import { cn } from "@/lib/utils";
import { CatSprite } from "./CatSprite";

type CreateMode = "folder" | "git";

function formatRelative(ts: number | null): string {
  if (!ts) return "-";
  const diffMs = Date.now() - ts;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `vor ${hours} h`;
  const days = Math.round(hours / 24);
  return `vor ${days} d`;
}

/** Dedicated "New project" dialog — pulled out of the sidebar so the form
 * gets real room (folder picker + git clone flow) instead of being squeezed
 * into a 280px column. Mirrors the Settings overlay's modal pattern.
 *
 * Doubles as the "edit project" dialog when `editProject` is passed: the
 * name/folder/git-clone section is replaced by a read-only folder display
 * (folder can't be changed post-creation) and only Standardeinstellungen +
 * Projekt-Kontext stay editable, submitting via updateProject instead of
 * createProject. */
export function NewProjectModal({
  onClose,
  onCreated,
  onUpdated,
  editProject
}: {
  onClose: () => void;
  onCreated: (p: Project) => void;
  onUpdated?: (p: Project) => void;
  editProject?: Project;
}) {
  const isEdit = !!editProject;

  const [newName, setNewName] = useState(editProject?.name ?? "");
  const [newFolder, setNewFolder] = useState(editProject?.folder ?? "");
  const [createMode, setCreateMode] = useState<CreateMode>("folder");
  const [gitUrl, setGitUrl] = useState("");
  const [gitDestParent, setGitDestParent] = useState("");
  const [cloning, setCloning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Standardeinstellungen (Feature B) — collapsed by default, so the dialog
  // doesn't get overwhelming for the common "just a name + folder" case.
  const [icon, setIcon] = useState(editProject?.icon ?? "");
  const [defaultModel, setDefaultModel] = useState(editProject?.defaultModel ?? "");
  const [modelGroups, setModelGroups] = useState<{ provider: string; models: string[] }[]>([]);

  // Projekt-Kontext (Feature D) — only relevant in edit mode, since a brand
  // new project has no id to attach context to yet.
  const [contextInfo, setContextInfo] = useState<{ hasContext: boolean; sourceLabel: string | null; updatedAt: number | null } | null>(
    null
  );
  const [contextText, setContextText] = useState("");
  const [contextBusy, setContextBusy] = useState(false);

  useEffect(() => {
    window.harness.listCachedModels().then(setModelGroups);
  }, []);

  useEffect(() => {
    if (!editProject) return;
    window.harness.getProjectContext(editProject.id).then((info) => {
      setContextInfo({ hasContext: info.hasContext, sourceLabel: info.sourceLabel, updatedAt: info.updatedAt });
      if (info.preview) setContextText(info.preview);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editProject?.id]);

  async function browseFolder() {
    const picked = await window.harness.pickFolder();
    if (picked) {
      setNewFolder(picked);
      setError(null);
    }
  }

  async function browseGitDest() {
    const picked = await window.harness.pickFolder();
    if (picked) {
      setGitDestParent(picked);
      setError(null);
    }
  }

  async function cloneRepo() {
    if (!gitUrl.trim() || !gitDestParent.trim()) {
      setError("Repository-URL und Zielordner sind Pflicht.");
      return;
    }
    setCloning(true);
    setError(null);
    try {
      const result = await window.harness.cloneRepo(gitUrl.trim(), gitDestParent.trim());
      if (!result.ok || !result.path) {
        setError("Klonen fehlgeschlagen: " + result.message);
        return;
      }
      setNewFolder(result.path);
      if (!newName.trim()) {
        const folderName = result.path.split(/[\\/]/).pop() || "";
        setNewName(folderName);
      }
    } finally {
      setCloning(false);
    }
  }

  async function submit() {
    if (isEdit && editProject) {
      if (!newName.trim()) {
        setError("Name ist Pflicht.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const updated = await window.harness.updateProject(editProject.id, {
          name: newName.trim(),
          icon: icon.trim(),
          defaultModel: defaultModel.trim()
        });
        if ("ok" in updated && (updated as { ok: boolean }).ok === false) {
          setError("Projekt konnte nicht aktualisiert werden.");
          return;
        }
        onUpdated?.(updated as Project);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!newName.trim() || !newFolder.trim()) {
      setError("Name und Ordner sind Pflicht.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { project, hermesProfileResult } = await window.harness.createProject(newName.trim(), newFolder.trim(), {
        icon: icon.trim() || undefined,
        defaultModel: defaultModel.trim() || undefined
      });
      if (!hermesProfileResult.ok) {
        setError("Hermes-Profil konnte nicht angelegt werden: " + hermesProfileResult.message);
        setBusy(false);
        return;
      }
      onCreated(project);
    } finally {
      setBusy(false);
    }
  }

  async function saveContextText() {
    if (!editProject) return;
    setContextBusy(true);
    try {
      await window.harness.setProjectContextText(editProject.id, contextText, "Manuell eingefügt");
      const info = await window.harness.getProjectContext(editProject.id);
      setContextInfo({ hasContext: info.hasContext, sourceLabel: info.sourceLabel, updatedAt: info.updatedAt });
    } finally {
      setContextBusy(false);
    }
  }

  async function attachContextFile() {
    if (!editProject) return;
    const picked = await window.harness.pickContextFile();
    if (!picked) return;
    setContextBusy(true);
    try {
      await window.harness.setProjectContextFile(editProject.id, picked);
      const info = await window.harness.getProjectContext(editProject.id);
      setContextInfo({ hasContext: info.hasContext, sourceLabel: info.sourceLabel, updatedAt: info.updatedAt });
      if (info.preview) setContextText(info.preview);
    } finally {
      setContextBusy(false);
    }
  }

  async function removeContext() {
    if (!editProject) return;
    setContextBusy(true);
    try {
      await window.harness.clearProjectContext(editProject.id);
      setContextInfo({ hasContext: false, sourceLabel: null, updatedAt: null });
      setContextText("");
    } finally {
      setContextBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="hh-newproj max-w-[520px]" aria-label={isEdit ? "Projekt bearbeiten" : "Neues Projekt"}>
        {busy && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-[inherit]"
            style={{ background: "color-mix(in srgb, var(--bg-elevated) 94%, transparent)", fontFamily: "var(--font-brand)" }}
          >
            <CatSprite scale={5} walk />
            <div style={{ fontSize: "var(--text-sm)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {isEdit ? "Speichere" : "Projekt wird angelegt"}
              <span className="hh-cursor" aria-hidden />
            </div>
          </div>
        )}
        <DialogHeader className="hh-newproj-head">
          <span className="hh-newproj-cat" aria-hidden><CatSprite scale={2} minimal /></span>
          <span>
            <DialogTitle>{isEdit ? "Projekt bearbeiten" : "Neues Projekt anlegen"}</DialogTitle>
            <p className="hh-newproj-sub">Ein Projekt bündelt Sessions und Kontext eines Ordners. Cate legt dafür ein eigenes Hermes-Profil an.</p>
          </span>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input autoFocus placeholder="Projektname" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>

          {isEdit ? (
            <div className="flex flex-col gap-1">
              <Label>Ordner</Label>
              <div className="hh-muted text-xs">
                {newFolder} <span className="hh-faint">(nachträglich nicht änderbar)</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label>Quelle</Label>
              <Tabs value={createMode} onValueChange={(v) => setCreateMode(v as CreateMode)}>
                <TabsList>
                  <TabsTrigger value="folder" className="gap-1">
                    <IconFolder size={13} /> Lokaler Ordner
                  </TabsTrigger>
                  <TabsTrigger value="git" className="gap-1">
                    <IconGit size={13} /> Git-Repo
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {createMode === "folder" && (
                <div className="flex gap-2">
                  <Input placeholder="Ordnerpfad" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} className="flex-1" />
                  <Button size="sm" className="shrink-0" onClick={browseFolder} title="Ordner durchsuchen">
                    Durchsuchen
                  </Button>
                </div>
              )}

              {createMode === "git" && (
                <div className="flex flex-col gap-2">
                  <Input placeholder="https://github.com/user/repo.git" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} />
                  <div className="flex gap-2">
                    <Input
                      placeholder="Zielordner (übergeordnet)"
                      value={gitDestParent}
                      onChange={(e) => setGitDestParent(e.target.value)}
                      className="flex-1"
                    />
                    <Button size="sm" className="shrink-0" onClick={browseGitDest} title="Zielordner durchsuchen">
                      Durchsuchen
                    </Button>
                  </div>
                  <Button disabled={cloning} onClick={cloneRepo}>
                    {cloning ? "Klone..." : "Repository klonen"}
                  </Button>
                  {newFolder && <div className="hh-muted text-xs">Geklont nach: {newFolder}</div>}
                </div>
              )}
            </div>
          )}

          <div className="hh-newproj-section">
            <div className="hh-newproj-section-title">Standardeinstellungen <span>optional</span></div>
            {(
              <div className="flex flex-col gap-2">
                <div className="flex gap-2 items-start">
                  <div className="flex flex-col gap-1 w-[130px]">
                    <Label>Icon</Label>
                    <div className="flex gap-1 items-center">
                      <Input placeholder="z. B. 🚀" maxLength={4} value={icon} onChange={(e) => setIcon(e.target.value)} />
                      <EmojiPickerButton onPick={(e) => setIcon(e)} size={30} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <Label>Standardmodell</Label>
                    <ModelInput
                      placeholder="Standardmodell des Profils"
                      value={defaultModel}
                      onChange={setDefaultModel}
                      groups={modelGroups}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {isEdit && editProject && (
            <div className="flex flex-col gap-2 p-3 bg-[var(--bg-elevated-2)] border border-[var(--border)] rounded-md">
              <Label>Projekt-Kontext</Label>
              <div className="hh-faint text-xs">
                {contextInfo?.hasContext
                  ? `Angehängt: ${contextInfo.sourceLabel}, aktualisiert ${formatRelative(contextInfo.updatedAt)}`
                  : "Kein Kontext hinterlegt."}
              </div>
              <Textarea
                rows={4}
                placeholder="Projektinstruktionen / Notizen einfügen..."
                value={contextText}
                onChange={(e) => setContextText(e.target.value)}
                className="resize-y font-mono text-xs"
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={contextBusy} onClick={saveContextText}>
                  Speichern
                </Button>
                <Button size="sm" variant="secondary" disabled={contextBusy} onClick={attachContextFile}>
                  Datei anhängen
                </Button>
                {contextInfo?.hasContext && (
                  <Button size="sm" variant="secondary" disabled={contextBusy} onClick={removeContext}>
                    Entfernen
                  </Button>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs rounded-sm p-2" style={{ color: "var(--danger)", background: "var(--danger-dim)" }}>
              {error}
            </div>
          )}

          <div className="hh-newproj-actions">
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Abbrechen
            </Button>
            <Button disabled={busy} onClick={submit}>
              {busy ? "Speichere..." : isEdit ? "Änderungen speichern" : "Projekt anlegen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
