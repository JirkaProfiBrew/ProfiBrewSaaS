"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getPartners,
  getPartnerById,
  getContactsByPartner,
  getAddressesByPartner,
  getBankAccountsByPartner,
} from "./actions";
import type { Partner, Contact, Address, BankAccount } from "./types";

// ── usePartners ─────────────────────────────────────────────────

interface UsePartnersResult {
  data: Partner[];
  isLoading: boolean;
  mutate: () => void;
}

export function usePartners(filter?: {
  search?: string;
  isCustomer?: boolean;
  isSupplier?: boolean;
}): UsePartnersResult {
  const [data, setData] = useState<Partner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const mutate = useCallback((): void => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getPartners(filter)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error("Failed to load partners:", err);
          setData([]);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
    // Serialize filter object for stable dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter?.search, filter?.isCustomer, filter?.isSupplier, refreshKey]);

  return { data, isLoading, mutate };
}

// ── usePartner ──────────────────────────────────────────────────

interface UsePartnerResult {
  data: Partner | null;
  isLoading: boolean;
  mutate: () => void;
}

export function usePartner(id: string): UsePartnerResult {
  const [data, setData] = useState<Partner | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const mutate = useCallback((): void => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (id === "new") {
      setData(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    getPartnerById(id)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error("Failed to load partner:", err);
          setData(null);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [id, refreshKey]);

  return { data, isLoading, mutate };
}

// ── useContacts ─────────────────────────────────────────────────

interface UseContactsResult {
  data: Contact[];
  isLoading: boolean;
  mutate: () => void;
}

export function useContacts(partnerId: string): UseContactsResult {
  const [data, setData] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const mutate = useCallback((): void => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (partnerId === "new") {
      setData([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    getContactsByPartner(partnerId)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error("Failed to load contacts:", err);
          setData([]);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [partnerId, refreshKey]);

  return { data, isLoading, mutate };
}

// ── useAddresses ────────────────────────────────────────────────

interface UseAddressesResult {
  data: Address[];
  isLoading: boolean;
  mutate: () => void;
}

export function useAddresses(partnerId: string): UseAddressesResult {
  const [data, setData] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const mutate = useCallback((): void => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (partnerId === "new") {
      setData([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    getAddressesByPartner(partnerId)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error("Failed to load addresses:", err);
          setData([]);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [partnerId, refreshKey]);

  return { data, isLoading, mutate };
}

// ── useBankAccounts ─────────────────────────────────────────────

interface UseBankAccountsResult {
  data: BankAccount[];
  isLoading: boolean;
  mutate: () => void;
}

export function useBankAccounts(partnerId: string): UseBankAccountsResult {
  const [data, setData] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const mutate = useCallback((): void => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (partnerId === "new") {
      setData([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    getBankAccountsByPartner(partnerId)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error("Failed to load bank accounts:", err);
          setData([]);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [partnerId, refreshKey]);

  return { data, isLoading, mutate };
}
