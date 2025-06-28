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
            .eq('user_id', session.user.id);

          if (householdError) {
            console.error('Error checking household:', householdError);
          } else if (!householdData || householdData.length === 0) {
            // No household found, create one
            console.log('No household found for user, creating one...');
            const { data: newHouseholdData, error: createError } = await supabase
              .from('households')
              .insert([{
                user_id: session.user.id,
                created_at: new Date().toISOString()
              }])
              .select()
              .single();

            if (createError) {
              console.error('Error creating household:', createError);
            } else {
              console.log('Household created successfully:', newHouseholdData);
              
              // Create default households_data record
              console.log('Creating households_data for household:', newHouseholdData.id);
              const { data: dataResult, error: dataError } = await supabase
                .from('households_data')
                .insert([{
                  household_id: newHouseholdData.id,
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
                  total_monthly_co2e: 0
                }])
                .select();

              if (dataError) {
                console.error('Error creating households_data:', dataError);
                console.error('Error details:', JSON.stringify(dataError, null, 2));
              } else {
                console.log('Households_data created successfully:', dataResult);
              }
            }
          } else {
            console.log('User already has household(s):', householdData.length);
            // If multiple households exist, log a warning but don't create more
            if (householdData.length > 1) {
              console.warn('User has multiple households - this should not happen:', householdData);
            }
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