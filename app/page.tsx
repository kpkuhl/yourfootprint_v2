'use client';
import React, { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { useAuth } from './context/AuthContext';
import Link from 'next/link';

ChartJS.register(ArcElement, Tooltip, Legend);

type FootprintData = {
  id: number;
  country: string;
  transportation: number;
  home_electricity: number;
  home_natural_gas: number;
  food: number;
  water: number;
  stuff: number;
};

export default function Home() {
  const { user, signOut } = useAuth();
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [footprintData, setFootprintData] = useState<FootprintData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('Component mounted, starting data fetch...');
    let mounted = true;

    async function fetchData() {
      try {
        console.log('Attempting to fetch data from Supabase...');
        console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
        console.log('Supabase Anon Key exists:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
        
        const { data, error } = await supabase
          .from('avg_monthly_household_footprint')
          .select('*')
          .eq('country', 'United States')
          .single();

        console.log('Raw Supabase response:', { data, error });

        if (error) {
          console.error('Supabase error:', error);
          throw error;
        }
        
        if (mounted) {
          console.log('Data received, updating state...');
          setFootprintData(data ? [data] : []);
          setIsConnected(true);
        }
      } catch (error) {
        console.error('Error in fetchData:', error);
        if (mounted) {
          setIsConnected(false);
          setError(error instanceof Error ? error.message : 'An error occurred while fetching data');
        }
      } finally {
        if (mounted) {
          console.log('Fetch complete, setting loading to false');
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      console.log('Component unmounting, cleaning up...');
      mounted = false;
    };
  }, []);

  const formatValue = (value: number | null) => {
    if (value === null || value === undefined) return 'N/A';
    return value.toLocaleString();
  };

  const chartData = footprintData.length > 0 ? {
    labels: [
      'Transportation',
      'Home Electricity',
      'Home Natural Gas',
      'Food',
      'Water',
      'Stuff'
    ],
    datasets: [
      {
        data: [
          footprintData[0].transportation,
          footprintData[0].home_electricity,
          footprintData[0].home_natural_gas,
          footprintData[0].food,
          footprintData[0].water,
          footprintData[0].stuff
        ],
        backgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40'
        ],
        borderColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40'
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
        text: 'US Household Carbon Footprint by Sector',
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
        <h1 className="text-4xl font-bold">US Household Carbon Footprint</h1>
        <button
          onClick={() => signOut()}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Sign Out
        </button>
      </div>
      
      <div className="text-lg mb-8">
        Supabase connection status:{' '}
        {isConnected === null ? (
          <span className="text-gray-500">Checking...</span>
        ) : isConnected ? (
          <span className="text-green-500">Connected</span>
        ) : (
          <span className="text-red-500">Failed to connect</span>
        )}
      </div>

      {loading ? (
        <div className="text-lg">Loading data...</div>
      ) : error ? (
        <div className="text-red-500">Error: {error}</div>
      ) : footprintData.length === 0 ? (
        <div className="text-lg">No data available</div>
      ) : (
        <div className="w-full max-w-6xl flex flex-col md:flex-row gap-8">
          <div className="w-full md:w-1/2">
            <div className="bg-white p-4 rounded-lg shadow">
              {chartData && <Pie data={chartData} options={chartOptions} />}
            </div>
          </div>
          <div className="w-full md:w-1/2">
            <table className="min-w-full bg-white border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-6 py-3 border-b text-left">Category</th>
                  <th className="px-6 py-3 border-b text-right">Value</th>
                  <th className="px-6 py-3 border-b text-left">Unit</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 border-b">Transportation</td>
                  <td className="px-6 py-4 border-b text-right">{formatValue(footprintData[0].transportation)}</td>
                  <td className="px-6 py-4 border-b">kg CO2e/month</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 border-b">Home Electricity</td>
                  <td className="px-6 py-4 border-b text-right">{formatValue(footprintData[0].home_electricity)}</td>
                  <td className="px-6 py-4 border-b">kg CO2e/month</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 border-b">Home Natural Gas</td>
                  <td className="px-6 py-4 border-b text-right">{formatValue(footprintData[0].home_natural_gas)}</td>
                  <td className="px-6 py-4 border-b">kg CO2e/month</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 border-b">Food</td>
                  <td className="px-6 py-4 border-b text-right">{formatValue(footprintData[0].food)}</td>
                  <td className="px-6 py-4 border-b">kg CO2e/month</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 border-b">Water</td>
                  <td className="px-6 py-4 border-b text-right">{formatValue(footprintData[0].water)}</td>
                  <td className="px-6 py-4 border-b">kg CO2e/month</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 border-b">Stuff</td>
                  <td className="px-6 py-4 border-b text-right">{formatValue(footprintData[0].stuff)}</td>
                  <td className="px-6 py-4 border-b">kg CO2e/month</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
} 