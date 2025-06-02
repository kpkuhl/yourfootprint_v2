'use client';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../../utils/supabase';
import Link from 'next/link';

type ElectricityData = {
  id?: string;
  user_id: string;
  start_date: string;
  end_date: string;
  amount: number;
  units: string;
  CI_kg_kWh: number | null;
};

const STORAGE_KEY = 'electricity_form_data';

export default function ElectricityPage() {
  const { user } = useAuth();
  const [electricityData, setElectricityData] = useState<ElectricityData>({
    user_id: '',
    start_date: '',
    end_date: '',
    amount: 0,
    units: 'kWh',
    CI_kg_kWh: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isNewEntry, setIsNewEntry] = useState(true);

  // Load saved form data from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        try {
          const parsedData = JSON.parse(savedData);
          setElectricityData(parsedData);
        } catch (e) {
          console.error('Error parsing saved form data:', e);
        }
      }
    }
  }, []);

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && electricityData.amount !== 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(electricityData));
    }
  }, [electricityData]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('electricity')
          .select('*')
          .eq('user_id', user.id)
          .order('end_date', { ascending: false })
          .limit(1)
          .single();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows returned" error
        
        if (data) {
          setElectricityData({
            ...data,
            start_date: new Date(data.start_date).toISOString().split('T')[0],
            end_date: new Date(data.end_date).toISOString().split('T')[0]
          });
          setIsNewEntry(false);
        } else {
          // Set default values for new entries
          const today = new Date();
          const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          setElectricityData(prev => ({
            ...prev,
            user_id: user.id,
            start_date: lastMonth.toISOString().split('T')[0],
            end_date: today.toISOString().split('T')[0],
            units: 'kWh'
          }));
          setIsNewEntry(true);
        }
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
    if (!user) return;

    try {
      const { error } = await supabase
        .from('electricity')
        .insert({
          ...electricityData,
          user_id: user.id,
          id: crypto.randomUUID() // Always create a new row
        });

      if (error) throw error;
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      
      // Reset form for new entry
      const today = new Date();
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const newData = {
        ...electricityData,
        id: undefined,
        start_date: lastMonth.toISOString().split('T')[0],
        end_date: today.toISOString().split('T')[0],
        amount: 0,
        CI_kg_kWh: null
      };
      setElectricityData(newData);
      // Clear localStorage after successful submission
      localStorage.removeItem(STORAGE_KEY);
      setIsNewEntry(true);
    } catch (error) {
      console.error('Error updating electricity data:', error);
      setError('Failed to update electricity data');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setElectricityData(prev => ({
      ...prev,
      [name]: name === 'amount' || name === 'CI_kg_kWh' ? Number(value) : value
    }));
  };

  // Clear form data when component unmounts
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
    };
  }, []);

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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="start_date" className="block text-sm font-medium text-gray-700">
                    Start Date
                  </label>
                  <input
                    type="date"
                    id="start_date"
                    name="start_date"
                    value={electricityData.start_date}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="end_date" className="block text-sm font-medium text-gray-700">
                    End Date
                  </label>
                  <input
                    type="date"
                    id="end_date"
                    name="end_date"
                    value={electricityData.end_date}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
                    Amount
                  </label>
                  <input
                    type="number"
                    id="amount"
                    name="amount"
                    value={electricityData.amount}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="units" className="block text-sm font-medium text-gray-700">
                    Units
                  </label>
                  <select
                    id="units"
                    name="units"
                    value={electricityData.units}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    required
                  >
                    <option value="kWh">kWh</option>
                    <option value="MWh">MWh</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="CI_kg_kWh" className="block text-sm font-medium text-gray-700">
                  Carbon Intensity (kg CO2e/kWh)
                </label>
                <input
                  type="number"
                  id="CI_kg_kWh"
                  name="CI_kg_kWh"
                  value={electricityData.CI_kg_kWh || ''}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Optional: Enter the carbon intensity of your electricity. If left blank, we'll use the average for your region.
                </p>
              </div>

              {error && (
                <div className="text-red-500 text-sm">{error}</div>
              )}

              {success && (
                <div className="text-green-500 text-sm">
                  {isNewEntry ? 'New electricity entry added successfully!' : 'Electricity data updated successfully!'}
                </div>
              )}

              <button
                type="submit"
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                {isNewEntry ? 'Add New Electricity Entry' : 'Update Electricity Data'}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
} 