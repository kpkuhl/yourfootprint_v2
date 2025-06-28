'use client';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../../utils/supabase';
import Link from 'next/link';

type HouseholdDetails = {
  name: string;
  num_members: number;
  sq_ft: number;
  num_vehicles: number;
  zipcode: string;
};

export default function HouseholdDetailsPage() {
  const { user } = useAuth();
  const [details, setDetails] = useState<HouseholdDetails>({
    name: '',
    num_members: 1,
    sq_ft: 0,
    num_vehicles: 0,
    zipcode: ''
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [householdId, setHouseholdId] = useState<string | null>(null);

  useEffect(() => {
    const fetchHouseholdId = async () => {
      if (!user) return;

      try {
        console.log('Fetching household ID for user:', user.id);
        const { data: householdData, error } = await supabase
          .from('households')
          .select('id')
          .eq('user_id', user.id)
          .limit(1)
          .single();

        if (error) {
          console.error('Error fetching household ID:', error);
          
          // If no household exists, create one
          if (error.code === 'PGRST116') {
            console.log('No household found, creating one...');
            const { data: newHousehold, error: createError } = await supabase
              .from('households')
              .insert([{
                user_id: user.id,
                created_at: new Date().toISOString()
              }])
              .select()
              .single();

            if (createError) {
              console.error('Error creating household:', createError);
              setError('Failed to create household');
              setLoading(false);
              return;
            }

            console.log('Household created:', newHousehold);
            setHouseholdId(newHousehold.id);
            
            // Create default households_data record
            const { error: dataError } = await supabase
              .from('households_data')
              .insert([{
                household_id: newHousehold.id,
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
                total_monthly_co2e: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }]);

            if (dataError) {
              console.error('Error creating households_data:', dataError);
            } else {
              console.log('Households_data created for new household');
            }
          } else {
            setError('Failed to fetch household');
            setLoading(false);
          }
          return;
        }

        if (householdData) {
          console.log('Household found:', householdData.id);
          setHouseholdId(householdData.id);
        }
      } catch (error) {
        console.error('Error in fetchHouseholdId:', error);
        setError('Failed to fetch household');
        setLoading(false);
      }
    };

    fetchHouseholdId();
  }, [user]);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!user || !householdId) return;

      try {
        console.log('Fetching household details for household:', householdId);
        const { data, error } = await supabase
          .from('households_data')
          .select('*')
          .eq('household_id', householdId)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching household details:', error);
          setError('Failed to fetch household details');
          setLoading(false);
          return;
        }

        if (data) {
          console.log('Household details found:', data);
          setDetails({
            name: data.name || '',
            num_members: data.num_members || 1,
            num_vehicles: data.num_vehicles || 0,
            zipcode: data.zipcode || '',
            sq_ft: data.sq_ft || 0
          });
        } else {
          console.log('No household details found, using defaults');
          // Set default values if no data exists
          setDetails({
            name: '',
            num_members: 1,
            num_vehicles: 0,
            zipcode: '',
            sq_ft: 0
          });
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error in fetchDetails:', error);
        setError('Failed to fetch household details');
        setLoading(false);
      }
    };

    fetchDetails();
  }, [user, householdId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !householdId) return;

    try {
      console.log('Saving household details:', details);
      
      // First check if households_data record exists
      const { data: existingData, error: checkError } = await supabase
        .from('households_data')
        .select('id')
        .eq('household_id', householdId)
        .single();

      if (checkError && checkError.code === 'PGRST116') {
        // Record doesn't exist, create it
        console.log('Creating new households_data record');
        const { error: insertError } = await supabase
          .from('households_data')
          .insert([{
            household_id: householdId,
            name: details.name,
            num_members: details.num_members,
            sq_ft: details.sq_ft,
            num_vehicles: details.num_vehicles,
            zipcode: details.zipcode,
            electricity: 0,
            natural_gas: 0,
            water: 0,
            gasoline: 0,
            air_travel: 0,
            food: 0,
            stuff: 0,
            services: 0,
            total_monthly_co2e: 0
          }]);

        if (insertError) {
          console.error('Error creating households_data:', insertError);
          throw insertError;
        }
        
        console.log('Households_data record created successfully');
      } else if (checkError) {
        console.error('Error checking existing households_data:', checkError);
        throw checkError;
      } else {
        // Record exists, update it
        console.log('Updating existing households_data record');
        const { error: updateError } = await supabase
          .from('households_data')
          .update({
            name: details.name,
            num_members: details.num_members,
            sq_ft: details.sq_ft,
            num_vehicles: details.num_vehicles,
            zipcode: details.zipcode
          })
          .eq('household_id', householdId);

        if (updateError) {
          console.error('Error updating households_data:', updateError);
          throw updateError;
        }
        
        console.log('Households_data record updated successfully');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving household details:', error);
      setError('Failed to save household details');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setDetails(prev => ({
      ...prev,
      [name]: name === 'num_members' || name === 'sq_ft' || name === 'num_vehicles' 
        ? Number(value) 
        : value
    }));
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-24">
        <h1 className="text-4xl font-bold mb-8">Please sign in to continue</h1>
        <Link
          href="/auth/login"
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      <div className="w-full max-w-2xl">
        <div className="flex items-center mb-8">
          <Link href="/" className="text-indigo-600 hover:text-indigo-800 mr-4">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold">Household Details</h1>
        </div>

        {loading ? (
          <div className="text-lg">Loading...</div>
        ) : (
          <div className="bg-white p-6 rounded-lg shadow">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Household Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={details.name}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="num_members" className="block text-sm font-medium text-gray-700">
                  Number of Household Members
                </label>
                <input
                  type="number"
                  id="num_members"
                  name="num_members"
                  value={details.num_members}
                  onChange={handleChange}
                  min="1"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="sq_ft" className="block text-sm font-medium text-gray-700">
                  Square Footage of Home
                </label>
                <input
                  type="number"
                  id="sq_ft"
                  name="sq_ft"
                  value={details.sq_ft}
                  onChange={handleChange}
                  min="0"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="num_vehicles" className="block text-sm font-medium text-gray-700">
                  Number of Vehicles
                </label>
                <input
                  type="number"
                  id="num_vehicles"
                  name="num_vehicles"
                  value={details.num_vehicles}
                  onChange={handleChange}
                  min="0"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="zipcode" className="block text-sm font-medium text-gray-700">
                  ZIP Code
                </label>
                <input
                  type="text"
                  id="zipcode"
                  name="zipcode"
                  value={details.zipcode}
                  onChange={handleChange}
                  pattern="[0-9]{5}"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  required
                />
              </div>

              {error && (
                <div className="text-red-500 text-sm">{error}</div>
              )}

              {success && (
                <div className="text-green-500 text-sm">Household details updated successfully!</div>
              )}

              <button
                type="submit"
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Update Household Details
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
} 