"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  User,
  Session,
  AuthChangeEvent,
} from "@supabase/supabase-js";

export function useUser(): {
  user: User | null;
  loading: boolean;
} {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function loadUser(): Promise<void> {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      setLoading(false);
    }
    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading };
}

export function useSession(): {
  session: Session | null;
  loading: boolean;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function loadSession(): Promise<void> {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setLoading(false);
    }
    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, newSession: Session | null) => {
        setSession(newSession);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return { session, loading };
}
