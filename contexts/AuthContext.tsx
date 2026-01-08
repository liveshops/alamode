import { supabase } from '@/utils/supabase';
import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';

interface Profile {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  bio: string | null;
  avatar_url: string | null;
  phone_number: string | null;
  follower_count: number;
  following_count: number;
  liked_items_count: number;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, username: string, displayName: string, phoneNumber?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await loadProfile(user.id);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    username: string,
    displayName: string,
    phoneNumber?: string
  ) => {
    try {
      const normalizedUsername = username.toLowerCase().trim();

      // Check if username is already taken BEFORE creating auth user
      const { data: existingUser, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', normalizedUsername)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking username:', checkError);
        return { error: new Error('Unable to verify username availability. Please try again.') };
      }

      if (existingUser) {
        return { error: new Error('This username is already taken. Please choose a different one.') };
      }

      // Check if email is already registered
      const { data: existingEmail } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle();

      if (existingEmail) {
        return { error: new Error('An account with this email already exists. Please sign in instead.') };
      }

      // Create auth user with metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: normalizedUsername,
            display_name: displayName,
            phone_number: phoneNumber || null,
          },
          emailRedirectTo: 'new1://auth/callback',
        },
      });

      if (authError) {
        console.error('Auth signup error:', authError);
        return { error: authError };
      }

      // If auth user was created, ensure profile exists
      // The trigger should create it, but we'll verify and create if needed
      if (authData?.user) {
        // Small delay to let trigger complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Check if profile was created by trigger
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', authData.user.id)
          .maybeSingle();

        if (!existingProfile) {
          // Manually create profile if trigger failed
          console.log('Profile not created by trigger, creating manually...');
          const { error: profileError } = await supabase
            .from('profiles')
            .insert({
              id: authData.user.id,
              username: normalizedUsername,
              display_name: displayName,
              email: email.toLowerCase().trim(),
              phone_number: phoneNumber || null,
            });

          if (profileError) {
            console.error('Error creating profile:', profileError);
            // Don't fail signup if profile creation fails - user can still use the app
            // and profile might be created on next login attempt
          }
        }
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    try {
      // Redirect to web page for password reset
      // The web page will handle the reset and then deep link back to the app
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://theshumwayshow.com/password-reset-page.html',
      });
      return { error };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const value = {
    user,
    profile,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
