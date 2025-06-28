'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, hasValidSupabaseConfig } from '../../utils/supabase';
import { User } from '@supabase/supabase-js';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If Supabase is not configured, skip auth
    if (!hasValidSupabaseConfig) {
      setLoading(false);
      return;
    }

    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch((error) => {
      console.error('Auth session error:', error);
      setLoading(false);
    });

    // Listen for changes on auth state (sign in, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      
      // If user signed in, ensure they have a household
      if (session?.user) {
        try {
          // Check if user has a household
          const { data: householdData, error: householdError } = await supabase
            .from('households')
            .select('id')
            .eq('user_id', session.user.id)
            .single();

          if (householdError && householdError.code === 'PGRST116') {
            // No household found, create one
            console.log('No household found for user, creating one...');
            const { data: householdData, error: createError } = await supabase
              .from('households')
              .insert([{
                user_id: session.user.id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }])
              .select()
              .single();

            if (createError) {
              console.error('Error creating household:', createError);
            } else {
              console.log('Household created successfully for user:', session.user.id);
              
              // Create default households_data record
              const { error: dataError } = await supabase
                .from('households_data')
                .insert([{
                  household_id: householdData.id,
                  name: '',
                  num_members: 1,
                  sq_ft: 0,
                  num_vehicles: 0,
                  zipcode: '',
                  electricity: 0,
                  natural_gas: 0,
                  water: 0,
                  gasoline: 0,
                  air_travel: 0,
                  food: 0,
                  stuff: 0,
                  services: 0,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                }]);

              if (dataError) {
                console.error('Error creating households_data:', dataError);
              } else {
                console.log('Households_data created successfully for household:', householdData.id);
              }
            }
          } else if (householdError) {
            console.error('Error checking household:', householdError);
          }
        } catch (error) {
          console.error('Error in household check/creation:', error);
        }
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (hasValidSupabaseConfig) {
      await supabase.auth.signOut();
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  return useContext(AuthContext);
}; 