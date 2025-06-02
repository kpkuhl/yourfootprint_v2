'use client';
import React, { useEffect, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { useAuth } from './context/AuthContext';
import Link from 'next/link';
import FootprintForm from './components/FootprintForm';
import { supabase } from '../utils/supabase';

ChartJS.register(ArcElement, Tooltip, Legend);

type FootprintData = {
  electricity: number;
  natural_gas: number;
  water: number;
  gasoline: number;
  air_travel: number;
  food: number;
  stuff: number;
};

export default function Home() {
  const { user, signOut } = useAuth();
  const [footprintData, setFootprintData] = useState<FootprintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHouseholdData = async () => {
      if (!user) return;

      try {
        // First, fetch the average US household data
        const { data: averageData, error: averageError } = await supabase
          .from('households')
          .select('*')
          .eq('name', 'average us')
          .single();

        if (averageError) {
          console.error('Error fetching average household data:', averageError);
          throw averageError;
        }

        // Then fetch the user's household data
        const { data: userData, error: userError } = await supabase
          .from('households')
          .select('*')
          .eq('user_id', user.id)
          .single();
        
        if (userError && userError.code !== 'PGRST116') { // PGRST116 is "no rows returned" error
          console.error('Error fetching user household:', userError);
          throw userError;
        }

        // Merge user data with average data, using user data when available
        setFootprintData({
          electricity: userData?.electricity || averageData.electricity,
          natural_gas: userData?.natural_gas || averageData.natural_gas,
          water: userData?.water || averageData.water,
          gasoline: userData?.gasoline || averageData.gasoline,
          air_travel: userData?.air_travel || averageData.air_travel,
          food: userData?.food || averageData.food,
          stuff: userData?.stuff || averageData.stuff
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
      'Electricity',
      'Natural Gas',
      'Water',
      'Gasoline',
      'Air Travel',
      'Food',
      'Stuff'
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
          footprintData.stuff
        ],
        backgroundColor: [
          '#C0C0C0',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40',
          '#FF6384'
        ],
        borderColor: [
          '#C0C0C0',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40',
          '#FF6384'
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
        <h1 className="text-4xl font-bold mb-8">Welcome to Your Footprint</h1>
        <p className="text-lg mb-8">Please sign in to view your carbon footprint data.</p>
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
      <div className="w-full max-w-6xl flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Your Carbon Footprint</h1>
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
            <FootprintForm />
          </div>
        </div>
      )}
    </main>
  );
} 