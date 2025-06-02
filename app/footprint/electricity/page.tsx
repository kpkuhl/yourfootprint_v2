'use client';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../../utils/supabase';
import Link from 'next/link';

export default function ElectricityPage() {
  const { user } = useAuth();
  const [electricity, setElectricity] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('households')
          .select('electricity')
          .eq('user_id', user.id)
          .single();

        if (error) throw error;
        setElectricity(data?.electricity || null);
      } catch (error) {
        console.error('Error fetching electricity data:', error);
        setError('Failed to load electricity data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || electricity === null) return;

    try {
      const { error } = await supabase
        .from('households')
        .upsert({
          user_id: user.id,
          electricity: electricity
        });

      if (error) throw error;
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error updating electricity data:', error);
      setError('Failed to update electricity data');
    }
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
          <h1 className="text-3xl font-bold">Electricity Usage</h1>
        </div>

        {loading ? (
          <div className="text-lg">Loading...</div>
        ) : (
          <div className="bg-white p-6 rounded-lg shadow">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="electricity" className="block text-sm font-medium text-gray-700">
                  Monthly Electricity Usage (kWh)
                </label>
                <input
                  type="number"
                  id="electricity"
                  value={electricity || ''}
                  onChange={(e) => setElectricity(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  required
                />
              </div>

              {error && (
                <div className="text-red-500 text-sm">{error}</div>
              )}

              {success && (
                <div className="text-green-500 text-sm">Data updated successfully!</div>
              )}

              <button
                type="submit"
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Update Electricity Usage
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
} 