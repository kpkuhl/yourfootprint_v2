'use client';
import React, { useEffect, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { useAuth } from './context/AuthContext';
import Link from 'next/link';
import Image from 'next/image';
import FootprintForm from './components/FootprintForm';
import { supabase, hasValidSupabaseConfig } from '../utils/supabase';

ChartJS.register(ArcElement, Tooltip, Legend);

type FootprintData = {
  electricity: number;
  natural_gas: number;
  water: number;
  gasoline: number;
  air_travel: number;
  food: number;
  stuff: number;
  services: number;
};

export default function Home() {
  const { user, signOut } = useAuth();
  const [footprintData, setFootprintData] = useState<FootprintData | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [calculatedFoodCO2e, setCalculatedFoodCO2e] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHouseholdData = async () => {
      if (!user) return;

      try {
        setLoading(true);
        setError(null);

        // First get the household ID for this user
        const { data: householdData, error: householdError } = await supabase
          .from('households')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (householdError) {
          console.error('Error fetching household ID:', householdError);
          throw householdError;
        }

        if (!householdData) {
          throw new Error('No household found for this user');
        }

        // Calculate food CO2e based on actual food entries
        const calculateFoodCO2e = async (householdId: string) => {
          // Get all food entries for this household
          const { data: foodEntries, error: foodError } = await supabase
            .from('food_entries')
            .select('*')
            .eq('household_id', householdId)
            .order('date', { ascending: true });

          if (foodError) {
            console.error('Error fetching food entries:', foodError);
            return null;
          }

          if (!foodEntries || foodEntries.length === 0) {
            return null; // No food data available
          }

          // Calculate total CO2e from all entries
          const totalCO2e = foodEntries
            .filter(entry => entry.co2e && entry.co2e > 0)
            .reduce((sum, entry) => sum + entry.co2e, 0);

          if (totalCO2e === 0) {
            return null;
          }

          // Calculate the time span in weeks
          const dates = foodEntries.map(entry => new Date(entry.date));
          const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
          const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
          
          // Calculate weeks between min and max date (inclusive)
          const timeDiff = maxDate.getTime() - minDate.getTime();
          const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
          const weeksDiff = Math.max(1, daysDiff / 7); // At least 1 week

          // Calculate average weekly CO2e
          const averageWeeklyCO2e = totalCO2e / weeksDiff;

          // Convert to monthly average (4.347 weeks per month)
          const monthlyFoodCO2e = averageWeeklyCO2e * 4.347;

          return monthlyFoodCO2e;
        };

        // Get user's household data
        const { data: userData, error: userDataError } = await supabase
          .from('households_data')
          .select('*')
          .eq('household_id', householdData.id)
          .single();

        if (userDataError && userDataError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
          console.error('Error fetching user footprint data:', userDataError);
          throw userDataError;
        }

        // Get average US data
        const { data: averageData, error: averageDataError } = await supabase
          .from('households_data')
          .select('*')
          .eq('name', 'average us')
          .single();

        if (averageDataError && averageDataError.code !== 'PGRST116') {
          console.error('Error fetching average US data:', averageDataError);
          throw averageDataError;
        }

        // Calculate food CO2e based on actual entries
        const calculatedFoodCO2e = await calculateFoodCO2e(householdData.id);

        // Store user data for label comparison
        setUserData(userData);

        // Store calculated food CO2e
        setCalculatedFoodCO2e(calculatedFoodCO2e);

        // Merge user data with average data, using user data when available
        // For food, use calculated value if available, otherwise fall back to stored value or average
        setFootprintData({
          electricity: userData?.electricity || averageData?.electricity || 0,
          natural_gas: userData?.natural_gas || averageData?.natural_gas || 0,
          water: userData?.water || averageData?.water || 0,
          gasoline: userData?.gasoline || averageData?.gasoline || 0,
          air_travel: userData?.air_travel || averageData?.air_travel || 0,
          food: calculatedFoodCO2e !== null ? calculatedFoodCO2e : (userData?.food || averageData?.food || 0),
          stuff: userData?.stuff || averageData?.stuff || 0,
          services: userData?.services || averageData?.services || 0
        });
      } catch (error) {
        console.error('Error in fetchHouseholdData:', error);
        setError(error instanceof Error ? error.message : 'An error occurred while fetching data');
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchHouseholdData();
    } else {
      setLoading(false);
    }
  }, [user]);

  const formatValue = (value: number | null) => {
    if (value === null || value === undefined) return 'N/A';
    return value.toLocaleString();
  };

  const chartData = footprintData ? {
    labels: [
      userData?.electricity ? 'Electricity' : 'Electricity (avg US)',
      userData?.natural_gas ? 'Natural Gas' : 'Natural Gas (avg US)',
      userData?.water ? 'Water' : 'Water (avg US)',
      userData?.gasoline ? 'Gasoline' : 'Gasoline (avg US)',
      userData?.air_travel ? 'Air Travel' : 'Air Travel (avg US)',
      userData?.food ? 'Food' : 'Food (avg US)',
      userData?.stuff ? 'Stuff' : 'Stuff (avg US)',
      userData?.services ? 'Services' : 'Services (avg US)'
    ],
    datasets: [
      {
        data: [
          footprintData.electricity,
          footprintData.natural_gas,
          footprintData.water,
          footprintData.gasoline,
          footprintData.air_travel,
          footprintData.food,
          footprintData.stuff,
          footprintData.services
        ],
        backgroundColor: [
          '#C0C0C0',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40',
          '#FF6384',
          '#8AC249'
        ],
        borderColor: [
          '#C0C0C0',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40',
          '#FF6384',
          '#8AC249'
        ],
        borderWidth: 1,
      },
    ],
  } : null;

  const chartOptions = {
    plugins: {
      legend: {
        position: 'right' as const,
      },
      title: {
        display: true,
        text: 'Your Monthly Carbon Footprint by Category',
      },
    },
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-24">
        <div className="mb-8">
          <Image
            src="/logo.png"
            alt="Your Footprint Logo"
            width={120}
            height={120}
            className="mx-auto"
          />
        </div>
        <h1 className="text-4xl font-bold mb-8">Welcome to Your Footprint</h1>
        <p className="text-lg mb-8">A calculator to estimate your household's greenhouse gas emissions</p>
        <p className="text-lg mb-8">Please sign in to view your carbon footprint data.</p>
        <Link
          href="/auth/login"
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          Sign In
        </Link>
        {!hasValidSupabaseConfig && (
          <p className="text-yellow-600 text-sm mt-4 text-center max-w-md">
            ⚠️ Supabase configuration missing. Please add environment variables in Vercel settings.
          </p>
        )}
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      <div className="w-full max-w-6xl flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold">Your Household Carbon Footprint</h1>
          <p className="text-lg text-gray-600 mt-2">
            Estimated Monthly kg CO2e: {footprintData ? 
              (footprintData.electricity + footprintData.natural_gas + footprintData.water + 
               footprintData.gasoline + footprintData.air_travel + footprintData.food + footprintData.stuff + footprintData.services).toLocaleString() 
              : 'Loading...'}
          </p>
        </div>
        <button
          onClick={() => signOut()}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Sign Out
        </button>
      </div>

      {loading ? (
        <div className="text-lg">Loading...</div>
      ) : error ? (
        <div className="text-red-500 text-lg">{error}</div>
      ) : (
        <div className="w-full max-w-6xl space-y-8">
          {chartData && (
            <div className="w-full bg-white p-6 rounded-lg shadow">
              <div className="h-96">
                <Pie data={chartData} options={chartOptions} />
              </div>
            </div>
          )}

          <div className="w-full bg-white p-6 rounded-lg shadow">
            <h2 className="text-2xl font-bold mb-4">Update Your Footprint Data</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Link href="/footprint/electricity" className="p-4 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
                <h3 className="font-semibold text-indigo-700">Electricity</h3>
                <p className="text-sm text-gray-600">Update your electricity usage</p>
              </Link>
              <Link href="/footprint/natural-gas" className="p-4 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
                <h3 className="font-semibold text-indigo-700">Natural Gas</h3>
                <p className="text-sm text-gray-600">Update your natural gas usage</p>
              </Link>
              <Link href="/footprint/water" className="p-4 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
                <h3 className="font-semibold text-indigo-700">Water</h3>
                <p className="text-sm text-gray-600">Update your water usage</p>
              </Link>
              <Link href="/footprint/gasoline" className="p-4 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
                <h3 className="font-semibold text-indigo-700">Gasoline</h3>
                <p className="text-sm text-gray-600">Update your gasoline usage</p>
              </Link>
              <Link href="/footprint/air-travel" className="p-4 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
                <h3 className="font-semibold text-indigo-700">Air Travel</h3>
                <p className="text-sm text-gray-600">Update your air travel</p>
              </Link>
              <Link href="/footprint/food" className="p-4 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
                <h3 className="font-semibold text-indigo-700">Food</h3>
                <p className="text-sm text-gray-600">Update your food consumption</p>
              </Link>
              <Link href="/footprint/stuff" className="p-4 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
                <h3 className="font-semibold text-indigo-700">Stuff (coming soon)</h3>
                <p className="text-sm text-gray-600">Update your material consumption</p>
              </Link>
              <Link href="/footprint/services" className="p-4 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
                <h3 className="font-semibold text-indigo-700">Services (coming soon)</h3>
                <p className="text-sm text-gray-600">Update your service consumption</p>
              </Link>
              <Link href="/household/details" className="p-4 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
                <h3 className="font-semibold text-indigo-700">Household Details</h3>
                <p className="text-sm text-gray-600">Update your household information</p>
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
} 