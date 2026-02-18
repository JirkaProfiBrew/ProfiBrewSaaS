"use client";

import { useState, useEffect, useCallback } from "react";
import { getAllContacts } from "./actions";
import type { ContactWithPartner } from "./types";

export function useContacts(filter?: {
  search?: string;
}): {
  data: ContactWithPartner[];
  isLoading: boolean;
  mutate: () => void;
} {
  const [data, setData] = useState<ContactWithPartner[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const result = await getAllContacts(filter);
      setData(result);
    } catch {
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, isLoading, mutate: () => void load() };
}
