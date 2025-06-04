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

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        return;
      }
      
      // First get the household_id
      const { data: householdData, error: householdError } = await supabase
        .from('households')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (householdError) {
        console.error('Error fetching household data:', householdError);
        return;
      }

      if (householdData) {
        const { data, error } = await supabase
          .from('air_travel')
          .select('*')
          .eq('household_id', householdData.id)
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
            household_id: householdData.id,
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
      }
    };

    fetchData();
  }, [user]);

  useEffect(() => {
    const fetchMonthlyData = async () => {
      if (!user) return;

      // First get the household_id
      const { data: householdData, error: householdError } = await supabase
        .from('households')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (householdError) {
        console.error('Error fetching household data:', householdError);
        return;
      }

      if (!householdData) return;

      const { data, error } = await supabase
        .from('air_travel')
        .select('*')
        .eq('household_id', householdData.id)
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
  }, [user]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // First get the household_id
      const { data: householdData, error: householdError } = await supabase
        .from('households')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (householdError) {
        throw new Error('Error fetching household data');
      }

      if (!householdData) {
        throw new Error('No household found for this user');
      }

      const co2e_kg = calculateCO2e(airTravelData.distance, airTravelData.num_travelers, airTravelData.co2e_kg_traveler, airTravelData.co2e_kg_per_trip, airTravelData.direct_co2e_input);
      
      // Prepare data for submission
      const dataToSubmit = {
        household_id: householdData.id,
        leave_date: airTravelData.leave_date,
        return_date: airTravelData.return_date,
        roundtrip: airTravelData.roundtrip,
        num_travelers: airTravelData.num_travelers,
        from: airTravelData.from,
        to: airTravelData.to,
        distance: airTravelData.distance,
        co2e_kg_traveler: airTravelData.co2e_kg_traveler,
        co2e_kg: co2e_kg
      };

      console.log('Submitting air travel data:', dataToSubmit);

      if (isNewEntry) {
        const { error } = await supabase
          .from('air_travel')
          .insert([dataToSubmit]);

        if (error) {
          console.error('Error inserting air travel data:', error);
          throw error;
        }
      } else {
        const { error } = await supabase
          .from('air_travel')
          .update(dataToSubmit)
          .eq('id', airTravelData.id);

        if (error) {
          console.error('Error updating air travel data:', error);
          throw error;
        }
      }

      await updateHouseholdAirTravel();

      setSuccess('Air travel data saved successfully!');
      setIsNewEntry(true);
      setAirTravelData({
        household_id: householdData.id,
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
      setError(error instanceof Error ? error.message : 'Failed to save air travel data. Please try again.');
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

  const handleDelete = async (id: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('air_travel')
        .delete()
        .eq('id', id);

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

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingId || !editForm) return;

    try {
      const co2e_kg = calculateCO2e(
        editForm.distance,
        editForm.num_travelers,
        editForm.co2e_kg_traveler,
        editForm.co2e_kg_per_trip,
        editForm.direct_co2e_input
      );

      // Prepare data for submission
      const dataToSubmit = {
        household_id: editForm.household_id,
        leave_date: editForm.leave_date,
        return_date: editForm.return_date,
        roundtrip: editForm.roundtrip,
        num_travelers: editForm.num_travelers,
        from: editForm.from,
        to: editForm.to,
        distance: editForm.distance,
        co2e_kg_traveler: editForm.co2e_kg_traveler,
        co2e_kg: co2e_kg
      };

      console.log('Updating air travel data:', dataToSubmit);

      const { error } = await supabase
        .from('air_travel')
        .update(dataToSubmit)
        .eq('id', editingId);

      if (error) {
        console.error('Error updating air travel entry:', error);
        throw error;
      }

      setRawData(prev =>
        prev.map(entry =>
          entry.id === editingId ? { ...editForm, co2e_kg } : entry
        )
      );

      setMonthlyData(prev =>
        prev.map(entry =>
          entry.id === editingId
            ? {
                ...entry,
                CO2e: co2e_kg
              }
            : entry
        )
      );

      await updateHouseholdAirTravel();

      setEditingId(null);
      setEditForm(null);
    } catch (error) {
      console.error('Error updating air travel entry:', error);
      setError('Failed to update entry. Please try again.');
    }
  };

  const updateHouseholdAirTravel = async () => {
    if (!user) return;

    try {
      // First get the household_id
      const { data: householdData, error: householdError } = await supabase
        .from('households')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (householdError) {
        console.error('Error fetching household data:', householdError);
        return;
      }

      if (!householdData) return;

      // First get all air travel data to find the date range
      const { data: allData, error: allDataError } = await supabase
        .from('air_travel')
        .select('*')
        .eq('household_id', householdData.id)
        .order('leave_date', { ascending: true });

      if (allDataError) {
        console.error('Error fetching all air travel data:', allDataError);
        throw allDataError;
      }

      if (!allData || allData.length === 0) {
        console.log('No air travel data found');
        // Update household with zero emissions
        const { error: updateError } = await supabase
          .from('households')
          .update({ air_travel: 0 })
          .eq('id', householdData.id);
        
        // Reset calculation values
        setMonthlyTotals({});
        setTotalEmissions(0);
        setNumberOfMonths(0);
        setOverallAverage(0);
        return;
      }

      console.log('All air travel data:', allData);

      // Get the current date and calculate the maximum allowed future date (12 months from now)
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0); // Set to start of day
      const maxFutureDate = new Date(currentDate);
      maxFutureDate.setMonth(maxFutureDate.getMonth() + 12);

      // Find the farthest future date in the data, but not beyond maxFutureDate
      const futureDates = allData
        .map(entry => {
          const date = new Date(entry.leave_date);
          date.setHours(0, 0, 0, 0);
          return date;
        })
        .filter(date => date > currentDate && date <= maxFutureDate);

      console.log('Current date:', currentDate);
      console.log('Max future date:', maxFutureDate);
      console.log('Future dates found:', futureDates);

      // If we have future dates, use the farthest one; otherwise use current date
      const endDate = futureDates.length > 0 
        ? new Date(Math.max(...futureDates.map(d => d.getTime())))
        : currentDate;

      // Set end date to the last day of its month
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0);
      endDate.setHours(23, 59, 59, 999);

      // Calculate the start date (12 months before the end date)
      const startDate = new Date(endDate);
      startDate.setMonth(startDate.getMonth() - 11); // Go back 11 months to get 12 months total
      startDate.setDate(1); // Set to first day of month
      startDate.setHours(0, 0, 0, 0);

      console.log('End date for calculation:', endDate);
      console.log('Start date for calculation:', startDate);

      // Get data for the calculated date range
      const { data: recentData, error: fetchError } = await supabase
        .from('air_travel')
        .select('*')
        .eq('household_id', householdData.id)
        .gte('leave_date', startDate.toISOString().split('T')[0])
        .lte('leave_date', endDate.toISOString().split('T')[0])
        .order('leave_date', { ascending: true });

      if (fetchError) {
        console.error('Error fetching recent air travel data:', fetchError);
        throw fetchError;
      }

      console.log('Recent data found:', recentData);

      // Create a map of all months in the range, initialized with zero emissions
      const monthlyTotalsMap: { [key: string]: { sum: number; count: number } } = {};
      const currentDateInRange = new Date(startDate);
      
      // Count exactly 12 months
      for (let i = 0; i < 12; i++) {
        const monthKey = currentDateInRange.toLocaleString('default', { month: 'long', year: 'numeric' });
        monthlyTotalsMap[monthKey] = { sum: 0, count: 0 };
        currentDateInRange.setMonth(currentDateInRange.getMonth() + 1);
      }

      console.log('Initial monthly totals:', monthlyTotalsMap);

      // Sum up emissions for each month that has travel
      recentData.forEach(entry => {
        const entryDate = new Date(entry.leave_date);
        entryDate.setHours(0, 0, 0, 0);
        const month = entryDate.toLocaleString('default', { month: 'long', year: 'numeric' });
        if (monthlyTotalsMap[month]) {
          monthlyTotalsMap[month].sum += entry.co2e_kg;
          monthlyTotalsMap[month].count += 1;
          console.log(`Adding ${entry.co2e_kg} to ${month}, new total: ${monthlyTotalsMap[month].sum}`);
        }
      });

      console.log('Final monthly totals:', monthlyTotalsMap);

      // Calculate total emissions and number of months
      const totalEmissionsValue = Object.values(monthlyTotalsMap).reduce((sum, { sum: monthSum }) => sum + monthSum, 0);
      const numberOfMonthsValue = 12; // Always 12 months

      // Calculate average monthly emissions
      const overallAverageValue = totalEmissionsValue / numberOfMonthsValue;

      console.log('Total emissions:', totalEmissionsValue);
      console.log('Number of months:', numberOfMonthsValue);
      console.log('Calculated overall average:', overallAverageValue);

      // Update state with calculation values
      setMonthlyTotals(monthlyTotalsMap);
      setTotalEmissions(totalEmissionsValue);
      setNumberOfMonths(numberOfMonthsValue);
      setOverallAverage(overallAverageValue);

      const { error: updateError } = await supabase
        .from('households')
        .update({ air_travel: overallAverageValue })
        .eq('id', householdData.id);

      if (updateError) {
        console.error('Error updating household record:', updateError);
        throw updateError;
      }

      console.log('Successfully updated household air travel value:', overallAverageValue);
    } catch (error) {
      console.error('Error in updateHouseholdAirTravel:', error);
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