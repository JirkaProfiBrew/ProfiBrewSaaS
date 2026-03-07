"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { dismissOnboardingReminder } from "@/modules/onboarding/actions";
import { useRouter } from "next/navigation";

interface DismissReminderButtonProps {
  label: string;
}

export function DismissReminderButton({
  label,
}: DismissReminderButtonProps): React.ReactNode {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDismiss(): void {
    startTransition(async () => {
      await dismissOnboardingReminder();
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDismiss}
      disabled={isPending}
      className="text-blue-900 hover:text-blue-800 dark:text-blue-200 dark:hover:text-blue-100"
    >
      {label}
    </Button>
  );
}
