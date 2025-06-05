'use client';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../../utils/supabase';
import Link from 'next/link';

type HouseholdDetails = {
  name: string;
  members: number;
  square_feet: number;
  vehicles: number;
  zipcode: string;
};

export default function HouseholdDetailsPage() {
  const { user } = useAuth();
  const [details, setDetails] = useState<HouseholdDetails>({
    name: '',
    members: 1,
    square_feet: 0,
    vehicles: 0,
    zipcode: ''
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        // First get the household ID
        const { data: householdData, error: householdError } = await supabase
          .from('households')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (householdError) throw householdError;
        if (!householdData) throw new Error('No household found');

        // Then get the details from households_data
        const { data, error } = await supabase
          .from('households_data')
          .select('name, members, square_feet, vehicles, zipcode')
          .eq('household_id', householdData.id)
          .single();

        // If there's an error other than "no rows returned", throw it
        if (error && error.code !== 'PGRST116') throw error;
        
        // If we have data, use it. Otherwise, keep the default values
        if (data) {
          setDetails({
            name: data.name || '',
            members: data.members || 1,
            square_feet: data.square_feet || 0,
            vehicles: data.vehicles || 0,
            zipcode: data.zipcode || ''
          });
        }
        // If no data exists, we'll keep the default values
      } catch (error) {
        console.error('Error fetching household details:', error);
        setError('Failed to load household details');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      // First get the household ID
      const { data: householdData, error: householdError } = await supabase
        .from('households')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (householdError) throw householdError;
      if (!householdData) throw new Error('No household found');

      // Try to update the record first
      const { error: updateError } = await supabase
        .from('households_data')
        .update({
          household_id: householdData.id,
          ...details,
          updated_at: new Date().toISOString()
        })
        .eq('household_id', householdData.id);

      // If update fails because record doesn't exist, create it
      if (updateError && updateError.code === 'PGRST116') {
        const { error: insertError } = await supabase
          .from('households_data')
          .insert([{
            household_id: householdData.id,
            ...details,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);

        if (insertError) throw insertError;
      } else if (updateError) {
        throw updateError;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error updating household details:', error);
      setError('Failed to update household details');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setDetails(prev => ({
      ...prev,
      [name]: name === 'members' || name === 'square_feet' || name === 'vehicles' 
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
                <label htmlFor="members" className="block text-sm font-medium text-gray-700">
                  Number of Household Members
                </label>
                <input
                  type="number"
                  id="members"
                  name="members"
                  value={details.members}
                  onChange={handleChange}
                  min="1"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="square_feet" className="block text-sm font-medium text-gray-700">
                  Square Footage of Home
                </label>
                <input
                  type="number"
                  id="square_feet"
                  name="square_feet"
                  value={details.square_feet}
                  onChange={handleChange}
                  min="0"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="vehicles" className="block text-sm font-medium text-gray-700">
                  Number of Vehicles
                </label>
                <input
                  type="number"
                  id="vehicles"
                  name="vehicles"
                  value={details.vehicles}
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