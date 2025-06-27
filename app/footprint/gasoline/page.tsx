'use client';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../../utils/supabase';
import Link from 'next/link';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { encryptHouseholdId, decryptHouseholdId } from '../../../utils/encryption';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

type GasolineData = {
  id?: string;
  household_id: string;
  date: string;
  dollars: number | null;
  dollar_gal: number | null;
  gallons: number;
  CI_kg_gal: number | null;
  CO2e_kg: number;
};

type MonthlyData = {
  id: string;
  month: string;
  CO2e: number;
};

const STORAGE_KEY = 'gasolineFormData';

export default function GasolinePage() {
  const { user } = useAuth();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [gasolineData, setGasolineData] = useState<GasolineData>({
    household_id: '',
    date: '',
    dollars: null,
    dollar_gal: null,
    gallons: 0,
    CI_kg_gal: null,
    CO2e_kg: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isNewEntry, setIsNewEntry] = useState(true);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [rawData, setRawData] = useState<GasolineData[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<GasolineData | null>(null);

  // Load saved form data from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        try {
          const parsedData = JSON.parse(savedData);
          // Decrypt the household ID when loading
          const decryptedData = {
            ...parsedData,
            household_id: decryptHouseholdId(parsedData.household_id)
          };
          setGasolineData(decryptedData);
        } catch (e) {
          console.error('Error parsing saved form data:', e);
        }
      }
    }
  }, []);

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && gasolineData.household_id) {
      // Encrypt the household ID before storing
      const dataToStore = {
        ...gasolineData,
        household_id: encryptHouseholdId(gasolineData.household_id)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToStore));
    }
  }, [gasolineData]);

  // Fetch household ID for the user
  useEffect(() => {
    const fetchHouseholdId = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from('households')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Error fetching household ID:', error);
        return;
      }

      if (data) {
        setHouseholdId(data.id);
      }
    };

    fetchHouseholdId();
  }, [user]);

  // Update fetchData to use household_id
  useEffect(() => {
    const fetchData = async () => {
      if (!user || !householdId) return;
      
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        return;
      }
      
      const { data, error } = await supabase
        .from('gasoline')
        .select('*')
        .eq('household_id', householdId)
        .order('date', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error('Error fetching data:', error);
        return;
      }
      
      if (data) {
        setGasolineData(data);
      } else {
        const today = new Date();
        setGasolineData({
          household_id: householdId,
          date: today.toISOString().split('T')[0],
          dollars: null,
          dollar_gal: null,
          gallons: 0,
          CI_kg_gal: null,
          CO2e_kg: 0
        });
      }
    };

    fetchData();
  }, [user, householdId]);

  // Update fetchMonthlyData to use household_id
  useEffect(() => {
    const fetchMonthlyData = async () => {
      if (!user || !householdId) return;

      const { data, error } = await supabase
        .from('gasoline')
        .select('*')
        .eq('household_id', householdId)
        .order('date', { ascending: true });

      if (error) {
        console.error('Error fetching gasoline data:', error);
        return;
      }

      setRawData(data || []);

      // Get the date range
      const dates = data.map(entry => new Date(entry.date));
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

      // Create a map of all months in the range
      const monthlyMap = new Map<string, { sum: number; count: number }>();
      const currentDate = new Date(minDate);
      while (currentDate <= maxDate) {
        const monthKey = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
        monthlyMap.set(monthKey, { sum: 0, count: 0 });
        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      // Sum up emissions for each month
      data.forEach(entry => {
        const monthKey = new Date(entry.date).toLocaleString('default', { month: 'long', year: 'numeric' });
        const monthData = monthlyMap.get(monthKey);
        if (monthData) {
          monthData.sum += entry.CO2e_kg;
          monthData.count += 1;
        }
      });

      // Convert to array and calculate averages
      const monthlyValues = Array.from(monthlyMap.entries()).map(([month, data]) => ({
        id: month, // Using month as ID since we're aggregating
        month,
        CO2e: data.sum // Using sum instead of average to show total monthly emissions
      }));

      setMonthlyData(monthlyValues);
    };

    fetchMonthlyData();
  }, [user, householdId]);

  const calculateCO2e = (gallons: number, CI_kg_gal: number | null): number => {
    const defaultCI = 9.46; // kg CO2e/gallon for regular gasoline
    return gallons * (CI_kg_gal || defaultCI);
  };

  // Update updateHouseholdGasoline to use household_id
  const updateHouseholdGasoline = async () => {
    if (!user || !householdId) return;

    try {
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      const cutoffDate = twelveMonthsAgo.toISOString().split('T')[0];

      console.log('Fetching gasoline data since:', cutoffDate);

      const { data: recentData, error: fetchError } = await supabase
        .from('gasoline')
        .select('*')
        .eq('household_id', householdId)
        .gte('date', cutoffDate)
        .order('date', { ascending: true });

      if (fetchError) {
        console.error('Error fetching gasoline data:', fetchError);
        throw fetchError;
      }

      if (!recentData || recentData.length === 0) {
        console.log('No gasoline data found for the last 12 months');
        return;
      }

      console.log('Found gasoline data entries:', recentData.length);

      // Group data by month and sum CO2e values for each month
      const monthlyTotals: { [key: string]: number } = {};
      
      recentData.forEach(entry => {
        const month = new Date(entry.date).toLocaleString('default', { month: 'long', year: 'numeric' });
        if (!monthlyTotals[month]) {
          monthlyTotals[month] = 0;
        }
        monthlyTotals[month] += entry.CO2e_kg;
      });

      console.log('Monthly totals:', monthlyTotals);

      // Calculate average of monthly totals
      const monthlyValues = Object.values(monthlyTotals);
      const overallAverage = monthlyValues.reduce((a, b) => a + b, 0) / monthlyValues.length;

      console.log('Calculated overall average:', overallAverage);

      // Try to update the record first
      const { error: updateError } = await supabase
        .from('households_data')
        .update({ 
          gasoline: overallAverage,
          updated_at: new Date().toISOString()
        })
        .eq('household_id', householdId);

      // If update fails because record doesn't exist, create it
      if (updateError && updateError.code === 'PGRST116') {
        const { error: insertError } = await supabase
          .from('households_data')
          .insert([{
            household_id: householdId,
            gasoline: overallAverage,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);

        if (insertError) {
          console.error('Error creating households_data record:', insertError);
          throw insertError;
        }
      } else if (updateError) {
        console.error('Error updating households_data record:', updateError);
        throw updateError;
      }

      console.log('Successfully updated household gasoline average:', overallAverage);
    } catch (error) {
      console.error('Error in updateHouseholdGasoline:', error);
      setError('Failed to update household gasoline average');
    }
  };

  // Update handleSubmit to use household_id
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !householdId) {
      setError('Please sign in to save data');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Calculate gallons from dollars and price per gallon if gallons not provided
      let gallons = gasolineData.gallons;
      if (!gallons && gasolineData.dollars && gasolineData.dollar_gal) {
        gallons = gasolineData.dollars / gasolineData.dollar_gal;
      }

      // Validate required fields
      if (!gallons) {
        throw new Error('Please provide either gallons or both dollars spent and price per gallon');
      }

      if (!gasolineData.date) {
        throw new Error('Please provide a date');
      }

      // Use default CI_kg_gal if not provided
      const CI_kg_gal = gasolineData.CI_kg_gal || 9.46; // Default value for regular gasoline
      const CO2e_kg = calculateCO2e(gallons, CI_kg_gal);

      const dataToSubmit = {
        household_id: householdId,
        date: gasolineData.date,
        dollars: gasolineData.dollars,
        dollar_gal: gasolineData.dollar_gal,
        gallons,
        CI_kg_gal,
        CO2e_kg
      };

      console.log('Submitting data:', dataToSubmit);

      if (isNewEntry) {
        const { data, error } = await supabase
          .from('gasoline')
          .insert([dataToSubmit])
          .select()
          .single();

        if (error) {
          console.error('Error inserting data:', error);
          throw error;
        }
        console.log('Insert successful:', data);
      } else {
        const { data, error } = await supabase
          .from('gasoline')
          .update(dataToSubmit)
          .eq('id', gasolineData.id)
          .select()
          .single();

        if (error) {
          console.error('Error updating data:', error);
          throw error;
        }
        console.log('Update successful:', data);
      }

      await updateHouseholdGasoline();

      setSuccess('Gasoline data saved successfully!');
      setIsNewEntry(true);
      setGasolineData({
        household_id: householdId,
        date: new Date().toISOString().split('T')[0],
        dollars: null,
        dollar_gal: null,
        gallons: 0,
        CI_kg_gal: null,
        CO2e_kg: 0
      });

      // Clear localStorage after successful save
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Error saving gasoline data:', error);
      setError(error instanceof Error ? error.message : 'Failed to save gasoline data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === 'gallons' || name === 'dollars' || name === 'dollar_gal' || name === 'CI_kg_gal') {
      const numValue = value === '' ? null : Number(value);
      setGasolineData(prev => {
        const updated = {
          ...prev,
          [name]: numValue
        };

        // Calculate gallons from dollars and price per gallon if both are provided and gallons is empty
        if (!updated.gallons && updated.dollars && updated.dollar_gal) {
          updated.gallons = updated.dollars / updated.dollar_gal;
        }

        // Calculate CO2e if we have gallons (either directly or calculated)
        if (updated.gallons) {
          updated.CO2e_kg = calculateCO2e(updated.gallons, updated.CI_kg_gal);
        }

        return updated;
      });
    } else {
      setGasolineData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  // Update handleDelete to use household_id
  const handleDelete = async (id: string) => {
    if (!user || !householdId) return;

    try {
      const { error } = await supabase
        .from('gasoline')
        .delete()
        .eq('id', id)
        .eq('household_id', householdId);

      if (error) throw error;

      setRawData(prev => prev.filter(entry => entry.id !== id));
      setMonthlyData(prev => prev.filter(entry => entry.id !== id));

      // Update household gasoline average after successful deletion
      await updateHouseholdGasoline();
    } catch (error) {
      console.error('Error deleting gasoline entry:', error);
      setError('Failed to delete entry. Please try again.');
    }
  };

  const handleEdit = (entry: GasolineData) => {
    setEditingId(entry.id);
    setEditForm(entry);
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (!editForm) return;

    if (name === 'gallons' || name === 'dollars' || name === 'dollar_gal' || name === 'CI_kg_gal') {
      const numValue = value === '' ? null : Number(value);
      setEditForm(prev => {
        const updated = {
          ...prev!,
          [name]: numValue
        };
        if (name === 'gallons' || name === 'CI_kg_gal') {
          updated.CO2e_kg = calculateCO2e(
            name === 'gallons' ? (numValue || 0) : prev!.gallons,
            name === 'CI_kg_gal' ? numValue : prev!.CI_kg_gal
          );
        }
        return updated;
      });
    } else {
      setEditForm(prev => ({
        ...prev!,
        [name]: value
      }));
    }
  };

  // Update handleEditSubmit to use household_id
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !householdId || !editingId || !editForm) return;

    try {
      const { error } = await supabase
        .from('gasoline')
        .update(editForm)
        .eq('id', editingId)
        .eq('household_id', householdId);

      if (error) throw error;

      setRawData(prev =>
        prev.map(entry =>
          entry.id === editingId ? editForm : entry
        )
      );

      setMonthlyData(prev =>
        prev.map(entry =>
          entry.id === editingId
            ? {
                ...entry,
                CO2e: editForm.CO2e_kg
              }
            : entry
        )
      );

      // Update household gasoline average after successful edit
      await updateHouseholdGasoline();

      setEditingId(null);
      setEditForm(null);
    } catch (error) {
      console.error('Error updating gasoline entry:', error);
      setError('Failed to update entry. Please try again.');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Date(date.getTime() + date.getTimezoneOffset() * 60000).toLocaleDateString();
  };

  const chartData = {
    labels: monthlyData.map(d => d.month),
    datasets: [
      {
        label: 'Monthly CO2e (kg)',
        data: monthlyData.map(d => d.CO2e),
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Monthly Gasoline CO2e Emissions'
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'kg CO2e'
        }
      },
      x: {
        title: {
          display: true,
          text: 'Month'
        }
      }
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
          <h1 className="text-3xl font-bold">Gasoline Usage</h1>
        </div>

        {loading ? (
          <div className="text-lg">Loading...</div>
        ) : (
          <>
            <div className="bg-white p-6 rounded-lg shadow mb-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="date" className="block text-sm font-medium text-gray-700">
                    Date
                  </label>
                  <input
                    type="date"
                    id="date"
                    name="date"
                    value={gasolineData.date}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="gallons" className="block text-sm font-medium text-gray-700">
                    Gallons (or leave empty and provide dollars spent and price per gallon)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    id="gallons"
                    name="gallons"
                    value={gasolineData.gallons || ''}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label htmlFor="dollars" className="block text-sm font-medium text-gray-700">
                    Dollars Spent (Required if gallons not provided)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    id="dollars"
                    name="dollars"
                    value={gasolineData.dollars || ''}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label htmlFor="dollar_gal" className="block text-sm font-medium text-gray-700">
                    Price per Gallon (Required if gallons not provided)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    id="dollar_gal"
                    name="dollar_gal"
                    value={gasolineData.dollar_gal || ''}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label htmlFor="CI_kg_gal" className="block text-sm font-medium text-gray-700">
                    Carbon Intensity (kg CO2e/gallon)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    id="CI_kg_gal"
                    name="CI_kg_gal"
                    value={gasolineData.CI_kg_gal || ''}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Default value: 9.46 kg CO2e/gallon
                  </p>
                </div>

                {error && (
                  <div className="text-red-500 text-sm">{error}</div>
                )}

                {success && (
                  <div className="text-green-500 text-sm">
                    {isNewEntry ? 'New gasoline entry added successfully!' : 'Gasoline data updated successfully!'}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                >
                  {isNewEntry ? 'Add New Gasoline Entry' : 'Update Gasoline Data'}
                </button>
              </form>
            </div>

            {monthlyData.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow mb-8">
                <Line data={chartData} options={chartOptions} />
              </div>
            )}

            {rawData.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-xl font-bold mb-4">Your Gasoline Data</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gallons</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dollars</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price/Gal</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Carbon Intensity</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CO2e (kg)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {rawData.map((entry) => (
                        <tr key={entry.id}>
                          {editingId === entry.id ? (
                            <>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="date"
                                  name="date"
                                  value={editForm?.date}
                                  onChange={handleEditChange}
                                  className="border rounded px-2 py-1"
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="number"
                                  step="0.01"
                                  name="gallons"
                                  value={editForm?.gallons || ''}
                                  onChange={handleEditChange}
                                  className="border rounded px-2 py-1 w-24"
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="number"
                                  step="0.01"
                                  name="dollars"
                                  value={editForm?.dollars || ''}
                                  onChange={handleEditChange}
                                  className="border rounded px-2 py-1 w-24"
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="number"
                                  step="0.01"
                                  name="dollar_gal"
                                  value={editForm?.dollar_gal || ''}
                                  onChange={handleEditChange}
                                  className="border rounded px-2 py-1 w-24"
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="number"
                                  step="0.01"
                                  name="CI_kg_gal"
                                  value={editForm?.CI_kg_gal || ''}
                                  onChange={handleEditChange}
                                  className="border rounded px-2 py-1 w-24"
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {editForm?.CO2e_kg.toFixed(2)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <button
                                  onClick={handleEditSubmit}
                                  className="text-green-600 hover:text-green-900 mr-2"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingId(null);
                                    setEditForm(null);
                                  }}
                                  className="text-gray-600 hover:text-gray-900"
                                >
                                  Cancel
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {formatDate(entry.date)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.gallons}</td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.dollars?.toFixed(2) || 'N/A'}</td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.dollar_gal?.toFixed(2) || 'N/A'}</td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.CI_kg_gal?.toFixed(2) || 'N/A'}</td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.CO2e_kg.toFixed(2)}</td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <button
                                  onClick={() => handleEdit(entry)}
                                  className="text-indigo-600 hover:text-indigo-900 mr-2"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(entry.id!)}
                                  className="text-red-600 hover:text-red-900"
                                >
                                  Delete
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
} 