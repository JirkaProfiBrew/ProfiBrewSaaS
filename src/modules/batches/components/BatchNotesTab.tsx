"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Trash2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { addBatchNote, deleteBatchNote } from "../actions";
import type { BatchNote } from "../types";

// ── Helpers ────────────────────────────────────────────────────

function formatDate(date: Date | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Component ──────────────────────────────────────────────────

interface BatchNotesTabProps {
  batchId: string;
  notes: BatchNote[];
  onMutate: () => void;
}

export function BatchNotesTab({
  batchId,
  notes,
  onMutate,
}: BatchNotesTabProps): React.ReactNode {
  const t = useTranslations("batches");
  const tCommon = useTranslations("common");

  const [newNote, setNewNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdd = useCallback(async (): Promise<void> => {
    const text = newNote.trim();
    if (!text) return;

    setIsSubmitting(true);
    try {
      await addBatchNote(batchId, text);
      toast.success(t("notes.added"));
      setNewNote("");
      onMutate();
    } catch (error: unknown) {
      console.error("Failed to add note:", error);
      toast.error(t("notes.addError"));
    } finally {
      setIsSubmitting(false);
    }
  }, [batchId, newNote, onMutate, t]);

  const handleDelete = useCallback(
    async (noteId: string): Promise<void> => {
      try {
        await deleteBatchNote(noteId);
        toast.success(t("notes.deleted"));
        onMutate();
      } catch (error: unknown) {
        console.error("Failed to delete note:", error);
        toast.error(t("notes.deleteError"));
      }
    },
    [onMutate, t]
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Add note */}
      <div className="flex flex-col gap-2">
        <Textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder={t("notes.placeholder")}
          rows={3}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!newNote.trim() || isSubmitting}
            onClick={() => {
              void handleAdd();
            }}
          >
            <Send className="mr-1 size-4" />
            {t("notes.add")}
          </Button>
        </div>
      </div>

      {/* Notes timeline */}
      {notes.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          {t("notes.empty")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="flex items-start gap-3 rounded-lg border p-4"
            >
              <div className="flex-1">
                <p className="whitespace-pre-wrap text-sm">{note.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(note.createdAt)}
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                  >
                    <Trash2 className="size-3 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{tCommon("confirmDelete")}</AlertDialogTitle>
                    <AlertDialogDescription>{tCommon("confirmDeleteDescription")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        void handleDelete(note.id);
                      }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {tCommon("delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
