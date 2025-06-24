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

type AirTravelData = {
  id?: string;
  household_id: string;
  leave_date: string;
  return_date: string | null;
  roundtrip: boolean;
  num_travelers: number;
  from: string | null;
  to: string | null;
  distance: number | null;
  co2e_kg_traveler: number | null;
  co2e_kg: number;
  direct_co2e_input: boolean;
  co2e_kg_per_trip: number | null;
};

type MonthlyData = {
  id: string;
  month: string;
  CO2e: number;
};

const STORAGE_KEY = 'airTravelFormData';

export default function AirTravelPage() {
  const { user } = useAuth();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [airTravelData, setAirTravelData] = useState<AirTravelData>({
    household_id: '',
    leave_date: '',
    return_date: null,
    roundtrip: false,
    num_travelers: 1,
    from: null,
    to: null,
    distance: null,
    co2e_kg_traveler: null,
    co2e_kg: 0,
    direct_co2e_input: false,
    co2e_kg_per_trip: null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isNewEntry, setIsNewEntry] = useState(true);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [rawData, setRawData] = useState<AirTravelData[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AirTravelData | null>(null);
  const [monthlyTotals, setMonthlyTotals] = useState<{ [key: string]: { sum: number; count: number } }>({});
  const [totalEmissions, setTotalEmissions] = useState<number>(0);
  const [numberOfMonths, setNumberOfMonths] = useState<number>(0);
  const [overallAverage, setOverallAverage] = useState<number>(0);

  // Load saved form data from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        try {
          const parsedData = JSON.parse(savedData);
          setAirTravelData(parsedData);
        } catch (e) {
          console.error('Error parsing saved form data:', e);
        }
      }
    }
  }, []);

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && airTravelData.household_id) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(airTravelData));
    }
  }, [airTravelData]);

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
        .from('air_travel')
        .select('*')
        .eq('household_id', householdId)
        .order('leave_date', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned" error
        console.error('Error fetching data:', error);
        return;
      }
      
      if (data) {
        setAirTravelData(data);
      } else {
        const today = new Date();
        setAirTravelData({
          household_id: householdId,
          leave_date: today.toISOString().split('T')[0],
          return_date: null,
          roundtrip: false,
          num_travelers: 1,
          from: null,
          to: null,
          distance: null,
          co2e_kg_traveler: null,
          co2e_kg: 0,
          direct_co2e_input: false,
          co2e_kg_per_trip: null
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
        .from('air_travel')
        .select('*')
        .eq('household_id', householdId)
        .order('leave_date', { ascending: true });

      if (error) {
        console.error('Error fetching air travel data:', error);
        return;
      }

      setRawData(data || []);

      // Get the date range
      const dates = data.map(entry => new Date(entry.leave_date));
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
        const monthKey = new Date(entry.leave_date).toLocaleString('default', { month: 'long', year: 'numeric' });
        const monthData = monthlyMap.get(monthKey);
        if (monthData) {
          monthData.sum += entry.co2e_kg;
          monthData.count += 1;
        }
      });

      // Convert to array and calculate averages
      const monthlyValues = Array.from(monthlyMap.entries()).map(([month, data]) => ({
        id: month,
        month,
        CO2e: data.sum
      }));

      setMonthlyData(monthlyValues);
    };

    fetchMonthlyData();
  }, [user, householdId]);

  // Add new useEffect to initialize debug values
  useEffect(() => {
    if (user) {
      updateHouseholdAirTravel();
    }
  }, [user]);

  const calculateCO2e = (distance: number | null, num_travelers: number, co2e_kg_traveler: number | null, co2e_kg_per_trip: number | null, direct_co2e_input: boolean): number => {
    if (direct_co2e_input && co2e_kg_per_trip) {
      return co2e_kg_per_trip * num_travelers;
    }
    if (!distance || !co2e_kg_traveler) return 0;
    return distance * num_travelers * co2e_kg_traveler;
  };

  // Update handleSubmit to use household_id
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !householdId) return;

    try {
      setLoading(true);
      setError(null);

      const dataToSubmit = {
        ...airTravelData,
        household_id: householdId
      };

      const { error } = await supabase
        .from('air_travel')
        .insert([dataToSubmit]);

      if (error) throw error;

      // Update household air travel average after successful submission
      await updateHouseholdAirTravel();

      // Refresh data after submission
      const { data: newData, error: fetchError } = await supabase
        .from('air_travel')
        .select('*')
        .eq('household_id', householdId)
        .order('leave_date', { ascending: false });

      if (fetchError) throw fetchError;

      setRawData(newData || []);
      setSuccess('Air travel data saved successfully!');
      
      // Reset form
      setAirTravelData({
        household_id: householdId,
        leave_date: new Date().toISOString().split('T')[0],
        return_date: null,
        roundtrip: false,
        num_travelers: 1,
        from: null,
        to: null,
        distance: null,
        co2e_kg_traveler: null,
        co2e_kg: 0,
        direct_co2e_input: false,
        co2e_kg_per_trip: null
      });
    } catch (error) {
      console.error('Error saving air travel data:', error);
      setError('Failed to save air travel data');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    
    if (type === 'checkbox') {
      if (name === 'roundtrip') {
        setAirTravelData(prev => ({
          ...prev,
          [name]: checked,
          return_date: checked ? prev.leave_date : null
        }));
      } else if (name === 'direct_co2e_input') {
        setAirTravelData(prev => ({
          ...prev,
          [name]: checked,
          co2e_kg_traveler: checked ? null : 0.0002,
          co2e_kg_per_trip: checked ? null : null
        }));
      }
    } else if (name === 'num_travelers' || name === 'distance' || name === 'co2e_kg_traveler' || name === 'co2e_kg_per_trip') {
      const numValue = value === '' ? null : Number(value);
      setAirTravelData(prev => {
        const updated = {
          ...prev,
          [name]: numValue
        };

        // Calculate CO2e based on the input method
        if (updated.direct_co2e_input) {
          if (updated.co2e_kg_per_trip && updated.num_travelers) {
            updated.co2e_kg = calculateCO2e(
              updated.distance,
              updated.num_travelers,
              updated.co2e_kg_traveler,
              updated.co2e_kg_per_trip,
              true
            );
          }
        } else {
          if (updated.distance && updated.num_travelers && updated.co2e_kg_traveler) {
            updated.co2e_kg = calculateCO2e(
              updated.distance,
              updated.num_travelers,
              updated.co2e_kg_traveler,
              updated.co2e_kg_per_trip,
              false
            );
          }
        }

        return updated;
      });
    } else {
      setAirTravelData(prev => ({
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
        .from('air_travel')
        .delete()
        .eq('id', id)
        .eq('household_id', householdId);

      if (error) throw error;

      setRawData(prev => prev.filter(entry => entry.id !== id));
      setMonthlyData(prev => prev.filter(entry => entry.id !== id));
      
      await updateHouseholdAirTravel();
    } catch (error) {
      console.error('Error deleting air travel entry:', error);
      setError('Failed to delete entry. Please try again.');
    }
  };

  const handleEdit = (entry: AirTravelData) => {
    setEditingId(entry.id);
    setEditForm(entry);
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (!editForm) return;

    if (name === 'num_travelers' || name === 'distance' || name === 'co2e_kg_traveler' || name === 'co2e_kg_per_trip') {
      const numValue = value === '' ? null : Number(value);
      setEditForm(prev => {
        const updated = {
          ...prev!,
          [name]: numValue
        };

        // Calculate CO2e based on the input method
        if (updated.direct_co2e_input) {
          if (updated.co2e_kg_per_trip && updated.num_travelers) {
            updated.co2e_kg = calculateCO2e(
              updated.distance,
              updated.num_travelers,
              updated.co2e_kg_traveler,
              updated.co2e_kg_per_trip,
              true
            );
          }
        } else {
          if (updated.distance && updated.num_travelers && updated.co2e_kg_traveler) {
            updated.co2e_kg = calculateCO2e(
              updated.distance,
              updated.num_travelers,
              updated.co2e_kg_traveler,
              updated.co2e_kg_per_trip,
              false
            );
          }
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
      setLoading(true);
      setError(null);

      const dataToSubmit = {
        ...editForm,
        household_id: householdId
      };

      const { error } = await supabase
        .from('air_travel')
        .update(dataToSubmit)
        .eq('id', editingId)
        .eq('household_id', householdId);

      if (error) throw error;

      // Update household air travel average after successful update
      await updateHouseholdAirTravel();

      // Refresh data after update
      const { data: newData, error: fetchError } = await supabase
        .from('air_travel')
        .select('*')
        .eq('household_id', householdId)
        .order('leave_date', { ascending: false });

      if (fetchError) throw fetchError;

      setRawData(newData || []);
      setEditingId(null);
      setEditForm(null);
      setSuccess('Air travel data updated successfully!');
    } catch (error) {
      console.error('Error updating air travel data:', error);
      setError('Failed to update air travel data');
    } finally {
      setLoading(false);
    }
  };

  // Update updateHouseholdAirTravel to use household_id
  const updateHouseholdAirTravel = async () => {
    if (!user || !householdId) return;

    try {
      // Get the last 12 months of data
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      const cutoffDate = twelveMonthsAgo.toISOString().split('T')[0];

      // Fetch air travel data for the last 12 months
      const { data: recentData, error: fetchError } = await supabase
        .from('air_travel')
        .select('*')
        .eq('household_id', householdId)
        .gte('leave_date', cutoffDate)
        .order('leave_date', { ascending: true });

      if (fetchError) {
        console.error('Error fetching recent air travel data:', fetchError);
        throw fetchError;
      }

      if (!recentData || recentData.length === 0) {
        return;
      }

      // Create a map of all months in the range, initialized with zero emissions
      const monthlyTotalsMap: { [key: string]: { sum: number; count: number } } = {};
      const currentDateInRange = new Date(twelveMonthsAgo);
      
      // Count exactly 12 months
      for (let i = 0; i < 12; i++) {
        const monthKey = currentDateInRange.toLocaleString('default', { month: 'long', year: 'numeric' });
        monthlyTotalsMap[monthKey] = { sum: 0, count: 0 };
        currentDateInRange.setMonth(currentDateInRange.getMonth() + 1);
      }

      // Sum up emissions for each month that has travel
      recentData.forEach(entry => {
        const entryDate = new Date(entry.leave_date);
        entryDate.setHours(0, 0, 0, 0);
        const month = entryDate.toLocaleString('default', { month: 'long', year: 'numeric' });
        if (monthlyTotalsMap[month]) {
          monthlyTotalsMap[month].sum += entry.co2e_kg;
          monthlyTotalsMap[month].count += 1;
        }
      });

      // Calculate total emissions and number of months
      const totalEmissionsValue = Object.values(monthlyTotalsMap).reduce((sum, { sum: monthSum }) => sum + monthSum, 0);
      const numberOfMonthsValue = 12; // Always 12 months

      // Calculate average monthly emissions
      const overallAverageValue = totalEmissionsValue / numberOfMonthsValue;

      // Update the household data
      const { error: updateError } = await supabase
        .from('households_data')
        .update({ 
          air_travel: overallAverageValue,
          updated_at: new Date().toISOString()
        })
        .eq('household_id', householdId);

      if (updateError) {
        console.error('Error updating household air travel value:', updateError);
        throw updateError;
      }
    } catch (error) {
      console.error('Error updating household air travel:', error);
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
        text: 'Monthly Air Travel CO2e Emissions'
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
          <h1 className="text-3xl font-bold">Air Travel</h1>
        </div>

        {loading ? (
          <div className="text-lg">Loading...</div>
        ) : (
          <>
            <div className="bg-white p-6 rounded-lg shadow mb-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex items-center mb-4">
                  <input
                    type="checkbox"
                    id="roundtrip"
                    name="roundtrip"
                    checked={airTravelData.roundtrip}
                    onChange={handleChange}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <label htmlFor="roundtrip" className="ml-2 block text-sm text-gray-900">
                    Round Trip
                  </label>
                </div>

                <div className="flex items-center mb-4">
                  <input
                    type="checkbox"
                    id="direct_co2e_input"
                    name="direct_co2e_input"
                    checked={airTravelData.direct_co2e_input}
                    onChange={handleChange}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <label htmlFor="direct_co2e_input" className="ml-2 block text-sm text-gray-900">
                    Enter CO2e directly per trip
                  </label>
                </div>

                <div>
                  <label htmlFor="leave_date" className="block text-sm font-medium text-gray-700">
                    Leave Date
                  </label>
                  <input
                    type="date"
                    id="leave_date"
                    name="leave_date"
                    value={airTravelData.leave_date}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    required
                  />
                </div>

                {airTravelData.roundtrip && (
                  <div>
                    <label htmlFor="return_date" className="block text-sm font-medium text-gray-700">
                      Return Date
                    </label>
                    <input
                      type="date"
                      id="return_date"
                      name="return_date"
                      value={airTravelData.return_date || ''}
                      onChange={handleChange}
                      min={airTravelData.leave_date}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      required
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="num_travelers" className="block text-sm font-medium text-gray-700">
                    Number of Travelers
                  </label>
                  <input
                    type="number"
                    min="1"
                    id="num_travelers"
                    name="num_travelers"
                    value={airTravelData.num_travelers}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="from" className="block text-sm font-medium text-gray-700">
                    From (Airport Code)
                  </label>
                  <input
                    type="text"
                    id="from"
                    name="from"
                    value={airTravelData.from || ''}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    placeholder="e.g., SFO"
                  />
                </div>

                <div>
                  <label htmlFor="to" className="block text-sm font-medium text-gray-700">
                    To (Airport Code)
                  </label>
                  <input
                    type="text"
                    id="to"
                    name="to"
                    value={airTravelData.to || ''}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    placeholder="e.g., JFK"
                  />
                </div>

                {airTravelData.direct_co2e_input ? (
                  <div>
                    <label htmlFor="co2e_kg_per_trip" className="block text-sm font-medium text-gray-700">
                      CO2e per Trip per Traveler (kg)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="co2e_kg_per_trip"
                      name="co2e_kg_per_trip"
                      value={airTravelData.co2e_kg_per_trip || ''}
                      onChange={handleChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      required
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label htmlFor="distance" className="block text-sm font-medium text-gray-700">
                        Distance (miles)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        id="distance"
                        name="distance"
                        value={airTravelData.distance || ''}
                        onChange={handleChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="co2e_kg_traveler" className="block text-sm font-medium text-gray-700">
                        CO2e per Traveler per Mile (kg)
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        id="co2e_kg_traveler"
                        name="co2e_kg_traveler"
                        value={airTravelData.co2e_kg_traveler || ''}
                        onChange={handleChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        required
                      />
                      <p className="mt-1 text-sm text-gray-500">
                        Default value: 0.0002 kg CO2e per mile per traveler
                      </p>
                    </div>
                  </>
                )}

                {error && (
                  <div className="text-red-500 text-sm">{error}</div>
                )}

                {success && (
                  <div className="text-green-500 text-sm">
                    {isNewEntry ? 'New air travel entry added successfully!' : 'Air travel data updated successfully!'}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                >
                  {isNewEntry ? 'Add New Air Travel Entry' : 'Update Air Travel Data'}
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
                <h2 className="text-xl font-bold mb-4">Your Air Travel Data</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Leave Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Return Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Travelers</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">To</th>
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
                                  name="leave_date"
                                  value={editForm?.leave_date}
                                  onChange={handleEditChange}
                                  className="border rounded px-2 py-1"
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {editForm?.roundtrip && (
                                  <input
                                    type="date"
                                    name="return_date"
                                    value={editForm?.return_date || ''}
                                    onChange={handleEditChange}
                                    min={editForm?.leave_date}
                                    className="border rounded px-2 py-1"
                                  />
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="number"
                                  min="1"
                                  name="num_travelers"
                                  value={editForm?.num_travelers || ''}
                                  onChange={handleEditChange}
                                  className="border rounded px-2 py-1 w-24"
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="text"
                                  name="from"
                                  value={editForm?.from || ''}
                                  onChange={handleEditChange}
                                  className="border rounded px-2 py-1 w-24"
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="text"
                                  name="to"
                                  value={editForm?.to || ''}
                                  onChange={handleEditChange}
                                  className="border rounded px-2 py-1 w-24"
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="space-y-2">
                                  <div className="flex items-center">
                                    <input
                                      type="checkbox"
                                      id="edit_direct_co2e_input"
                                      name="direct_co2e_input"
                                      checked={editForm?.direct_co2e_input}
                                      onChange={handleEditChange}
                                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                    />
                                    <label htmlFor="edit_direct_co2e_input" className="ml-2 text-sm text-gray-900">
                                      Direct CO2e input
                                    </label>
                                  </div>
                                  {editForm?.direct_co2e_input ? (
                                    <input
                                      type="number"
                                      step="0.01"
                                      name="co2e_kg_per_trip"
                                      value={editForm?.co2e_kg_per_trip || ''}
                                      onChange={handleEditChange}
                                      className="border rounded px-2 py-1 w-32"
                                      placeholder="CO2e per trip"
                                    />
                                  ) : (
                                    <>
                                      <input
                                        type="number"
                                        step="0.01"
                                        name="distance"
                                        value={editForm?.distance || ''}
                                        onChange={handleEditChange}
                                        className="border rounded px-2 py-1 w-32 mb-2"
                                        placeholder="Distance"
                                      />
                                      <input
                                        type="number"
                                        step="0.0001"
                                        name="co2e_kg_traveler"
                                        value={editForm?.co2e_kg_traveler || ''}
                                        onChange={handleEditChange}
                                        className="border rounded px-2 py-1 w-32"
                                        placeholder="CO2e per mile"
                                      />
                                    </>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {editForm?.co2e_kg.toFixed(2)}
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
                                {formatDate(entry.leave_date)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {entry.return_date ? formatDate(entry.return_date) : 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.num_travelers}</td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.from || 'N/A'}</td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.to || 'N/A'}</td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.co2e_kg.toFixed(2)}</td>
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

            {/* Debug Information */}
            <div className="bg-white p-6 rounded-lg shadow mt-8">
              <h2 className="text-xl font-bold mb-4">Calculation Details</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-700">Monthly Breakdown</h3>
                  <div className="mt-2 space-y-2">
                    {Object.entries(monthlyTotals).map(([month, data]) => (
                      <div key={month} className="flex justify-between items-center">
                        <span className="text-gray-600">{month}</span>
                        <span className="font-mono">{data.sum.toFixed(2)} kg CO2e</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-700">Total Emissions</span>
                    <span className="font-mono">{totalEmissions.toFixed(2)} kg CO2e</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="font-semibold text-gray-700">Number of Months</span>
                    <span className="font-mono">{numberOfMonths}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="font-semibold text-gray-700">Monthly Average</span>
                    <span className="font-mono">{overallAverage.toFixed(2)} kg CO2e</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
} 