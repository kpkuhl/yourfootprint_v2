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

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

type ElectricityData = {
  id?: string;
  user_id: string;
  start_date: string;
  end_date: string;
  amount_kWh: number;
  CI_kg_kWh: number | null;
  CO2e: number;
};

type ConversionFactor = {
  start_unit: string;
  end_unit: string;
  factor: number;
  data_type: string;
};

type MonthlyData = {
  id: string;
  month: string;
  CO2e: number;
};

const STORAGE_KEY = 'electricity_form_data';

function getMajorityMonth(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Calculate days in each month
  const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0);
  
  const startMonthDays = Math.min(
    end.getDate(),
    new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
  ) - start.getDate() + 1;
  
  const endMonthDays = end.getDate();
  
  // If more days in start month, use start month
  if (startMonthDays > endMonthDays) {
    return startMonth.toISOString().slice(0, 7); // Returns YYYY-MM
  }
  // Otherwise use end month
  return endMonth.toISOString().slice(0, 7);
}

export default function ElectricityPage() {
  const { user } = useAuth();
  const [electricityData, setElectricityData] = useState<ElectricityData>({
    user_id: '',
    start_date: '',
    end_date: '',
    amount_kWh: 0,
    CI_kg_kWh: null,
    CO2e: 0
  });
  const [inputAmount, setInputAmount] = useState<number>(0);
  const [inputUnit, setInputUnit] = useState<string>('kWh');
  const [inputCI, setInputCI] = useState<string>('');  // Store CI as string
  const [conversionFactors, setConversionFactors] = useState<ConversionFactor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isNewEntry, setIsNewEntry] = useState(true);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [rawData, setRawData] = useState<ElectricityData[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ElectricityData | null>(null);

  // Load saved form data from localStorage
  useEffect(() => {
    console.log('Component mounted - checking localStorage');
    if (typeof window !== 'undefined') {
      const savedData = localStorage.getItem(STORAGE_KEY);
      console.log('Retrieved from localStorage:', savedData);
      if (savedData) {
        try {
          const parsedData = JSON.parse(savedData);
          console.log('Parsed data:', parsedData);
          setElectricityData(parsedData);
          setInputAmount(parsedData.amount_kWh);
          setInputUnit('kWh');
        } catch (e) {
          console.error('Error parsing saved form data:', e);
        }
      }
    }
  }, []);

  // Fetch conversion factors
  useEffect(() => {
    const fetchConversionFactors = async () => {
      const { data, error } = await supabase
        .from('conversion_factors')
        .select('*')
        .eq('data_type', 'electricity');

      if (error) {
        console.error('Error fetching conversion factors:', error);
        return;
      }

      setConversionFactors(data || []);
    };

    fetchConversionFactors();
  }, []);

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    console.log('electricityData changed:', electricityData);
    if (typeof window !== 'undefined' && electricityData.user_id) {
      console.log('Saving to localStorage:', electricityData);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(electricityData));
    }
  }, [electricityData]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      
      // Check localStorage first
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        console.log('Found data in localStorage, skipping Supabase fetch');
        return;
      }
      
      console.log('No localStorage data found, fetching from Supabase for user:', user.id);
      const { data, error } = await supabase
        .from('electricity')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error('Error fetching data:', error);
        return;
      }

      console.log('Retrieved data from Supabase:', data);
      
      if (data) {
        setElectricityData(data);
        setInputAmount(data.amount_kWh);
        setInputUnit('kWh');
      } else {
        // Set default values for new entries
        const today = new Date();
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        setElectricityData({
          user_id: user.id,
          start_date: lastMonth.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          amount_kWh: 0,
          CI_kg_kWh: null,
          CO2e: 0
        });
      }
    };

    fetchData();
  }, [user]);

  // Update fetchMonthlyData to include id in monthly data
  useEffect(() => {
    const fetchMonthlyData = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from('electricity')
        .select('*')
        .eq('user_id', user.id)
        .order('start_date', { ascending: true });

      if (error) {
        console.error('Error fetching electricity data:', error);
        return;
      }

      setRawData(data || []);

      // Process data to get monthly values
      const monthlyValues = data.map(entry => ({
        id: entry.id,
        month: getMajorityMonth(entry.start_date, entry.end_date),
        CO2e: entry.CO2e
      }));

      setMonthlyData(monthlyValues);
    };

    fetchMonthlyData();
  }, [user]);

  const convertToKWh = (amount: number, fromUnit: string): number => {
    if (fromUnit === 'kWh') return amount;
    
    const conversion = conversionFactors.find(
      cf => cf.start_unit === fromUnit && cf.end_unit === 'kWh'
    );
    
    if (!conversion) {
      console.error(`No conversion factor found for ${fromUnit} to kWh`);
      return amount;
    }
    
    return amount * conversion.factor;
  };

  const calculateCO2e = (amount_kWh: number, CI_kg_kWh: number | null): number => {
    // If no carbon intensity provided, use a default value
    const defaultCI = 0.0004; // kg CO2e/kWh (double precision)
    return amount_kWh * (CI_kg_kWh || defaultCI);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const amount_kWh = convertToKWh(inputAmount, inputUnit);
      const CI_kg_kWh = inputCI === '' ? null : Number(inputCI);
      const CO2e = calculateCO2e(amount_kWh, CI_kg_kWh);

      const { error } = await supabase
        .from('electricity')
        .insert([{
          user_id: user.id,
          start_date: electricityData.start_date,
          end_date: electricityData.end_date,
          amount_kWh: Number(amount_kWh),
          CI_kg_kWh: CI_kg_kWh,
          CO2e: Number(CO2e)
        }]);

      if (error) throw error;

      setSuccess('Electricity data saved successfully!');
      // Clear localStorage after successful submission
      localStorage.removeItem(STORAGE_KEY);
      // Reset form with default values
      const today = new Date();
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      setElectricityData({
        user_id: user.id,
        start_date: lastMonth.toISOString().split('T')[0],
        end_date: today.toISOString().split('T')[0],
        amount_kWh: 0,
        CI_kg_kWh: null,
        CO2e: 0
      });
      setInputAmount(0);
      setInputUnit('kWh');
      setInputCI('');
      setIsNewEntry(true);
    } catch (error) {
      console.error('Error saving electricity data:', error);
      setError('Failed to save electricity data');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    console.log('Form field changed:', name, value);
    
    if (name === 'amount') {
      setInputAmount(value === '' ? 0 : Number(value));
    } else if (name === 'unit') {
      setInputUnit(value);
    } else if (name === 'CI_kg_kWh') {
      setInputCI(value);  // Store as string
    } else {
      setElectricityData(prev => ({
        ...prev,
        [name]: value
      }));
    }
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
        text: 'Monthly Electricity CO2e Emissions'
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

  const handleDelete = async (id: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('electricity')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      // Refresh data after deletion
      setRawData(prev => prev.filter(entry => entry.id !== id));
      setMonthlyData(prev => prev.filter(entry => entry.id !== id));
    } catch (error) {
      console.error('Error deleting entry:', error);
      setError('Failed to delete entry');
    }
  };

  const handleEdit = (entry: ElectricityData) => {
    setEditingId(entry.id);
    setEditForm(entry);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingId || !editForm) return;

    try {
      const { error } = await supabase
        .from('electricity')
        .update({
          start_date: editForm.start_date,
          end_date: editForm.end_date,
          amount_kWh: editForm.amount_kWh,
          CI_kg_kWh: editForm.CI_kg_kWh,
          CO2e: editForm.CO2e
        })
        .eq('id', editingId)
        .eq('user_id', user.id);

      if (error) throw error;

      // Refresh data after update
      setRawData(prev => prev.map(entry => 
        entry.id === editingId ? editForm : entry
      ));
      setMonthlyData(prev => prev.map(entry => 
        entry.id === editingId ? {
          id: entry.id,
          month: getMajorityMonth(editForm.start_date, editForm.end_date),
          CO2e: editForm.CO2e
        } : entry
      ));

      setEditingId(null);
      setEditForm(null);
      setSuccess('Entry updated successfully!');
    } catch (error) {
      console.error('Error updating entry:', error);
      setError('Failed to update entry');
    }
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (!editForm) return;

    setEditForm(prev => ({
      ...prev!,
      [name]: name === 'amount_kWh' || name === 'CI_kg_kWh' || name === 'CO2e' 
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
          <h1 className="text-3xl font-bold">Electricity Usage</h1>
        </div>

        {loading ? (
          <div className="text-lg">Loading...</div>
        ) : (
          <>
            <div className="bg-white p-6 rounded-lg shadow mb-8">
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
                      type="text"
                      inputMode="decimal"
                      id="amount"
                      name="amount"
                      value={inputAmount}
                      onChange={handleChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="unit" className="block text-sm font-medium text-gray-700">
                      Units
                    </label>
                    <select
                      id="unit"
                      name="unit"
                      value={inputUnit}
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
                    type="text"
                    inputMode="decimal"
                    id="CI_kg_kWh"
                    name="CI_kg_kWh"
                    value={inputCI}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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

            {monthlyData.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow mb-8">
                <Line data={chartData} options={chartOptions} />
              </div>
            )}

            {rawData.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-xl font-bold mb-4">Your Electricity Data</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Range</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount (kWh)</th>
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
                                  name="start_date"
                                  value={editForm?.start_date}
                                  onChange={handleEditChange}
                                  className="border rounded px-2 py-1"
                                />
                                <span className="mx-2">to</span>
                                <input
                                  type="date"
                                  name="end_date"
                                  value={editForm?.end_date}
                                  onChange={handleEditChange}
                                  className="border rounded px-2 py-1"
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="text"
                                  name="amount_kWh"
                                  value={editForm?.amount_kWh}
                                  onChange={handleEditChange}
                                  className="border rounded px-2 py-1 w-24"
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="text"
                                  name="CI_kg_kWh"
                                  value={editForm?.CI_kg_kWh || ''}
                                  onChange={handleEditChange}
                                  className="border rounded px-2 py-1 w-24"
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="text"
                                  name="CO2e"
                                  value={editForm?.CO2e}
                                  onChange={handleEditChange}
                                  className="border rounded px-2 py-1 w-24"
                                />
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
                                {new Date(entry.start_date).toLocaleDateString()} to {new Date(entry.end_date).toLocaleDateString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.amount_kWh}</td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.CI_kg_kWh || 'N/A'}</td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.CO2e}</td>
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